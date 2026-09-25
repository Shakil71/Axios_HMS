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

const TYPES = ['ONLINE_CONSULTATION', 'HOSPITAL_CONSULTATION', 'FOLLOW_UP', 'DIAGNOSTIC', 'SURGERY', 'SECOND_OPINION'] as const;
const METHODS = ['IN_PERSON', 'VIDEO', 'PHONE'] as const;
const STATUSES = ['REQUESTED', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
const text = (n: number) => z.string().trim().max(n);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(STATUSES).optional(),
  caseId: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  upcoming: z.enum(['true']).optional(),
  sort: z.enum(['scheduledAt', '-scheduledAt']).optional(),
});

const createSchema = z
  .object({
    caseId: z.uuid(), doctorId: z.uuid().nullish(), hospitalId: z.uuid().nullish(),
    scheduledAt: z.coerce.date(), durationMinutes: z.number().int().min(10).max(480).default(30), timezone: text(60).default('UTC'),
    type: z.enum(TYPES), method: z.enum(METHODS), status: z.enum(['REQUESTED', 'CONFIRMED']).default('CONFIRMED'),
    notes: text(1000).nullish(), internalNotes: text(1000).nullish(), meetingUrl: z.url().max(500).nullish(),
  })
  .strict();

const requestSchema = z
  .object({ caseId: z.uuid(), doctorId: z.uuid().nullish(), type: z.enum(TYPES), method: z.enum(METHODS).default('VIDEO'), preferredAt: z.coerce.date(), notes: text(1000).nullish() })
  .strict();

const updateSchema = createSchema.omit({ caseId: true, status: true }).partial().strict();
const statusSchema = z.object({ status: z.enum(STATUSES), scheduledAt: z.coerce.date().optional(), reason: text(500).optional() }).strict();

const include = {
  doctor: { select: { id: true, fullName: true, slug: true, photoKey: true, title: true } },
  hospital: { select: { id: true, name: true, slug: true } },
  case: { select: { id: true, caseNumber: true, status: true } },
  patient: { select: { id: true, user: { select: { fullName: true } } } },
} satisfies Prisma.AppointmentInclude;
type Row = Prisma.AppointmentGetPayload<{ include: typeof include }>;

