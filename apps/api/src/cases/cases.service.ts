import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { AppError, conflict, forbidden, notFound } from '../common/http/errors';
import { ReqCtx } from '../common/http/request-context';
import { Paginated, pageParams } from '../common/http/response';
import { PrismaService, Tx } from '../common/prisma.service';
import { AuthUser, can, primaryRole } from '../rbac/auth-user';
import { ScopeService } from '../rbac/scope.service';
import {
  PATIENT_CAN_CANCEL, PATIENT_CAN_EDIT_UNTIL, STATUS_LABELS, TERMINAL,
  assignSchema, changeStatusSchema, createCaseSchema, createNoteSchema, listCasesQuery, updateCaseSchema,
} from './cases.schemas';
import { TimelineService } from './timeline.service';

const named = { select: { id: true, name: true, slug: true } } as const;
const caseInclude = {
  treatment: named,
  preferredCountry: named,
  preferredHospital: named,
  selectedHospital: named,
  selectedDoctor: { select: { id: true, fullName: true, slug: true } },
  familyMember: { select: { id: true, fullName: true, relationship: true } },
  patient: { select: { id: true, user: { select: { fullName: true } } } },
  assignments: { where: { unassignedAt: null }, include: { staff: { select: { id: true, fullName: true } } } },
} satisfies Prisma.MedicalCaseInclude;

type CaseRow = Prisma.MedicalCaseGetPayload<{ include: typeof caseInclude }>;

