import { Body, Controller, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CasesModule } from '../cases/cases.controller';
import { TimelineService } from '../cases/timeline.service';
import { AppError, conflict, forbidden, notFound } from '../common/http/errors';
import { Ctx, ReqCtx } from '../common/http/request-context';
import { Paginated, ZodPipe, pageParams } from '../common/http/response';
import { PrismaService, Tx } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser, CurrentUser, can, primaryRole } from '../rbac/auth-user';
import { ScopeService } from '../rbac/scope.service';

const D = Prisma.Decimal;
const text = (n: number) => z.string().trim().max(n);
const money = z.number().positive().max(1e9);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'REFUNDED', 'CANCELLED']).optional(), caseId: z.uuid().optional(), q: text(60).optional(),
});
const createSchema = z
  .object({
    caseId: z.uuid(), currency: z.string().length(3).toUpperCase().default('USD'),
    items: z.array(z.object({ description: text(200).min(1), quantity: z.number().int().min(1).max(1000).default(1), unitPrice: money })).min(1).max(30),
    discount: z.number().min(0).max(1e9).default(0), tax: z.number().min(0).max(1e9).default(0), dueDate: z.coerce.date().nullish(), notes: text(500).nullish(),
  })
  .strict();
const paySchema = z
  .object({ amount: money, method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE_BANKING', 'OTHER']), transactionId: text(80).nullish(), paidAt: z.coerce.date().optional() })
  .strict();
const refundSchema = z.object({ reason: text(300).min(3) }).strict();

const include = {
  items: true,
  payments: { orderBy: { createdAt: 'asc' as const } },
  case: { select: { id: true, caseNumber: true } },
  patient: { select: { id: true, user: { select: { fullName: true } } } },
} satisfies Prisma.InvoiceInclude;
type Row = Prisma.InvoiceGetPayload<{ include: typeof include }>;

const paidOf = (i: { payments: { status: string; amount: Prisma.Decimal }[] }) =>
  i.payments.filter((p) => p.status === 'SUCCEEDED').reduce((s, p) => s.plus(p.amount), new D(0));

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
    private readonly notifications: NotificationsService,
  ) {}

  private dto(i: Row, staff: boolean) {
    const paid = paidOf(i);
    return {
      id: i.id, invoiceNumber: i.invoiceNumber, status: i.status, currency: i.currency, case: i.case,
      subtotal: i.subtotal.toNumber(), discount: i.discount.toNumber(), tax: i.tax.toNumber(), total: i.total.toNumber(),
      paid: paid.toNumber(), balance: Decimal(i.total).minus(paid).toNumber(), issuedAt: i.issuedAt, dueDate: i.dueDate, notes: i.notes,
      overdue: !!i.dueDate && i.dueDate < new Date() && ['PENDING', 'PARTIAL'].includes(i.status),
      items: i.items.map((x) => ({ id: x.id, description: x.description, quantity: x.quantity, unitPrice: x.unitPrice.toNumber(), amount: x.amount.toNumber() })),
      payments: i.payments.map((p) => ({ id: p.id, amount: p.amount.toNumber(), currency: p.currency, method: p.method, status: p.status, transactionId: p.transactionId, receiptNumber: p.receiptNumber, paidAt: p.paidAt })),
      ...(staff ? { patient: { id: i.patient.id, fullName: i.patient.user.fullName } } : {}),
    };
  }

  /** Patients: own invoices. Staff: payments.view (finance/admin) — they see money, never medical content. */
  private where(user: AuthUser, need?: 'payments.create'): Prisma.InvoiceWhereInput | null {
    if (!this.scope.isStaff(user)) return user.patientProfileId && !need ? { patientId: user.patientProfileId } : null;
    return can(user, need ?? 'payments.view') ? {} : null;
  }

  private async load(user: AuthUser, id: string, need?: 'payments.create') {
    const where = this.where(user, need);
    if (!where) throw forbidden();
    const i = await this.prisma.invoice.findFirst({ where: { AND: [{ id }, where] }, include });
    if (!i) throw notFound('We could not find this invoice.');
    return i;
  }

  async list(user: AuthUser, q: z.infer<typeof listQuery>) {
    const scope = this.where(user);
    if (!scope) throw forbidden();
    const { page, pageSize, skip, take } = pageParams(q);
    const where: Prisma.InvoiceWhereInput = {
      AND: [
        scope, q.status ? { status: q.status } : {}, q.caseId ? { caseId: q.caseId } : {},
        q.q ? { OR: [{ invoiceNumber: { contains: q.q, mode: 'insensitive' } }, { patient: { user: { fullName: { contains: q.q, mode: 'insensitive' } } } }, { case: { caseNumber: { contains: q.q, mode: 'insensitive' } } }] } : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({ where, skip, take, include, orderBy: { issuedAt: 'desc' } }),
      this.prisma.invoice.count({ where }),
    ]);
    const staff = this.scope.isStaff(user);
    return new Paginated(rows.map((r) => this.dto(r, staff)), { page, pageSize, total });
  }

  async get(user: AuthUser, id: string) {
    return this.dto(await this.load(user, id), this.scope.isStaff(user));
  }

  private async nextInvoiceNumber(tx: Tx) {
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('invoice_number_seq') AS n`;
    return `INV-${new Date().getFullYear()}-${n.toString().padStart(6, '0')}`;
  }

  async create(user: AuthUser, dto: z.infer<typeof createSchema>, ctx: ReqCtx) {
    if (!this.where(user, 'payments.create')) throw forbidden();
    const c = await this.prisma.medicalCase.findFirst({ where: { id: dto.caseId, deletedAt: null }, select: { id: true, patientId: true } });
    if (!c) throw notFound('We could not find this treatment case.');
    const lines = dto.items.map((x) => ({ ...x, amount: new D(x.unitPrice).times(x.quantity) }));
    const subtotal = lines.reduce((s, l) => s.plus(l.amount), new D(0));
    const total = subtotal.minus(dto.discount).plus(dto.tax);
    if (total.lte(0)) throw new AppError(422, 'VALIDATION_FAILED', 'The invoice total must be more than zero.', [{ field: 'discount', message: 'Discount is too large.' }]);

    const inv = await this.prisma.$transaction(async (tx) => {
      const row = await tx.invoice.create({
        data: {
          invoiceNumber: await this.nextInvoiceNumber(tx), caseId: c.id, patientId: c.patientId, currency: dto.currency, subtotal, discount: dto.discount, tax: dto.tax, total,
          dueDate: dto.dueDate, notes: dto.notes, createdById: user.id,
          items: { create: lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount })) },
        },
        include,
      });
      await this.timeline.record({ caseId: c.id, type: 'PAYMENT_UPDATED', title: `Invoice ${row.invoiceNumber} issued`, description: `${row.currency} ${total.toFixed(2)}`, actorId: user.id }, tx);
      await this.notifications.notifyPatientOfCase(c.id, 'SYSTEM', `New invoice ${row.invoiceNumber}`, `${row.currency} ${total.toFixed(2)}`, tx);
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'payment.invoice_create', resourceType: 'Invoice', resourceId: row.id, after: { total: total.toString(), currency: row.currency }, ...ctx }, tx);
      return row;
    });
    return this.dto(inv, true);
  }

  private async settle(tx: Tx, invoiceId: string) {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });
    if (inv.status === 'CANCELLED') return inv.status;
    const paid = paidOf(inv);
    const refunded = inv.payments.some((p) => p.status === 'REFUNDED');
    const status = paid.lte(0) ? (refunded ? 'REFUNDED' : 'PENDING') : paid.gte(inv.total) ? 'PAID' : 'PARTIAL';
    await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
    return status;
  }

  async pay(user: AuthUser, id: string, dto: z.infer<typeof paySchema>, ctx: ReqCtx) {
    const inv = await this.load(user, id, 'payments.create');
    if (['CANCELLED', 'PAID'].includes(inv.status)) throw conflict('This invoice cannot take more payments.', 'INVOICE_CLOSED');
    const balance = new D(inv.total).minus(paidOf(inv));
    if (new D(dto.amount).gt(balance)) throw new AppError(422, 'VALIDATION_FAILED', `The payment is more than the balance (${balance.toFixed(2)}).`, [{ field: 'amount', message: 'More than the balance.' }]);

    const result = await this.prisma.$transaction(async (tx) => {
      const n = inv.payments.length + 1;
      const p = await tx.payment.create({
        data: {
          invoiceId: id, amount: dto.amount, currency: inv.currency, method: dto.method, provider: 'manual', transactionId: dto.transactionId, status: 'SUCCEEDED',
          paidAt: dto.paidAt ?? new Date(), receiptNumber: `RCT-${inv.invoiceNumber.slice(4)}-${n}`, recordedById: user.id,
        },
      });
      const status = await this.settle(tx, id);
      await this.timeline.record({ caseId: inv.caseId, type: 'PAYMENT_UPDATED', title: 'Payment received', description: `${inv.currency} ${new D(dto.amount).toFixed(2)} · ${p.receiptNumber}`, actorId: user.id }, tx);
      await this.notifications.notifyPatientOfCase(inv.caseId, 'PAYMENT_RECEIVED', 'Payment received', `${inv.currency} ${new D(dto.amount).toFixed(2)} · receipt ${p.receiptNumber}`, tx);
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'payment.create', resourceType: 'Invoice', resourceId: id, after: { amount: String(dto.amount), status }, ...ctx }, tx);
      return status;
    });
    void result;
    return this.get(user, id);
  }

  async cancel(user: AuthUser, id: string, ctx: ReqCtx) {
    const inv = await this.load(user, id, 'payments.create');
    if (inv.status === 'CANCELLED') throw conflict('This invoice is already cancelled.', 'NO_CHANGE');
    if (inv.payments.some((p) => p.status === 'SUCCEEDED')) throw conflict('An invoice with payments cannot be cancelled. Refund the payments first.', 'HAS_PAYMENTS');
    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'payment.invoice_cancel', resourceType: 'Invoice', resourceId: id, ...ctx }, tx);
    });
    return this.get(user, id);
  }

  async refund(user: AuthUser, paymentId: string, dto: z.infer<typeof refundSchema>, ctx: ReqCtx) {
    if (!this.scope.isStaff(user) || !can(user, 'payments.refund')) throw forbidden();
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true, status: true, invoiceId: true, amount: true, currency: true, invoice: { select: { caseId: true } } } });
    if (!p) throw notFound('We could not find this payment.');
    if (p.status !== 'SUCCEEDED') throw conflict('Only completed payments can be refunded.', 'NOT_REFUNDABLE');
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED' } });
      const status = await this.settle(tx, p.invoiceId);
      await this.timeline.record({ caseId: p.invoice.caseId, type: 'PAYMENT_UPDATED', title: 'A payment was refunded', description: `${p.currency} ${p.amount.toFixed(2)}`, actorId: user.id }, tx);
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'payment.refund', resourceType: 'Invoice', resourceId: p.invoiceId, metadata: { paymentId, reason: dto.reason, status }, ...ctx }, tx);
    });
    return this.get(user, p.invoiceId);
  }
}

const Decimal = (v: Prisma.Decimal) => new D(v);

@Controller()
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}
  @Get('invoices') list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) { return this.svc.list(u, q); }
  @Get('invoices/:id') get(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) { return this.svc.get(u, id); }
  @Post('invoices') create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createSchema)) d: z.infer<typeof createSchema>, @Ctx() c: ReqCtx) { return this.svc.create(u, d, c); }
  @Post('invoices/:id/payments') @HttpCode(200) pay(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodPipe(paySchema)) d: z.infer<typeof paySchema>, @Ctx() c: ReqCtx) { return this.svc.pay(u, id, d, c); }
  @Post('invoices/:id/cancel') @HttpCode(200) cancel(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Ctx() c: ReqCtx) { return this.svc.cancel(u, id, c); }
  @Post('payments/:id/refund') @HttpCode(200) refund(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodPipe(refundSchema)) d: z.infer<typeof refundSchema>, @Ctx() c: ReqCtx) { return this.svc.refund(u, id, d, c); }
}

@Module({ imports: [CasesModule], controllers: [PaymentsController], providers: [PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}