const CLOSED = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
const TITLE: Record<string, string> = {
  CONFIRMED: 'Appointment confirmed', RESCHEDULED: 'Appointment rescheduled', CANCELLED: 'Appointment cancelled',
  COMPLETED: 'Appointment completed', NO_SHOW: 'Appointment marked as missed', REQUESTED: 'Appointment requested',
};
const when = (d: Date) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' }).format(d) + ' (Bangladesh time)';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
    private readonly notifications: NotificationsService,
  ) {}

  private dto(a: Row, staff: boolean) {
    const base = {
      id: a.id, scheduledAt: a.scheduledAt, durationMinutes: a.durationMinutes, timezone: a.timezone, type: a.type, method: a.method, status: a.status,
      notes: a.notes, meetingUrl: a.status === 'CONFIRMED' || a.status === 'RESCHEDULED' ? a.meetingUrl : null,
      doctor: a.doctor, hospital: a.hospital, case: a.case, createdAt: a.createdAt,
    };
    return staff ? { ...base, internalNotes: a.internalNotes, patient: { id: a.patient.id, fullName: a.patient.user.fullName } } : base;
  }

  /** Which appointments may this caller see? null = none. */
  private where(user: AuthUser, action: 'view' | 'edit'): Prisma.AppointmentWhereInput | null {
    if (!this.scope.isStaff(user)) return user.patientProfileId && action === 'view' ? { patientId: user.patientProfileId } : null;
    if (user.roles.includes('DOCTOR') && !can(user, `appointments.${action}.all`)) {
      return can(user, `appointments.${action}`) ? { doctor: { userId: user.id } } : null; // doctors: only their own appointments
    }
    if (can(user, `appointments.${action}.all`)) return {};
    if (can(user, `appointments.${action}`)) return { case: { is: { deletedAt: null, ...this.scope.assignedWhere(user) } } };
    return null;
  }

  private async load(user: AuthUser, id: string, action: 'view' | 'edit') {
    const where = this.where(user, action);
    if (!where) throw forbidden();
    const a = await this.prisma.appointment.findFirst({ where: { AND: [{ id }, where] }, include });
    if (!a) throw notFound('We could not find this appointment.');
    return a;
  }

  async list(user: AuthUser, q: z.infer<typeof listQuery>) {
    const scope = this.where(user, 'view');
    if (!scope) throw forbidden();
    const { page, pageSize, skip, take } = pageParams(q);
    const now = new Date();
    const where: Prisma.AppointmentWhereInput = {
      AND: [
        scope,
        q.status ? { status: q.status } : {},
        q.caseId ? { caseId: q.caseId } : {},
        q.from || q.to ? { scheduledAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {},
        q.upcoming ? { scheduledAt: { gte: now }, status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'] } } : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({ where, skip, take, include, orderBy: { scheduledAt: q.sort === '-scheduledAt' || (!q.sort && !q.upcoming) ? 'desc' : 'asc' } }),
      this.prisma.appointment.count({ where }),
    ]);
    const staff = this.scope.isStaff(user);
    return new Paginated(rows.map((r) => this.dto(r, staff)), { page, pageSize, total });
  }

  async get(user: AuthUser, id: string) {
    return this.dto(await this.load(user, id, 'view'), this.scope.isStaff(user));
  }

  private async assertRefs(doctorId?: string | null, hospitalId?: string | null) {
    const bad = (field: string) => new AppError(422, 'VALIDATION_FAILED', 'This selection is not available.', [{ field, message: 'Not available.' }]);
    if (doctorId && !(await this.prisma.doctor.count({ where: { id: doctorId, deletedAt: null, isVerified: true } }))) throw bad('doctorId');
    if (hospitalId && !(await this.prisma.hospital.count({ where: { id: hospitalId, deletedAt: null } }))) throw bad('hospitalId');
  }

  /** Staff schedule an appointment for a case they can reach. */
  async create(user: AuthUser, dto: z.infer<typeof createSchema>, ctx: ReqCtx) {
    if (!this.scope.isStaff(user) || !can(user, 'appointments.create')) throw forbidden();
    const caseWhere = this.scope.caseWhere(user, 'view');
    if (!caseWhere) throw forbidden();
    const c = await this.prisma.medicalCase.findFirst({ where: { AND: [{ id: dto.caseId }, caseWhere] }, select: { id: true, patientId: true, familyMemberId: true, status: true } });
    if (!c) throw notFound('We could not find this treatment case.');
    await this.assertRefs(dto.doctorId, dto.hospitalId);

    const { caseId: _c, ...data } = dto;
    const a = await this.prisma.$transaction(async (tx) => {
      const row = await tx.appointment.create({
        data: { ...data, caseId: c.id, patientId: c.patientId, familyMemberId: c.familyMemberId, createdById: user.id },
        include,
      });
      await this.timeline.record({ caseId: c.id, type: 'APPOINTMENT_UPDATED', title: TITLE[row.status], description: when(row.scheduledAt), actorId: user.id }, tx);
      await this.notifications.notifyPatientOfCase(c.id, 'APPOINTMENT_CONFIRMED', TITLE[row.status], when(row.scheduledAt), tx);
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'appointment.create', resourceType: 'Appointment', resourceId: row.id, after: { status: row.status, scheduledAt: row.scheduledAt }, ...ctx }, tx);
      return row;
    });
    return this.dto(a, true);
  }

  /** A patient asks for an appointment on their own case. */
  async request(user: AuthUser, dto: z.infer<typeof requestSchema>, ctx: ReqCtx) {
    if (!user.patientProfileId) throw forbidden('Only patients can request appointments.');
    const c = await this.prisma.medicalCase.findFirst({ where: { id: dto.caseId, patientId: user.patientProfileId, deletedAt: null }, select: { id: true, patientId: true, familyMemberId: true, status: true } });
    if (!c) throw notFound('We could not find this treatment case.');
    if (['COMPLETED', 'CANCELLED'].includes(c.status)) throw conflict('This case is closed.', 'CASE_CLOSED');
    if (dto.preferredAt < new Date()) throw new AppError(422, 'VALIDATION_FAILED', 'Please choose a time in the future.', [{ field: 'preferredAt', message: 'Choose a time in the future.' }]);
    await this.assertRefs(dto.doctorId, null);

    const a = await this.prisma.$transaction(async (tx) => {
      const row = await tx.appointment.create({
        data: { caseId: c.id, patientId: c.patientId, familyMemberId: c.familyMemberId, doctorId: dto.doctorId, scheduledAt: dto.preferredAt, timezone: 'Asia/Dhaka', type: dto.type, method: dto.method, status: 'REQUESTED', notes: dto.notes, createdById: user.id },
        include,
      });
      await this.timeline.record({ caseId: c.id, type: 'APPOINTMENT_UPDATED', title: 'You requested an appointment', description: when(row.scheduledAt), actorId: user.id }, tx);
      await this.notifications.notifyTeamOfCase(c.id, 'APPOINTMENT_CHANGED', 'New appointment request', when(row.scheduledAt), user.id, tx);
      await this.audit.log({ actorId: user.id, actorRole: 'PATIENT', action: 'appointment.request', resourceType: 'Appointment', resourceId: row.id, ...ctx }, tx);
      return row;
    });
    return this.dto(a, false);
  }

  async update(user: AuthUser, id: string, dto: z.infer<typeof updateSchema>, ctx: ReqCtx) {
    if (!this.scope.isStaff(user)) throw forbidden();
    const before = await this.load(user, id, 'edit');
    if (CLOSED.includes(before.status)) throw conflict('This appointment is closed.', 'APPOINTMENT_CLOSED');
    await this.assertRefs(dto.doctorId, dto.hospitalId);
    const a = await this.prisma.$transaction(async (tx) => {
      const row = await tx.appointment.update({ where: { id }, data: dto, include });
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'appointment.update', resourceType: 'Appointment', resourceId: id, before: { scheduledAt: before.scheduledAt, doctorId: before.doctorId }, after: { scheduledAt: row.scheduledAt, doctorId: row.doctorId }, ...ctx }, tx);
      return row;
    });
    return this.dto(a, true);
  }

  async setStatus(user: AuthUser, id: string, dto: z.infer<typeof statusSchema>, ctx: ReqCtx) {
    const staff = this.scope.isStaff(user);
    const before = await this.load(user, id, staff ? 'edit' : 'view');
    if (!staff && dto.status !== 'CANCELLED') throw forbidden('You can only cancel an appointment. Please message your coordinator for other changes.');
    if (CLOSED.includes(before.status)) throw conflict('This appointment is already closed.', 'APPOINTMENT_CLOSED');
    if (dto.status === before.status && dto.status !== 'RESCHEDULED') throw conflict('The appointment is already in this status.', 'NO_CHANGE');
    if (dto.status === 'RESCHEDULED' && !dto.scheduledAt) throw new AppError(422, 'VALIDATION_FAILED', 'Choose the new time.', [{ field: 'scheduledAt', message: 'Required.' }]);
    if (dto.status === 'REQUESTED') throw conflict('An appointment cannot go back to requested.', 'INVALID_TRANSITION');

    const a = await this.prisma.$transaction(async (tx) => {
      const row = await tx.appointment.update({ where: { id }, data: { status: dto.status, ...(dto.scheduledAt ? { scheduledAt: dto.scheduledAt } : {}) }, include });
      const notify = dto.status === 'CONFIRMED' ? 'APPOINTMENT_CONFIRMED' : 'APPOINTMENT_CHANGED';
      const detail = [when(row.scheduledAt), dto.reason].filter(Boolean).join(' · ');
      await this.timeline.record({ caseId: row.caseId, type: 'APPOINTMENT_UPDATED', title: TITLE[dto.status], description: detail, actorId: user.id }, tx);
      if (staff) await this.notifications.notifyPatientOfCase(row.caseId, notify, TITLE[dto.status], detail, tx);
      else await this.notifications.notifyTeamOfCase(row.caseId, 'APPOINTMENT_CHANGED', 'Patient cancelled an appointment', detail, user.id, tx);
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'appointment.status', resourceType: 'Appointment', resourceId: id, before: { status: before.status }, after: { status: dto.status }, ...ctx }, tx);
      return row;
    });
    return this.dto(a, staff);
  }
}

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly svc: AppointmentsService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) { return this.svc.list(u, q); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) { return this.svc.get(u, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createSchema)) d: z.infer<typeof createSchema>, @Ctx() c: ReqCtx) { return this.svc.create(u, d, c); }
  @Post('request') request(@CurrentUser() u: AuthUser, @Body(new ZodPipe(requestSchema)) d: z.infer<typeof requestSchema>, @Ctx() c: ReqCtx) { return this.svc.request(u, d, c); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodPipe(updateSchema)) d: z.infer<typeof updateSchema>, @Ctx() c: ReqCtx) { return this.svc.update(u, id, d, c); }
  @Post(':id/status') @HttpCode(200) status(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodPipe(statusSchema)) d: z.infer<typeof statusSchema>, @Ctx() c: ReqCtx) { return this.svc.setStatus(u, id, d, c); }
}

@Module({ imports: [CasesModule], controllers: [AppointmentsController], providers: [AppointmentsService], exports: [AppointmentsService] })
export class AppointmentsModule {}
