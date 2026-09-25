import { Body, Controller, Get, HttpCode, Injectable, Module, Put } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppointmentsModule, AppointmentsService } from '../appointments/appointments.service';
import { AuditService } from '../audit/audit.service';
import { STATUS_LABELS } from '../cases/cases.schemas';
import { forbidden, notFound } from '../common/http/errors';
import { Ctx, ReqCtx } from '../common/http/request-context';
import { ZodPipe } from '../common/http/response';
import { PrismaService } from '../common/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { DocumentsModule } from '../documents/documents.controller';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsModule, PaymentsService } from '../payments/payments.service';
import { AuthUser, CurrentUser, can, primaryRole } from '../rbac/auth-user';
import { ScopeService } from '../rbac/scope.service';
import { TravelModule, TravelService } from '../travel/travel.service';
import { VisaModule, VisaService } from '../visa/visa.service';

const ACTIVE = { notIn: ['COMPLETED', 'CANCELLED'] as ('COMPLETED' | 'CANCELLED')[] };
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM.');
const availabilitySchema = z
  .object({
    availability: z
      .array(
        z
          .object({ dayOfWeek: z.number().int().min(0).max(6), startTime: time, endTime: time, timezone: z.string().min(3).max(60), method: z.enum(['IN_PERSON', 'VIDEO', 'PHONE']), notes: z.string().trim().max(200).nullish() })
          .refine((v) => v.startTime < v.endTime, { path: ['endTime'], message: 'End time must be after the start time.' }),
      )
      .max(30),
  })
  .strict();

