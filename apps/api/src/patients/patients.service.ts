import { Injectable } from '@nestjs/common';
import { FamilyMember, PatientProfile, Prisma, User } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { forbidden, notFound } from '../common/http/errors';
import { ReqCtx } from '../common/http/request-context';
import { Paginated, pageParams } from '../common/http/response';
import { PrismaService } from '../common/prisma.service';
import { AuthUser, primaryRole } from '../rbac/auth-user';
import { ScopeService } from '../rbac/scope.service';
import { createFamilyMemberSchema, listPatientsQuery, updateProfileSchema, updateFamilyMemberSchema } from './patients.schemas';

type ProfileWithUser = PatientProfile & { user: Pick<User, 'id' | 'fullName' | 'email' | 'phone' | 'emailVerifiedAt'> };

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
  ) {}

  /** Identity numbers never leave the API in clear text: masked (••••1234) everywhere. */
  private profileDto(p: ProfileWithUser) {
    const { passportNumberEnc, nidNumberEnc, userId: _u, deletedAt: _d, user, ...rest } = p;
    return {
      ...rest,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      emailVerified: !!user.emailVerifiedAt,
      passportNumber: this.crypto.maskField(passportNumberEnc),
      nidNumber: this.crypto.maskField(nidNumberEnc),
    };
  }

  private familyDto(f: FamilyMember) {
    const { passportNumberEnc, nidNumberEnc, deletedAt: _d, ...rest } = f;
    return { ...rest, passportNumber: this.crypto.maskField(passportNumberEnc), nidNumber: this.crypto.maskField(nidNumberEnc) };
  }

  private enc(v: string | null | undefined) {
    return v === undefined ? undefined : v === null ? null : this.crypto.encryptField(v);
  }

  private include = { user: { select: { id: true, fullName: true, email: true, phone: true, emailVerifiedAt: true } } } as const;

  private requireProfileId(user: AuthUser) {
    if (!user.patientProfileId) throw forbidden('This area is for patients.');
    return user.patientProfileId;
  }

  // ─────────── patient: own profile ───────────

  async getMine(user: AuthUser) {
    const p = await this.prisma.patientProfile.findFirstOrThrow({ where: { id: this.requireProfileId(user), deletedAt: null }, include: this.include });
    return this.profileDto(p);
  }

  async updateMine(user: AuthUser, dto: z.infer<typeof updateProfileSchema>, ctx: ReqCtx) {
    const id = this.requireProfileId(user);
    const { fullName, passportNumber, nidNumber, ...rest } = dto;
    const data: Prisma.PatientProfileUpdateInput = {
      ...rest,
      country: rest.countryId === undefined ? undefined : rest.countryId === null ? { disconnect: true } : { connect: { id: rest.countryId } },
      passportNumberEnc: this.enc(passportNumber),
      nidNumberEnc: this.enc(nidNumber),
    };
    delete (data as { countryId?: unknown }).countryId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.patientProfile.findUniqueOrThrow({ where: { id } });
      const p = await tx.patientProfile.update({ where: { id }, data, include: this.include });
      if (fullName) await tx.user.update({ where: { id: user.id }, data: { fullName } });
      await this.audit.log(
        {
          actorId: user.id, actorRole: primaryRole(user), action: 'patient.update', resourceType: 'PatientProfile', resourceId: id,
          before, after: p, metadata: { identityChanged: passportNumber !== undefined || nidNumber !== undefined }, ...ctx,
        },
        tx,
      );
      return { ...p, user: { ...p.user, fullName: fullName ?? p.user.fullName } };
    });
    return this.profileDto(updated);
  }

  // ─────────── patient: family members ───────────

  async listFamily(user: AuthUser) {
    const rows = await this.prisma.familyMember.findMany({ where: { patientId: this.requireProfileId(user), deletedAt: null }, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => this.familyDto(r));
  }

  async createFamily(user: AuthUser, dto: z.infer<typeof createFamilyMemberSchema>, ctx: ReqCtx) {
    const patientId = this.requireProfileId(user);
    const { passportNumber, nidNumber, ...rest } = dto;
    const row = await this.prisma.$transaction(async (tx) => {
      const f = await tx.familyMember.create({
        data: { ...rest, patientId, passportNumberEnc: this.enc(passportNumber) ?? undefined, nidNumberEnc: this.enc(nidNumber) ?? undefined },
      });
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'family.create', resourceType: 'FamilyMember', resourceId: f.id, after: f, ...ctx }, tx);
      return f;
    });
    return this.familyDto(row);
  }

  private async ownFamily(user: AuthUser, id: string) {
    const f = await this.prisma.familyMember.findFirst({ where: { id, patientId: this.requireProfileId(user), deletedAt: null } });
    if (!f) throw notFound('We could not find this family member.');
    return f;
  }

  async updateFamily(user: AuthUser, id: string, dto: z.infer<typeof updateFamilyMemberSchema>, ctx: ReqCtx) {
    const before = await this.ownFamily(user, id);
    const { passportNumber, nidNumber, ...rest } = dto;
    const row = await this.prisma.$transaction(async (tx) => {
      const f = await tx.familyMember.update({
        where: { id },
        data: { ...rest, passportNumberEnc: this.enc(passportNumber), nidNumberEnc: this.enc(nidNumber) },
      });
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'family.update', resourceType: 'FamilyMember', resourceId: id, before, after: f, ...ctx }, tx);
      return f;
    });
    return this.familyDto(row);
  }

  async deleteFamily(user: AuthUser, id: string, ctx: ReqCtx) {
    await this.ownFamily(user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.familyMember.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'family.delete', resourceType: 'FamilyMember', resourceId: id, ...ctx }, tx);
    });
  }

  // ─────────── staff ───────────

  async list(user: AuthUser, query: z.infer<typeof listPatientsQuery>) {
    const scope = this.scope.patientWhere(user, 'view');
    if (!scope || !this.scope.isStaff(user)) throw forbidden();
    const { page, pageSize, skip, take } = pageParams(query);
    const q = query.q;
    const where: Prisma.PatientProfileWhereInput = {
      AND: [
        scope,
        q ? { user: { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } } : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.patientProfile.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: this.include }),
      this.prisma.patientProfile.count({ where }),
    ]);
    return new Paginated(rows.map((r) => this.profileDto(r)), { page, pageSize, total });
  }

  async getForStaff(user: AuthUser, id: string, ctx: ReqCtx) {
    const scope = this.scope.patientWhere(user, 'view');
    if (!scope || !this.scope.isStaff(user)) throw forbidden();
    const p = await this.prisma.patientProfile.findFirst({ where: { AND: [{ id }, scope] }, include: this.include });
    if (!p) throw notFound('We could not find this patient.');
    await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'patient.view', resourceType: 'PatientProfile', resourceId: id, ...ctx });
    return this.profileDto(p);
  }
}
