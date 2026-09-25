import { Body, Controller, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CasesModule } from '../cases/cases.controller';
import { TimelineService } from '../cases/timeline.service';
import { AppError, conflict, forbidden, notFound } from '../common/http/errors';
import { Ctx, ReqCtx } from '../common/http/request-context';
import { Paginated, ZodPipe, pageParams } from '../common/http/response';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser, CurrentUser, can, primaryRole } from '../rbac/auth-user';
import { ScopeService } from '../rbac/scope.service';

const STATUSES = ['DOCUMENT_COLLECTION', 'SUBMITTED', 'UNDER_PROCESSING', 'ADDITIONAL_DOCUMENT_REQUIRED', 'APPROVED', 'REJECTED', 'COMPLETED'] as const;
const DOC_STATUSES = ['MISSING', 'SUBMITTED', 'VERIFIED', 'REJECTED'] as const;
const text = (n: number) => z.string().trim().max(n);

export const VISA_LABELS: Record<(typeof STATUSES)[number], string> = {
  DOCUMENT_COLLECTION: 'We are collecting your visa documents', SUBMITTED: 'Your application has been submitted',
  UNDER_PROCESSING: 'Your application is being processed', ADDITIONAL_DOCUMENT_REQUIRED: 'We need one more document from you',
  APPROVED: 'Your visa was approved', REJECTED: 'Your visa application was not approved', COMPLETED: 'Your visa process is complete',
};
const DISCLAIMER = 'Visa decisions are made by the embassy or consulate. We help with paperwork but cannot guarantee any outcome.';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(STATUSES).optional(), caseId: z.uuid().optional(), open: z.enum(['true']).optional(),
});
const createSchema = z.object({ caseId: z.uuid(), countryId: z.uuid(), expectedProcessingInfo: text(500).nullish() }).strict();
const updateSchema = z
  .object({
    status: z.enum(STATUSES), referenceNumber: text(60).nullable(), applicationDate: z.coerce.date().nullable(), decisionDate: z.coerce.date().nullable(),
    expectedProcessingInfo: text(500).nullable(), patientRemarks: text(1000).nullable(), internalRemarks: text(2000).nullable(), officerId: z.uuid().nullable(),
  })
  .partial()
  .strict();
const checklistSchema = z.object({ status: z.enum(DOC_STATUSES).optional(), remarks: text(300).nullish(), documentId: z.uuid().nullable().optional() }).strict();
const attachSchema = z.object({ documentId: z.uuid() }).strict();

