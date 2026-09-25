import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CasesModule } from '../cases/cases.controller';
import { TimelineService } from '../cases/timeline.service';
import { forbidden, notFound } from '../common/http/errors';
import { Ctx, ReqCtx } from '../common/http/request-context';
import { Paginated, ZodPipe, pageParams } from '../common/http/response';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser, CurrentUser, can, primaryRole } from '../rbac/auth-user';
import { ScopeService } from '../rbac/scope.service';

const text = (n: number) => z.string().trim().max(n);
const phone = z.string().trim().max(30);

const flight = z.object({
  direction: z.enum(['OUTBOUND', 'RETURN', 'INTERNAL']), airline: text(80).nullish(), flightNumber: text(20).nullish(),
  departureAirport: text(80).min(2), arrivalAirport: text(80).min(2), departureAt: z.coerce.date(), arrivalAt: z.coerce.date().nullish(), bookingReference: text(40).nullish(),
}).refine((f) => !f.arrivalAt || f.arrivalAt >= f.departureAt, { path: ['arrivalAt'], message: 'Arrival must be after departure.' });
const hotel = z.object({
  name: text(150).min(2), address: text(300).nullish(), phone: phone.nullish(), checkInDate: z.coerce.date(), checkOutDate: z.coerce.date().nullish(),
  bookingReference: text(40).nullish(), roomInfo: text(200).nullish(),
}).refine((h) => !h.checkOutDate || h.checkOutDate >= h.checkInDate, { path: ['checkOutDate'], message: 'Check-out must be after check-in.' });
const transport = z.object({
  type: z.enum(['AIRPORT_PICKUP', 'AIRPORT_DROP', 'HOSPITAL_TRANSFER', 'OTHER']), pickupLocation: text(200).nullish(), dropLocation: text(200).nullish(),
  scheduledAt: z.coerce.date().nullish(), driverName: text(100).nullish(), driverPhone: phone.nullish(), vehicleInfo: text(100).nullish(),
});

const planSchema = z
  .object({
    travelerCount: z.number().int().min(1).max(10).default(1),
    localCoordinatorName: text(100).nullish(), localCoordinatorPhone: phone.nullish(), emergencyContactName: text(100).nullish(), emergencyContactPhone: phone.nullish(),
    notes: text(2000).nullish(), flights: z.array(flight).max(12).default([]), hotels: z.array(hotel).max(8).default([]), transports: z.array(transport).max(12).default([]),
  })
  .strict();

const include = {
  flights: { orderBy: { departureAt: 'asc' as const } },
  hotels: { orderBy: { checkInDate: 'asc' as const } },
  transports: { orderBy: { scheduledAt: 'asc' as const } },
  case: { select: { id: true, caseNumber: true, patient: { select: { id: true, user: { select: { fullName: true } } } }, selectedHospital: { select: { name: true } } } },
} satisfies Prisma.TravelPlanInclude;
type Row = Prisma.TravelPlanGetPayload<{ include: typeof include }>;

const listQuery = z.object({ page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() });

