'use client';

import Link from 'next/link';
import { useGet } from '@/lib/hooks';
import type { AdminOverview } from '@/lib/console-types';
import { compactMoney, entry, CASE_STATUS, relTime } from '@/lib/status';
import { fmtDay } from '@/lib/status';
import { roleLabel } from '@/lib/roles';
import { AreaChart, BarList, Columns, Distribution, ErrorNote, Kpi, PALETTE, PageHeader, Panel, Skeleton } from '../kit';
import { Badge } from '@/components/ui';

const primary = (rows: { currency: string; total: number }[]) => rows.find((r) => r.currency === 'USD') ?? rows[0];
const fmtMoney = (rows: { currency: string; total: number }[]) => (primary(rows) ? compactMoney(primary(rows).total, primary(rows).currency) : '$0');

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Signed in', 'case.view': 'Opened a case', 'case.status': 'Changed a case status', 'document.download': 'Opened a document', 'document.upload': 'Uploaded a document',
  'document.verify': 'Reviewed a document', 'appointment.create': 'Scheduled an appointment', 'visa.update': 'Updated a visa application', 'payment.create': 'Recorded a payment',
  'patient.view': 'Opened a patient record', 'travel.update': 'Updated a travel plan', 'case.note': 'Added a case note', 'staff.create': 'Created a staff account', 'rbac.role_change': 'Changed a role',
};

