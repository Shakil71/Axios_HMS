import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

const ACTIVE_CASE = { deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] as ('COMPLETED' | 'CANCELLED')[] } };
const OPEN_VISA = ['DOCUMENT_COLLECTION', 'SUBMITTED', 'UNDER_PROCESSING', 'ADDITIONAL_DOCUMENT_REQUIRED'] as const;
const day = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

/** Aggregate numbers for the admin dashboard and reports. All heavy lifting is done in the database. */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  private async casesPerDay(from: Date, days: number) {
    const rows = await this.prisma.$queryRaw<{ d: Date; n: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS d, count(*) AS n FROM medical_cases WHERE "createdAt" >= ${from} AND "deletedAt" IS NULL GROUP BY 1`;
    const byDay = new Map(rows.map((r) => [day(new Date(r.d)), Number(r.n)]));
    return Array.from({ length: days }, (_, i) => {
      const d = day(new Date(from.getTime() + i * 86_400_000));
      return { date: d, count: byDay.get(d) ?? 0 };
    });
  }

  private async revenueByMonth(months: number) {
    const from = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (months - 1), 1));
    const rows = await this.prisma.$queryRaw<{ m: Date; currency: string; total: Prisma.Decimal }[]>`
      SELECT date_trunc('month', "paidAt") AS m, currency, sum(amount) AS total FROM payments
      WHERE status = 'SUCCEEDED' AND "paidAt" >= ${from} GROUP BY 1, 2 ORDER BY 1`;
    return { from, rows: rows.map((r) => ({ month: new Date(r.m).toISOString().slice(0, 7), currency: r.currency, total: Number(r.total) })) };
  }

  private async moneyTotals() {
    const paid = await this.prisma.payment.groupBy({ by: ['currency'], where: { status: 'SUCCEEDED' }, _sum: { amount: true } });
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const thisMonth = await this.prisma.payment.groupBy({ by: ['currency'], where: { status: 'SUCCEEDED', paidAt: { gte: monthStart } }, _sum: { amount: true } });
    const open = await this.prisma.invoice.findMany({ where: { status: { in: ['PENDING', 'PARTIAL'] } }, select: { currency: true, total: true, dueDate: true, payments: { where: { status: 'SUCCEEDED' }, select: { amount: true } } } });
    const outstanding = new Map<string, number>();
    let overdue = 0;
    for (const i of open) {
      const bal = Number(i.total) - i.payments.reduce((s, p) => s + Number(p.amount), 0);
      outstanding.set(i.currency, (outstanding.get(i.currency) ?? 0) + bal);
      if (i.dueDate && i.dueDate < new Date()) overdue++;
    }
    return {
      revenue: paid.map((p) => ({ currency: p.currency, total: Number(p._sum.amount ?? 0) })),
      revenueThisMonth: thisMonth.map((p) => ({ currency: p.currency, total: Number(p._sum.amount ?? 0) })),
      outstanding: [...outstanding].map(([currency, total]) => ({ currency, total })),
      overdueInvoices: overdue,
    };
  }

  async staffWorkload() {
    const rows = await this.prisma.caseAssignment.groupBy({ by: ['staffId'], where: { unassignedAt: null, case: { is: ACTIVE_CASE } }, _count: { _all: true } });
    const staff = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.staffId) } },
      select: { id: true, fullName: true, roles: { select: { role: { select: { name: true } } } } },
    });
    const byId = new Map(staff.map((s) => [s.id, s]));
    return rows
      .map((r) => ({ staffId: r.staffId, fullName: byId.get(r.staffId)?.fullName ?? 'Unknown', roles: byId.get(r.staffId)?.roles.map((x) => x.role.name) ?? [], activeCases: r._count._all }))
      .sort((a, b) => b.activeCases - a.activeCases);
  }

  async overview() {
    const d30 = daysAgo(30);
    const now = new Date();
    const [
      totalPatients, newPatients, activeCases, pendingDocuments, pendingVisa, upcomingAppointments, inTreatment, casesByStatus,
      urgentCases, unassignedCases, rejectedDocs, money, perDay, revenue, workload, recent, byCountry, byTreatment, docsByStatus,
    ] = await Promise.all([
      this.prisma.patientProfile.count({ where: { deletedAt: null } }),
      this.prisma.patientProfile.count({ where: { deletedAt: null, createdAt: { gte: d30 } } }),
      this.prisma.medicalCase.count({ where: ACTIVE_CASE }),
      this.prisma.document.count({ where: { deletedAt: null, status: { in: ['UPLOADED', 'UNDER_REVIEW'] }, versions: { some: { completedAt: { not: null } } } } }),
      this.prisma.visaCase.count({ where: { status: { in: [...OPEN_VISA] } } }),
      this.prisma.appointment.count({ where: { scheduledAt: { gte: now }, status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'] } } }),
      this.prisma.medicalCase.count({ where: { deletedAt: null, status: 'TREATMENT_IN_PROGRESS' } }),
      this.prisma.medicalCase.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      this.prisma.medicalCase.count({ where: { ...ACTIVE_CASE, priority: 'URGENT' } }),
      this.prisma.medicalCase.count({ where: { ...ACTIVE_CASE, assignments: { none: { unassignedAt: null } } } }),
      this.prisma.document.count({ where: { deletedAt: null, status: 'REJECTED' } }),
      this.moneyTotals(),
      this.casesPerDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29)), 30),
      this.revenueByMonth(6),
      this.staffWorkload(),
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, action: true, resourceType: true, createdAt: true, actor: { select: { fullName: true } }, actorRole: true } }),
      this.prisma.medicalCase.groupBy({ by: ['preferredCountryId'], where: { deletedAt: null, preferredCountryId: { not: null } }, _count: { _all: true }, orderBy: { _count: { preferredCountryId: 'desc' } }, take: 6 }),
      this.prisma.medicalCase.groupBy({ by: ['treatmentId'], where: { deletedAt: null, treatmentId: { not: null } }, _count: { _all: true }, orderBy: { _count: { treatmentId: 'desc' } }, take: 6 }),
      this.prisma.document.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
    ]);

    const countries = await this.prisma.country.findMany({ where: { id: { in: byCountry.map((c) => c.preferredCountryId!) } }, select: { id: true, name: true } });
    const treatments = await this.prisma.treatment.findMany({ where: { id: { in: byTreatment.map((t) => t.treatmentId!) } }, select: { id: true, name: true } });

    return {
      kpis: {
        totalPatients, newPatients30d: newPatients, activeCases, pendingDocuments, pendingVisaCases: pendingVisa, upcomingAppointments, treatmentInProgress: inTreatment,
        urgentCases, unassignedCases, rejectedDocuments: rejectedDocs, ...money,
      },
      casesByStatus: casesByStatus.map((c) => ({ status: c.status, count: c._count._all })),
      casesPerDay: perDay,
      revenueByMonth: revenue.rows,
      casesByCountry: byCountry.map((c) => ({ name: countries.find((x) => x.id === c.preferredCountryId)?.name ?? '—', count: c._count._all })),
      topTreatments: byTreatment.map((t) => ({ name: treatments.find((x) => x.id === t.treatmentId)?.name ?? '—', count: t._count._all })),
      documentsByStatus: docsByStatus.map((d) => ({ status: d.status, count: d._count._all })),
      staffWorkload: workload,
      recentActivity: recent.map((r) => ({ id: r.id, action: r.action, resourceType: r.resourceType, at: r.createdAt, actor: r.actor?.fullName ?? null, role: r.actorRole })),
      generatedAt: now,
    };
  }

  /** Reports page: broader ranges and a few extra breakdowns. */
  async report(from: Date, to: Date) {
    const range = { createdAt: { gte: from, lte: to } };
    const [created, completed, byStatus, byCountry, byTreatment, byPriority, apptByType, apptByStatus, visaByStatus, docsByCategory, invoicesByStatus, avgClose, revenue, workload] = await Promise.all([
      this.prisma.medicalCase.count({ where: { deletedAt: null, ...range } }),
      this.prisma.medicalCase.count({ where: { deletedAt: null, status: 'COMPLETED', closedAt: { gte: from, lte: to } } }),
      this.prisma.medicalCase.groupBy({ by: ['status'], where: { deletedAt: null, ...range }, _count: { _all: true } }),
      this.prisma.medicalCase.groupBy({ by: ['preferredCountryId'], where: { deletedAt: null, ...range }, _count: { _all: true } }),
      this.prisma.medicalCase.groupBy({ by: ['treatmentId'], where: { deletedAt: null, ...range }, _count: { _all: true } }),
      this.prisma.medicalCase.groupBy({ by: ['priority'], where: { deletedAt: null, ...range }, _count: { _all: true } }),
      this.prisma.appointment.groupBy({ by: ['type'], where: { scheduledAt: { gte: from, lte: to } }, _count: { _all: true } }),
      this.prisma.appointment.groupBy({ by: ['status'], where: { scheduledAt: { gte: from, lte: to } }, _count: { _all: true } }),
      this.prisma.visaCase.groupBy({ by: ['status'], where: range, _count: { _all: true } }),
      this.prisma.document.groupBy({ by: ['category'], where: { deletedAt: null, ...range }, _count: { _all: true } }),
      this.prisma.invoice.groupBy({ by: ['status', 'currency'], where: { issuedAt: { gte: from, lte: to } }, _count: { _all: true }, _sum: { total: true } }),
      this.prisma.$queryRaw<{ days: number | null }[]>`SELECT avg(extract(epoch FROM ("closedAt" - "createdAt")) / 86400) AS days FROM medical_cases WHERE status = 'COMPLETED' AND "closedAt" IS NOT NULL AND "closedAt" BETWEEN ${from} AND ${to}`,
      this.revenueByMonth(12),
      this.staffWorkload(),
    ]);
    const countries = await this.prisma.country.findMany({ select: { id: true, name: true } });
    const treatments = await this.prisma.treatment.findMany({ select: { id: true, name: true } });
    const cName = (id: string | null) => countries.find((c) => c.id === id)?.name ?? 'Not chosen';
    const tName = (id: string | null) => treatments.find((t) => t.id === id)?.name ?? 'Not chosen';
    return {
      range: { from, to },
      cases: { created, completed, avgDaysToComplete: avgClose[0]?.days ? Math.round(Number(avgClose[0].days) * 10) / 10 : null },
      casesByStatus: byStatus.map((x) => ({ label: x.status, count: x._count._all })),
      casesByCountry: byCountry.map((x) => ({ label: cName(x.preferredCountryId), count: x._count._all })).sort((a, b) => b.count - a.count),
      casesByTreatment: byTreatment.map((x) => ({ label: tName(x.treatmentId), count: x._count._all })).sort((a, b) => b.count - a.count),
      casesByPriority: byPriority.map((x) => ({ label: x.priority, count: x._count._all })),
      appointmentsByType: apptByType.map((x) => ({ label: x.type, count: x._count._all })),
      appointmentsByStatus: apptByStatus.map((x) => ({ label: x.status, count: x._count._all })),
      visaByStatus: visaByStatus.map((x) => ({ label: x.status, count: x._count._all })),
      documentsByCategory: docsByCategory.map((x) => ({ label: x.category, count: x._count._all })).sort((a, b) => b.count - a.count),
      invoices: invoicesByStatus.map((x) => ({ status: x.status, currency: x.currency, count: x._count._all, total: Number(x._sum.total ?? 0) })),
      revenueByMonth: revenue.rows,
      staffWorkload: workload,
    };
  }
}