const include = {
  country: { select: { id: true, name: true, slug: true, isoCode: true } },
  case: { select: { id: true, caseNumber: true } },
  patient: { select: { id: true, user: { select: { fullName: true } } } },
  officer: { select: { id: true, fullName: true } },
  documents: { include: { requirement: { select: { id: true, name: true, description: true, isMandatory: true } }, document: { select: { id: true, category: true, status: true } } }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.VisaCaseInclude;
type Row = Prisma.VisaCaseGetPayload<{ include: typeof include }>;

@Injectable()
export class VisaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
    private readonly notifications: NotificationsService,
  ) {}

  private dto(v: Row, staff: boolean) {
    const checklist = v.documents.map((d) => ({
      id: d.id, name: d.requirement?.name ?? 'Document', description: d.requirement?.description ?? null, isMandatory: d.requirement?.isMandatory ?? true,
      status: d.status, remarks: d.remarks, documentId: d.documentId, documentStatus: d.document?.status ?? null,
    }));
    const base = {
      id: v.id, status: v.status, statusLabel: VISA_LABELS[v.status], country: v.country, case: v.case, referenceNumber: v.referenceNumber,
      applicationDate: v.applicationDate, decisionDate: v.decisionDate, expectedProcessingInfo: v.expectedProcessingInfo, patientRemarks: v.patientRemarks,
      checklist, missingCount: checklist.filter((c) => c.isMandatory && c.status === 'MISSING').length, disclaimer: DISCLAIMER, updatedAt: v.updatedAt, createdAt: v.createdAt,
    };
    return staff ? { ...base, internalRemarks: v.internalRemarks, officer: v.officer, patient: { id: v.patient.id, fullName: v.patient.user.fullName } } : base;
  }

  /** Patients: own visa cases. Staff: need visa.view AND reach to the case. */
  private where(user: AuthUser, write = false): Prisma.VisaCaseWhereInput | null {
    if (!this.scope.isStaff(user)) return user.patientProfileId && !write ? { patientId: user.patientProfileId } : null;
    if (!can(user, write ? 'visa.edit' : 'visa.view')) return null;
    const c = this.scope.caseWhere(user, 'view');
    return c ? { case: { is: c } } : null;
  }

  private async load(user: AuthUser, id: string, write = false) {
    const where = this.where(user, write);
    if (!where) throw forbidden();
    const v = await this.prisma.visaCase.findFirst({ where: { AND: [{ id }, where] }, include });
    if (!v) throw notFound('We could not find this visa application.');
    return v;
  }

  async list(user: AuthUser, q: z.infer<typeof listQuery>) {
    const scope = this.where(user);
    if (!scope) throw forbidden();
    const { page, pageSize, skip, take } = pageParams(q);
    const where: Prisma.VisaCaseWhereInput = {
      AND: [scope, q.status ? { status: q.status } : {}, q.caseId ? { caseId: q.caseId } : {}, q.open ? { status: { notIn: ['COMPLETED', 'REJECTED', 'APPROVED'] } } : {}],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.visaCase.findMany({ where, skip, take, include, orderBy: { updatedAt: 'desc' } }),
      this.prisma.visaCase.count({ where }),
    ]);
    const staff = this.scope.isStaff(user);
    return new Paginated(rows.map((r) => this.dto(r, staff)), { page, pageSize, total });
  }

  async get(user: AuthUser, id: string) {
    return this.dto(await this.load(user, id), this.scope.isStaff(user));
  }

  async create(user: AuthUser, dto: z.infer<typeof createSchema>, ctx: ReqCtx) {
    if (!this.where(user, true)) throw forbidden();
    const caseWhere = this.scope.caseWhere(user, 'view')!;
    const c = await this.prisma.medicalCase.findFirst({ where: { AND: [{ id: dto.caseId }, caseWhere] }, select: { id: true, patientId: true, familyMemberId: true } });
    if (!c) throw notFound('We could not find this treatment case.');
    const country = await this.prisma.country.findFirst({ where: { id: dto.countryId, deletedAt: null }, include: { visaRequirements: { orderBy: { sortOrder: 'asc' } } } });
    if (!country) throw new AppError(422, 'VALIDATION_FAILED', 'Choose an existing country.', [{ field: 'countryId', message: 'Not available.' }]);
    if (await this.prisma.visaCase.count({ where: { caseId: c.id, countryId: country.id, status: { notIn: ['REJECTED', 'COMPLETED'] } } })) {
      throw conflict('There is already an open visa application for this case and country.', 'ALREADY_EXISTS');
    }
    const v = await this.prisma.$transaction(async (tx) => {
      const row = await tx.visaCase.create({
        data: {
          caseId: c.id, patientId: c.patientId, familyMemberId: c.familyMemberId, countryId: country.id, expectedProcessingInfo: dto.expectedProcessingInfo, officerId: can(user, 'visa.approve') ? user.id : null,
          documents: { create: country.visaRequirements.map((r) => ({ requirementId: r.id })) },
        },
        include,
      });
      await this.timeline.record({ caseId: c.id, type: 'VISA_UPDATED', title: `Visa application started for ${country.name}`, actorId: user.id }, tx);
      await this.notifications.notifyPatientOfCase(c.id, 'VISA_STATUS_CHANGED', 'Visa application started', `We started your visa checklist for ${country.name}.`, tx);
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'visa.create', resourceType: 'VisaCase', resourceId: row.id, ...ctx }, tx);
      return row;
    });
    return this.dto(v, true);
  }

  async update(user: AuthUser, id: string, dto: z.infer<typeof updateSchema>, ctx: ReqCtx) {
    const before = await this.load(user, id, true);
    if (dto.status && ['APPROVED', 'REJECTED'].includes(dto.status) && !can(user, 'visa.approve')) throw forbidden('Only a visa officer can record the decision.');
    if (dto.officerId && !(await this.prisma.user.count({ where: { id: dto.officerId, deletedAt: null, status: 'ACTIVE', roles: { some: { role: { permissions: { some: { permission: { key: 'visa.edit' } } } } } } } }))) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Choose an active visa officer.', [{ field: 'officerId', message: 'Not available.' }]);
    }
    const v = await this.prisma.$transaction(async (tx) => {
      const row = await tx.visaCase.update({ where: { id }, data: dto, include });
      if (dto.status && dto.status !== before.status) {
        await this.timeline.record({ caseId: row.caseId, type: 'VISA_UPDATED', title: VISA_LABELS[dto.status], description: dto.patientRemarks ?? undefined, actorId: user.id }, tx);
        await this.notifications.notifyPatientOfCase(row.caseId, 'VISA_STATUS_CHANGED', VISA_LABELS[dto.status], dto.patientRemarks ?? undefined, tx);
      }
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'visa.update', resourceType: 'VisaCase', resourceId: id, before: { status: before.status }, after: { status: row.status }, ...ctx }, tx);
      return row;
    });
    return this.dto(v, true);
  }

  async updateChecklist(user: AuthUser, id: string, itemId: string, dto: z.infer<typeof checklistSchema>, ctx: ReqCtx) {
    const v = await this.load(user, id, true);
    const item = v.documents.find((d) => d.id === itemId);
    if (!item) throw notFound('We could not find this checklist item.');
    if (dto.documentId) await this.assertDoc(dto.documentId, v.patientId);
    await this.prisma.$transaction(async (tx) => {
      await tx.visaDocument.update({ where: { id: itemId }, data: { status: dto.status, remarks: dto.remarks, documentId: dto.documentId } });
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'visa.checklist', resourceType: 'VisaCase', resourceId: id, metadata: { itemId, status: dto.status }, ...ctx }, tx);
    });
    return this.get(user, id);
  }

  private async assertDoc(documentId: string, patientId: string) {
    if (!(await this.prisma.document.count({ where: { id: documentId, patientId, deletedAt: null } }))) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Choose one of your uploaded documents.', [{ field: 'documentId', message: 'Not available.' }]);
    }
  }

  /** A patient links one of their uploaded documents to a checklist item. */
  async attach(user: AuthUser, id: string, itemId: string, dto: z.infer<typeof attachSchema>, ctx: ReqCtx) {
    if (!user.patientProfileId) throw forbidden();
    const v = await this.load(user, id);
    const item = v.documents.find((d) => d.id === itemId);
    if (!item) throw notFound('We could not find this checklist item.');
    await this.assertDoc(dto.documentId, v.patientId);
    await this.prisma.$transaction(async (tx) => {
      await tx.visaDocument.update({ where: { id: itemId }, data: { documentId: dto.documentId, status: 'SUBMITTED' } });
      await this.notifications.notifyTeamOfCase(v.caseId, 'DOCUMENT_UPLOADED', 'A visa document was submitted', item.requirement?.name, user.id, tx);
      await this.audit.log({ actorId: user.id, actorRole: 'PATIENT', action: 'visa.attach', resourceType: 'VisaCase', resourceId: id, metadata: { itemId }, ...ctx }, tx);
    });
    return this.get(user, id);
  }
}

@Controller('visa')
export class VisaController {
  constructor(private readonly svc: VisaService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) { return this.svc.list(u, q); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) { return this.svc.get(u, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createSchema)) d: z.infer<typeof createSchema>, @Ctx() c: ReqCtx) { return this.svc.create(u, d, c); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodPipe(updateSchema)) d: z.infer<typeof updateSchema>, @Ctx() c: ReqCtx) { return this.svc.update(u, id, d, c); }
  @Patch(':id/checklist/:itemId') checklist(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Param('itemId', new ParseUUIDPipe()) itemId: string, @Body(new ZodPipe(checklistSchema)) d: z.infer<typeof checklistSchema>, @Ctx() c: ReqCtx) { return this.svc.updateChecklist(u, id, itemId, d, c); }
  @Post(':id/checklist/:itemId/attach') @HttpCode(200) attach(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Param('itemId', new ParseUUIDPipe()) itemId: string, @Body(new ZodPipe(attachSchema)) d: z.infer<typeof attachSchema>, @Ctx() c: ReqCtx) { return this.svc.attach(u, id, itemId, d, c); }
}

@Module({ imports: [CasesModule], controllers: [VisaController], providers: [VisaService], exports: [VisaService] })
export class VisaModule {}