/** Role-adapted "what needs my attention" data for the staff and doctor dashboards. Everything is scoped like the rest of the API. */
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
    private readonly appointments: AppointmentsService,
    private readonly visa: VisaService,
    private readonly travel: TravelService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async safe<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch {
      return null; // a section the role may not use simply is not part of its dashboard
    }
  }

  async overview(user: AuthUser) {
    if (!this.scope.isStaff(user)) throw forbidden();
    const caseScope = this.scope.caseWhere(user, 'view');
    const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000 - 1);
    const now = new Date();

    const [byStatus, urgent, recentCases, docs, upcoming, today, visaOpen, travelPlans, pendingInv, partialInv, unread, doctor] = await Promise.all([
      caseScope ? this.prisma.medicalCase.groupBy({ by: ['status'], where: { AND: [caseScope, { status: ACTIVE }] }, _count: { _all: true } }) : [],
      caseScope ? this.prisma.medicalCase.count({ where: { AND: [caseScope, { status: ACTIVE, priority: 'URGENT' }] } }) : 0,
      caseScope
        ? this.prisma.medicalCase.findMany({
            where: { AND: [caseScope, { status: ACTIVE }] }, orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }], take: 8,
            select: { id: true, caseNumber: true, status: true, priority: true, updatedAt: true, createdAt: true, treatment: { select: { name: true } }, preferredCountry: { select: { name: true } }, patient: { select: { id: true, user: { select: { fullName: true } } } } },
          })
        : [],
      this.documents.reviewQueue(user, 6),
      this.safe(() => this.appointments.list(user, { upcoming: 'true', pageSize: 8, sort: 'scheduledAt' })),
      this.safe(() => this.appointments.list(user, { from: startOfDay, to: endOfDay, pageSize: 1, sort: 'scheduledAt' })),
      can(user, 'visa.view') ? this.safe(() => this.visa.list(user, { open: 'true', pageSize: 6 })) : null,
      can(user, 'travel.view') ? this.safe(() => this.travel.list(user, { pageSize: 6 })) : null,
      can(user, 'payments.view') ? this.safe(() => this.payments.list(user, { status: 'PENDING', pageSize: 6 })) : null,
      can(user, 'payments.view') ? this.safe(() => this.payments.list(user, { status: 'PARTIAL', pageSize: 6 })) : null,
      this.notifications.unreadCount(user),
      user.roles.includes('DOCTOR') ? this.doctorSummary(user, now) : null,
    ]);

    const activeCases = byStatus.reduce((s, r) => s + r._count._all, 0);
    return {
      kind: doctor ? 'doctor' : 'staff',
      roles: user.roles,
      permissions: [...user.permissions].filter((p) => !p.startsWith('documents.')).length,
      cases: {
        active: activeCases, urgent,
        byStatus: byStatus.map((r) => ({ status: r.status, label: STATUS_LABELS[r.status], count: r._count._all })),
        recent: recentCases.map((c) => ({ id: c.id, caseNumber: c.caseNumber, status: c.status, statusLabel: STATUS_LABELS[c.status], priority: c.priority, treatment: c.treatment?.name ?? null, country: c.preferredCountry?.name ?? null, patient: { id: c.patient.id, fullName: c.patient.user.fullName }, updatedAt: c.updatedAt, createdAt: c.createdAt })),
      },
      documents: docs,
      appointments: { upcoming: upcoming?.items ?? [], upcomingTotal: upcoming?.meta.total ?? 0, todayTotal: today?.meta.total ?? 0 },
      visa: visaOpen ? { open: visaOpen.meta.total, items: visaOpen.items } : null,
      travel: travelPlans ? { total: travelPlans.meta.total, items: travelPlans.items } : null,
      invoices: pendingInv || partialInv ? { pending: pendingInv?.meta.total ?? 0, partial: partialInv?.meta.total ?? 0, items: [...(pendingInv?.items ?? []), ...(partialInv?.items ?? [])].slice(0, 6) } : null,
      unreadNotifications: unread,
      doctor,
    };
  }

  private async doctorSummary(user: AuthUser, now: Date) {
    const d = await this.prisma.doctor.findFirst({
      where: { userId: user.id, deletedAt: null },
      select: {
        id: true, slug: true, fullName: true, title: true, designation: true, photoKey: true, isVerified: true, status: true, isDemo: true, yearsOfExperience: true, bio: true,
        specialties: { select: { isPrimary: true, specialty: { select: { name: true } } } },
        hospitals: { select: { isPrimary: true, hospital: { select: { name: true, city: { select: { name: true } }, country: { select: { name: true } } } } } },
        availability: { select: { id: true, dayOfWeek: true, startTime: true, endTime: true, timezone: true, method: true, notes: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      },
    });
    if (!d) return null;
    const weekEnd = new Date(now.getTime() + 7 * 86_400_000);
    const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
    const [week, completed, patients] = await Promise.all([
      this.prisma.appointment.count({ where: { doctorId: d.id, scheduledAt: { gte: now, lte: weekEnd }, status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'] } } }),
      this.prisma.appointment.count({ where: { doctorId: d.id, status: 'COMPLETED', scheduledAt: { gte: monthAgo } } }),
      this.prisma.medicalCase.count({ where: { deletedAt: null, status: ACTIVE, OR: [{ selectedDoctorId: d.id }, { appointments: { some: { doctorId: d.id } } }] } }),
    ]);
    return { ...d, stats: { appointmentsNext7Days: week, completedLast30Days: completed, activePatients: patients } };
  }

  async getAvailability(user: AuthUser) {
    const d = await this.prisma.doctor.findFirst({ where: { userId: user.id, deletedAt: null }, select: { id: true } });
    if (!d) throw notFound('No doctor profile is linked to your account.');
    return this.prisma.doctorAvailability.findMany({ where: { doctorId: d.id }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }], select: { id: true, dayOfWeek: true, startTime: true, endTime: true, timezone: true, method: true, notes: true } });
  }

  async saveAvailability(user: AuthUser, dto: z.infer<typeof availabilitySchema>, ctx: ReqCtx) {
    const d = await this.prisma.doctor.findFirst({ where: { userId: user.id, deletedAt: null }, select: { id: true } });
    if (!d) throw notFound('No doctor profile is linked to your account.');
    await this.prisma.$transaction(async (tx) => {
      await tx.doctorAvailability.deleteMany({ where: { doctorId: d.id } });
      await tx.doctorAvailability.createMany({ data: dto.availability.map((a) => ({ ...a, doctorId: d.id })) });
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'doctor.availability', resourceType: 'Doctor', resourceId: d.id, metadata: { slots: dto.availability.length }, ...ctx }, tx as Prisma.TransactionClient);
    });
    return this.getAvailability(user);
  }
}

@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly svc: WorkspaceService) {}
  @Get('overview') overview(@CurrentUser() u: AuthUser) { return this.svc.overview(u); }
  @Get('doctor/availability') availability(@CurrentUser() u: AuthUser) { return this.svc.getAvailability(u); }
  @Put('doctor/availability') @HttpCode(200) save(@CurrentUser() u: AuthUser, @Body(new ZodPipe(availabilitySchema)) d: z.infer<typeof availabilitySchema>, @Ctx() c: ReqCtx) {
    if (!u.roles.includes('DOCTOR')) throw forbidden();
    return this.svc.saveAvailability(u, d, c);
  }
}

@Module({ imports: [AppointmentsModule, DocumentsModule, VisaModule, TravelModule, PaymentsModule], controllers: [WorkspaceController], providers: [WorkspaceService] })
export class WorkspaceModule {}