const STAFF_ONLY_KEYS = ['priority', 'selectedDoctorId', 'selectedHospitalId'] as const;
const ROLE_LABEL: Record<string, string> = {
  MEDICAL_COORDINATOR: 'medical coordinator', CASE_MANAGER: 'case manager', VISA_OFFICER: 'visa officer',
  TRAVEL_COORDINATOR: 'travel coordinator', FINANCE: 'billing officer',
};

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
  ) {}

  // ───────────── presentation ─────────────

  private dto(c: CaseRow, staff: boolean) {
    const base = {
      id: c.id,
      caseNumber: c.caseNumber,
      status: c.status,
      statusLabel: STATUS_LABELS[c.status],
      symptoms: c.symptoms,
      medicalHistory: c.medicalHistory,
      currentDiagnosis: c.currentDiagnosis,
      previousTreatment: c.previousTreatment,
      currentMedications: c.currentMedications,
      emergencyInformation: c.emergencyInformation,
      preferredTravelDate: c.preferredTravelDate,
      budgetMin: c.budgetMin?.toNumber() ?? null,
      budgetMax: c.budgetMax?.toNumber() ?? null,
      budgetCurrency: c.budgetCurrency,
      treatment: c.treatment,
      preferredCountry: c.preferredCountry,
      preferredHospital: c.preferredHospital,
      selectedHospital: c.selectedHospital,
      selectedDoctor: c.selectedDoctor,
      familyMember: c.familyMember,
      closedAt: c.closedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
    if (!staff) {
      return { ...base, coordinators: c.assignments.map((a) => ({ role: a.role, name: a.staff.fullName })) };
    }
    return {
      ...base,
      priority: c.priority,
      patient: { id: c.patient.id, fullName: c.patient.user.fullName },
      assignments: c.assignments.map((a) => ({ id: a.id, role: a.role, staff: a.staff, assignedAt: a.assignedAt })),
    };
  }

  // ───────────── helpers ─────────────

  private async loadScoped(user: AuthUser, id: string, action: 'view' | 'edit') {
    const where = this.scope.caseWhere(user, action);
    if (!where) throw forbidden();
    const c = await this.prisma.medicalCase.findFirst({ where: { AND: [{ id }, where] }, include: caseInclude });
    if (!c) throw notFound('We could not find this treatment case.');
    return c;
  }

  private invalid(field: string, message: string) {
    return new AppError(422, 'VALIDATION_FAILED', message, [{ field, message }]);
  }

  private async assertRefs(dto: { treatmentId?: string | null; preferredCountryId?: string | null; preferredHospitalId?: string | null; selectedDoctorId?: string | null; selectedHospitalId?: string | null }) {
    const pub = { status: 'PUBLISHED' as const, deletedAt: null };
    const checks: [string, string | null | undefined, () => Promise<number>][] = [
      ['treatmentId', dto.treatmentId, () => this.prisma.treatment.count({ where: { id: dto.treatmentId!, ...pub } })],
      ['preferredCountryId', dto.preferredCountryId, () => this.prisma.country.count({ where: { id: dto.preferredCountryId!, ...pub } })],
      ['preferredHospitalId', dto.preferredHospitalId, () => this.prisma.hospital.count({ where: { id: dto.preferredHospitalId!, ...pub } })],
      ['selectedHospitalId', dto.selectedHospitalId, () => this.prisma.hospital.count({ where: { id: dto.selectedHospitalId!, ...pub } })],
      ['selectedDoctorId', dto.selectedDoctorId, () => this.prisma.doctor.count({ where: { id: dto.selectedDoctorId!, ...pub, isVerified: true } })],
    ];
    for (const [field, value, count] of checks) {
      if (value && (await count()) === 0) throw this.invalid(field, 'This selection is not available.');
    }
  }

  private async assertOwnFamilyMember(patientId: string, familyMemberId: string | null | undefined) {
    if (!familyMemberId) return;
    const n = await this.prisma.familyMember.count({ where: { id: familyMemberId, patientId, deletedAt: null } });
    if (n === 0) throw this.invalid('familyMemberId', 'Please choose one of your saved family members.');
  }

  private async nextCaseNumber(tx: Tx) {
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('case_number_seq') AS n`;
    return `MC-${new Date().getFullYear()}-${n.toString().padStart(6, '0')}`;
  }

  // ───────────── use cases ─────────────

  async create(user: AuthUser, dto: z.infer<typeof createCaseSchema>, ctx: ReqCtx) {
    if (!user.patientProfileId) throw forbidden('Only patients can start a treatment case.');
    if (!user.emailVerified) throw forbidden('Please confirm your email address before starting a treatment case.', 'EMAIL_NOT_VERIFIED');
    await this.assertRefs(dto);
    await this.assertOwnFamilyMember(user.patientProfileId, dto.familyMemberId);

    const created = await this.prisma.$transaction(async (tx) => {
      const c = await tx.medicalCase.create({
        data: { ...dto, caseNumber: await this.nextCaseNumber(tx), patientId: user.patientProfileId! },
        include: caseInclude,
      });
      await this.timeline.record({ caseId: c.id, type: 'CASE_CREATED', title: 'Your case was created', actorId: user.id, toStatus: 'NEW' }, tx);
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'case.create', resourceType: 'MedicalCase', resourceId: c.id, ...ctx }, tx);
      return c;
    });
    return this.dto(created, false);
  }

  async list(user: AuthUser, query: z.infer<typeof listCasesQuery>) {
    const scope = this.scope.caseWhere(user, 'view');
    if (!scope) throw forbidden();
    const staff = this.scope.isStaff(user);
    const { page, pageSize, skip, take } = pageParams(query);
    const where: Prisma.MedicalCaseWhereInput = {
      AND: [
        scope,
        query.status ? { status: query.status } : {},
        staff && query.priority ? { priority: query.priority } : {},
        query.q
          ? { OR: [{ caseNumber: { contains: query.q, mode: 'insensitive' } }, ...(staff ? [{ patient: { user: { fullName: { contains: query.q, mode: 'insensitive' as const } } } }] : [])] }
          : {},
      ],
    };
    const sortField = query.sort?.replace('-', '') ?? 'createdAt';
    const dir = query.sort ? (query.sort.startsWith('-') ? 'desc' : 'asc') : 'desc';
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.medicalCase.findMany({ where, skip, take, orderBy: { [sortField]: dir }, include: caseInclude }),
      this.prisma.medicalCase.count({ where }),
    ]);
    return new Paginated(rows.map((r) => this.dto(r, staff)), { page, pageSize, total });
  }

  async get(user: AuthUser, id: string, ctx: ReqCtx) {
    const c = await this.loadScoped(user, id, 'view');
    const staff = this.scope.isStaff(user);
    if (staff) await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'case.view', resourceType: 'MedicalCase', resourceId: id, ...ctx });
    return this.dto(c, staff);
  }

  async update(user: AuthUser, id: string, dto: z.infer<typeof updateCaseSchema>, ctx: ReqCtx) {
    const staff = this.scope.isStaff(user);
    const before = await this.loadScoped(user, id, staff ? 'edit' : 'view');

    if (!staff) {
      if (STAFF_ONLY_KEYS.some((k) => dto[k] !== undefined)) throw forbidden('Only our team can change this.');
      if (!(PATIENT_CAN_EDIT_UNTIL as readonly string[]).includes(before.status)) {
        throw conflict('This case is already being handled by our team. Please message your coordinator to request changes.', 'CASE_LOCKED');
      }
      await this.assertOwnFamilyMember(before.patientId, dto.familyMemberId);
    }
    if ((TERMINAL as readonly string[]).includes(before.status)) throw conflict('This case is closed.', 'CASE_CLOSED');
    await this.assertRefs(dto);

    const { selectedDoctorId, selectedHospitalId } = dto;
    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.medicalCase.update({ where: { id }, data: dto, include: caseInclude });
      if (staff && selectedDoctorId && selectedDoctorId !== before.selectedDoctorId) {
        await this.timeline.record({ caseId: id, type: 'DOCTOR_RECOMMENDED', title: `Doctor recommended: ${c.selectedDoctor?.fullName}`, actorId: user.id }, tx);
      }
      if (staff && selectedHospitalId && selectedHospitalId !== before.selectedHospitalId) {
        await this.timeline.record({ caseId: id, type: 'HOSPITAL_SELECTED', title: `Hospital selected: ${c.selectedHospital?.name}`, actorId: user.id }, tx);
      }
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'case.update', resourceType: 'MedicalCase', resourceId: id, before: this.dto(before, true), after: this.dto(c, true), ...ctx }, tx);
      return c;
    });
    return this.dto(updated, staff);
  }

  async changeStatus(user: AuthUser, id: string, dto: z.infer<typeof changeStatusSchema>, ctx: ReqCtx) {
    const before = await this.loadScoped(user, id, 'edit');
    if ((TERMINAL as readonly string[]).includes(before.status)) throw conflict('This case is closed and cannot change status.', 'CASE_CLOSED');
    if (dto.status === before.status) throw conflict('The case is already in this status.', 'NO_CHANGE');
    if ((TERMINAL as readonly string[]).includes(dto.status) && !can(user, 'cases.close')) throw forbidden('You are not allowed to close cases.');

    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.medicalCase.update({
        where: { id },
        data: { status: dto.status, closedAt: (TERMINAL as readonly string[]).includes(dto.status) ? new Date() : null },
        include: caseInclude,
      });
      await this.timeline.record({ caseId: id, type: 'STATUS_CHANGED', title: STATUS_LABELS[dto.status], description: dto.message, actorId: user.id, fromStatus: before.status, toStatus: dto.status }, tx);
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'case.status', resourceType: 'MedicalCase', resourceId: id, before: { status: before.status }, after: { status: dto.status }, ...ctx }, tx);
      return c;
    });
    return this.dto(updated, true);
  }

  async cancelOwn(user: AuthUser, id: string, ctx: ReqCtx) {
    if (this.scope.isStaff(user)) throw forbidden();
    const before = await this.loadScoped(user, id, 'view');
    if (!(PATIENT_CAN_CANCEL as readonly string[]).includes(before.status)) {
      throw conflict('This case can no longer be cancelled online. Please contact your coordinator.', 'CANNOT_CANCEL');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.medicalCase.update({ where: { id }, data: { status: 'CANCELLED', closedAt: new Date() }, include: caseInclude });
      await this.timeline.record({ caseId: id, type: 'STATUS_CHANGED', title: STATUS_LABELS.CANCELLED, description: 'Cancelled by you.', actorId: user.id, fromStatus: before.status, toStatus: 'CANCELLED' }, tx);
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'case.cancel', resourceType: 'MedicalCase', resourceId: id, before: { status: before.status }, after: { status: 'CANCELLED' }, ...ctx }, tx);
      return c;
    });
    return this.dto(updated, false);
  }

  // ───────────── timeline & notes ─────────────

  async getTimeline(user: AuthUser, id: string) {
    await this.loadScoped(user, id, 'view');
    const staff = this.scope.isStaff(user);
    const rows = await this.prisma.caseTimeline.findMany({
      where: { caseId: id, ...(staff ? {} : { visibility: 'PATIENT_VISIBLE' }) }, // internal events never reach patients
      orderBy: { occurredAt: 'asc' },
      include: { actor: { select: { fullName: true } } },
    });
    return rows.map((r) => ({
      id: r.id, type: r.type, title: r.title, description: r.description, occurredAt: r.occurredAt,
      fromStatus: r.fromStatus, toStatus: r.toStatus,
      ...(staff ? { visibility: r.visibility, actor: r.actor?.fullName ?? null } : {}),
    }));
  }

  async listNotes(user: AuthUser, id: string) {
    await this.loadScoped(user, id, 'view');
    const staff = this.scope.isStaff(user);
    const rows = await this.prisma.caseNote.findMany({
      where: { caseId: id, ...(staff ? {} : { visibility: 'PATIENT_VISIBLE' }) },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { fullName: true } } },
    });
    return rows.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt, author: n.author.fullName, ...(staff ? { visibility: n.visibility } : {}) }));
  }

  async addNote(user: AuthUser, id: string, dto: z.infer<typeof createNoteSchema>, ctx: ReqCtx) {
    await this.loadScoped(user, id, 'edit');
    const note = await this.prisma.$transaction(async (tx) => {
      const n = await tx.caseNote.create({ data: { caseId: id, authorId: user.id, body: dto.body, visibility: dto.visibility } });
      await this.timeline.record(
        dto.visibility === 'PATIENT_VISIBLE'
          ? { caseId: id, type: 'NOTE', title: 'Update from our team', description: dto.body, actorId: user.id }
          : { caseId: id, type: 'NOTE', title: 'Internal note added', visibility: 'INTERNAL', actorId: user.id },
        tx,
      );
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'case.note', resourceType: 'MedicalCase', resourceId: id, metadata: { visibility: dto.visibility }, ...ctx }, tx);
      return n;
    });
    return { id: note.id, body: note.body, visibility: note.visibility, createdAt: note.createdAt };
  }

  // ───────────── assignment ─────────────

  async assign(user: AuthUser, id: string, dto: z.infer<typeof assignSchema>, ctx: ReqCtx) {
    await this.loadScoped(user, id, 'edit');
    const staffUser = await this.prisma.user.findFirst({
      where: { id: dto.staffId, deletedAt: null, status: 'ACTIVE', roles: { some: { role: { permissions: { some: {} } } } } },
      select: { id: true, fullName: true },
    });
    if (!staffUser) throw this.invalid('staffId', 'Please choose an active staff member.');
    const dup = await this.prisma.caseAssignment.count({ where: { caseId: id, staffId: dto.staffId, role: dto.role, unassignedAt: null } });
    if (dup) throw conflict('This staff member is already assigned in that role.', 'ALREADY_ASSIGNED');

    const a = await this.prisma.$transaction(async (tx) => {
      const row = await tx.caseAssignment.create({ data: { caseId: id, staffId: dto.staffId, role: dto.role, assignedById: user.id } });
      await this.timeline.record({ caseId: id, type: 'COORDINATOR_ASSIGNED', title: `A ${ROLE_LABEL[dto.role]} was assigned to your case`, description: staffUser.fullName, actorId: user.id }, tx);
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'case.assign', resourceType: 'MedicalCase', resourceId: id, metadata: { staffId: dto.staffId, role: dto.role }, ...ctx }, tx);
      return row;
    });
    return { id: a.id, role: a.role, staff: staffUser, assignedAt: a.assignedAt };
  }

  async unassign(user: AuthUser, id: string, assignmentId: string, ctx: ReqCtx) {
    await this.loadScoped(user, id, 'edit');
    const a = await this.prisma.caseAssignment.findFirst({ where: { id: assignmentId, caseId: id, unassignedAt: null } });
    if (!a) throw notFound('We could not find this assignment.');
    await this.prisma.$transaction(async (tx) => {
      await tx.caseAssignment.update({ where: { id: a.id }, data: { unassignedAt: new Date() } });
      await this.timeline.record({ caseId: id, type: 'COORDINATOR_ASSIGNED', title: 'Assignment removed', visibility: 'INTERNAL', actorId: user.id }, tx);
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'case.unassign', resourceType: 'MedicalCase', resourceId: id, metadata: { staffId: a.staffId, role: a.role }, ...ctx }, tx);
    });
  }
}