@Injectable()
export class TravelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
    private readonly notifications: NotificationsService,
  ) {}

  private dto(p: Row, staff: boolean) {
    const upcoming = [...p.flights.map((f) => f.departureAt), ...p.hotels.map((h) => h.checkInDate)].filter((d) => d >= new Date()).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return {
      id: p.id, caseId: p.caseId, case: { id: p.case.id, caseNumber: p.case.caseNumber, hospital: p.case.selectedHospital?.name ?? null },
      ...(staff ? { patient: { id: p.case.patient.id, fullName: p.case.patient.user.fullName } } : {}),
      travelerCount: p.travelerCount, localCoordinatorName: p.localCoordinatorName, localCoordinatorPhone: p.localCoordinatorPhone,
      emergencyContactName: p.emergencyContactName, emergencyContactPhone: p.emergencyContactPhone, notes: p.notes,
      flights: p.flights, hotels: p.hotels, transports: p.transports, nextMilestone: upcoming, updatedAt: p.updatedAt,
    };
  }

  private async assertCase(user: AuthUser, caseId: string, write: boolean) {
    const where = this.scope.caseWhere(user, 'view');
    if (!where) throw forbidden();
    if (this.scope.isStaff(user) && !can(user, write ? 'travel.edit' : 'travel.view')) throw forbidden();
    if (write && !this.scope.isStaff(user)) throw forbidden();
    const c = await this.prisma.medicalCase.findFirst({ where: { AND: [{ id: caseId }, where] }, select: { id: true } });
    if (!c) throw notFound('We could not find this treatment case.');
  }

  async list(user: AuthUser, q: z.infer<typeof listQuery>) {
    const scope = this.scope.caseWhere(user, 'view');
    if (!scope || (this.scope.isStaff(user) && !can(user, 'travel.view'))) throw forbidden();
    const { page, pageSize, skip, take } = pageParams(q);
    const where: Prisma.TravelPlanWhereInput = { case: { is: scope } };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.travelPlan.findMany({ where, skip, take, include, orderBy: { updatedAt: 'desc' } }),
      this.prisma.travelPlan.count({ where }),
    ]);
    const staff = this.scope.isStaff(user);
    return new Paginated(rows.map((r) => this.dto(r, staff)), { page, pageSize, total });
  }

  async getForCase(user: AuthUser, caseId: string) {
    await this.assertCase(user, caseId, false);
    const plan = await this.prisma.travelPlan.findUnique({ where: { caseId }, include });
    return plan ? this.dto(plan, this.scope.isStaff(user)) : null;
  }

  async save(user: AuthUser, caseId: string, dto: z.infer<typeof planSchema>, ctx: ReqCtx) {
    await this.assertCase(user, caseId, true);
    const { flights, hotels, transports, ...scalars } = dto;
    const plan = await this.prisma.$transaction(async (tx) => {
      const p = await tx.travelPlan.upsert({ where: { caseId }, update: scalars, create: { caseId, ...scalars } });
      await tx.flight.deleteMany({ where: { travelPlanId: p.id } });
      await tx.hotel.deleteMany({ where: { travelPlanId: p.id } });
      await tx.transport.deleteMany({ where: { travelPlanId: p.id } });
      await tx.flight.createMany({ data: flights.map((f) => ({ ...f, travelPlanId: p.id })) });
      await tx.hotel.createMany({ data: hotels.map((h) => ({ ...h, travelPlanId: p.id })) });
      await tx.transport.createMany({ data: transports.map((t) => ({ ...t, travelPlanId: p.id })) });
      await this.timeline.record({ caseId, type: 'TRAVEL_UPDATED', title: 'Your travel plan was updated', description: `${flights.length} flight(s), ${hotels.length} stay(s), ${transports.length} transfer(s)`, actorId: user.id }, tx);
      await this.notifications.notifyPatientOfCase(caseId, 'SYSTEM', 'Your travel plan was updated', 'Open your travel page to see flights, hotel and pickup details.', tx);
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'travel.update', resourceType: 'TravelPlan', resourceId: p.id, metadata: { flights: flights.length, hotels: hotels.length, transports: transports.length }, ...ctx }, tx);
      return tx.travelPlan.findUniqueOrThrow({ where: { id: p.id }, include });
    });
    return this.dto(plan, true);
  }
}

@Controller('travel')
export class TravelController {
  constructor(private readonly svc: TravelService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) { return this.svc.list(u, q); }
  @Get('case/:caseId') get(@CurrentUser() u: AuthUser, @Param('caseId', new ParseUUIDPipe()) id: string) { return this.svc.getForCase(u, id); }
  @Put('case/:caseId') save(@CurrentUser() u: AuthUser, @Param('caseId', new ParseUUIDPipe()) id: string, @Body(new ZodPipe(planSchema)) d: z.infer<typeof planSchema>, @Ctx() c: ReqCtx) { return this.svc.save(u, id, d, c); }
}

@Module({ imports: [CasesModule], controllers: [TravelController], providers: [TravelService], exports: [TravelService] })
export class TravelModule {}