export function AdminOverviewScreen() {
  const q = useGet<AdminOverview>(['admin-overview'], '/admin/stats/overview', { refetchMs: 60_000 });
  const d = q.data;
  const k = d?.kpis;

  return (
    <>
      <PageHeader title="Overview" subtitle={d ? `Updated ${relTime(d.generatedAt)} · refreshes every minute` : 'Loading the latest numbers…'} />
      {q.isError && <ErrorNote error={q.error} retry={() => q.refetch()} />}

      {(k?.urgentCases || k?.unassignedCases || k?.rejectedDocuments) ? (
        <div className="mb-5 flex flex-wrap gap-2" aria-label="Needs attention">
          {k.urgentCases > 0 && <Link href="/admin/cases?priority=URGENT" className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800">{k.urgentCases} urgent {k.urgentCases === 1 ? 'case' : 'cases'}</Link>}
          {k.unassignedCases > 0 && <Link href="/admin/cases?unassigned=true" className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900">{k.unassignedCases} {k.unassignedCases === 1 ? 'case has' : 'cases have'} no coordinator</Link>}
          {k.rejectedDocuments > 0 && <Link href="/admin/documents?status=REJECTED" className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900">{k.rejectedDocuments} rejected {k.rejectedDocuments === 1 ? 'document' : 'documents'} waiting for a new copy</Link>}
          {k.overdueInvoices > 0 && <Link href="/admin/payments?status=PENDING" className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800">{k.overdueInvoices} overdue {k.overdueInvoices === 1 ? 'invoice' : 'invoices'}</Link>}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi loading={!k} label="Total patients" value={k?.totalPatients} hint={k ? `${k.newPatients30d} new in 30 days` : undefined} icon="users" href="/admin/patients" />
        <Kpi loading={!k} label="Active cases" value={k?.activeCases} hint={k ? `${k.treatmentInProgress} in treatment` : undefined} icon="folder" tone="success" href="/admin/cases" />
        <Kpi loading={!k} label="Documents to review" value={k?.pendingDocuments} icon="file" tone="warning" href="/admin/documents" />
        <Kpi loading={!k} label="Open visa cases" value={k?.pendingVisaCases} icon="stamp" tone="warning" href="/admin/visa" />
        <Kpi loading={!k} label="Upcoming appointments" value={k?.upcomingAppointments} icon="calendar" href="/admin/appointments" />
        <Kpi loading={!k} label="Revenue (all time)" value={k ? fmtMoney(k.revenue) : ''} hint={k ? `${fmtMoney(k.revenueThisMonth)} this month` : undefined} icon="card" tone="success" href="/admin/payments" />
        <Kpi loading={!k} label="Outstanding payments" value={k ? fmtMoney(k.outstanding) : ''} hint={k ? `${k.overdueInvoices} overdue` : undefined} icon="alert" tone={k && k.overdueInvoices ? 'danger' : 'neutral'} href="/admin/payments" />
        <Kpi loading={!k} label="In treatment now" value={k?.treatmentInProgress} icon="pulse" tone="success" />
        <Kpi loading={!k} label="Urgent cases" value={k?.urgentCases} icon="alert" tone={k && k.urgentCases ? 'danger' : 'neutral'} href="/admin/cases?priority=URGENT" />
        <Kpi loading={!k} label="Unassigned cases" value={k?.unassignedCases} icon="user" tone={k && k.unassignedCases ? 'warning' : 'neutral'} href="/admin/cases?unassigned=true" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel title="New cases, last 30 days" className="xl:col-span-2">
          {d ? <AreaChart label="New cases per day" data={d.casesPerDay.map((x) => ({ label: fmtDay(x.date), value: x.count }))} /> : <Skeleton className="h-40" />}
        </Panel>
        <Panel title="Revenue by month">
          {d ? <Columns data={d.revenueByMonth.filter((r) => r.currency === 'USD').map((r) => ({ label: new Date(r.month + '-01').toLocaleString('en', { month: 'short' }), value: r.total }))} format={(n) => compactMoney(n)} /> : <Skeleton className="h-36" />}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Cases by stage" action={<Link href="/admin/cases" className="text-sm font-medium">View all</Link>}>
          {d ? <Distribution parts={d.casesByStatus.map((c, i) => ({ label: entry(CASE_STATUS, c.status).label, value: c.count, color: PALETTE[i % PALETTE.length] }))} /> : <Skeleton className="h-24" />}
        </Panel>
        <Panel title="Documents">
          {d ? <Distribution parts={d.documentsByStatus.map((c, i) => ({ label: c.status.charAt(0) + c.status.slice(1).toLowerCase().replace('_', ' '), value: c.count, color: ['#3fb0c2', '#f59e0b', '#10b981', '#ef4444', '#64748b'][i % 5] }))} /> : <Skeleton className="h-24" />}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Where patients want to go">{d ? <BarList data={d.casesByCountry.map((c) => ({ label: c.name, value: c.count }))} /> : <Skeleton className="h-32" />}</Panel>
        <Panel title="Most requested treatments">{d ? <BarList colorClass="bg-emerald-600" data={d.topTreatments.map((c) => ({ label: c.name, value: c.count }))} /> : <Skeleton className="h-32" />}</Panel>
        <Panel title="Team workload" action={<Link href="/admin/staff" className="text-sm font-medium">Manage staff</Link>}>
          {d ? <BarList colorClass="bg-amber-500" empty="No assigned cases yet." data={d.staffWorkload.slice(0, 6).map((s) => ({ label: s.fullName, value: s.activeCases, sub: s.roles.map(roleLabel).join(', ') }))} format={(n) => `${n} ${n === 1 ? 'case' : 'cases'}`} /> : <Skeleton className="h-32" />}
        </Panel>
      </div>

      <Panel title="Recent activity" className="mt-5" action={<Link href="/admin/audit" className="text-sm font-medium">Full audit log</Link>} pad={false}>
        {!d ? <div className="p-4"><Skeleton className="h-32" /></div> : (
          <ul className="divide-y divide-ink-100">
            {d.recentActivity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm sm:px-5">
                <span className="font-medium text-ink-900">{a.actor ?? 'System'}</span>
                {a.role && <Badge>{roleLabel(a.role)}</Badge>}
                <span className="text-ink-700">{ACTION_LABEL[a.action] ?? a.action}</span>
                <span className="ml-auto text-xs text-ink-500">{relTime(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
