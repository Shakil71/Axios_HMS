'use client';

import Link from 'next/link';
import { Avatar, Badge, EmptyState } from '@/components/ui';
import type { Workspace } from '@/lib/console-types';
import { useGet } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/labels';
import { roleLabel } from '@/lib/roles';
import { scheduleRows } from '@/lib/schedule';
import { APPT_STATUS, APPT_TYPE, CASE_STATUS, DOC_CATEGORY, INVOICE_STATUS, METHOD, VISA_STATUS, entry, fmtWhen, money, relTime } from '@/lib/status';
import { DoctorPhoto } from '@/components/ui';
import { usePermissions } from '../providers';
import { Distribution, ErrorNote, Kpi, PALETTE, PageHeader, Panel, PriorityDot, Skeleton, StatusBadge } from '../kit';

function useWorkspace() {
  return useGet<Workspace>(['workspace'], '/workspace/overview', { refetchMs: 45_000 });
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

// ─────────────────────────── staff ───────────────────────────
export function StaffWorkspaceScreen() {
  const { me, can } = usePermissions();
  const q = useWorkspace();
  const w = q.data;
  return (
    <>
      <PageHeader title={`${greeting()}, ${me.fullName.split(' ')[0]}`} subtitle={`${me.roles.map(roleLabel).join(', ')} · here is what needs you today`} />
      {q.isError && <ErrorNote error={q.error} retry={() => q.refetch()} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi loading={!w} label="My active cases" value={w?.cases.active} hint={w && w.cases.urgent ? `${w.cases.urgent} urgent` : undefined} icon="folder" tone={w && w.cases.urgent ? 'danger' : 'info'} href="/staff/cases" />
        <Kpi loading={!w} label="Documents to review" value={w?.documents.total} icon="file" tone="warning" href="/staff/documents" />
        <Kpi loading={!w} label="Appointments today" value={w?.appointments.todayTotal} hint={w ? `${w.appointments.upcomingTotal} upcoming` : undefined} icon="calendar" href="/staff/appointments" />
        {can('visa.view') ? <Kpi loading={!w} label="Open visa cases" value={w?.visa?.open ?? 0} icon="stamp" tone="warning" href="/staff/visa" />
          : can('travel.view') ? <Kpi loading={!w} label="Travel plans" value={w?.travel?.total ?? 0} icon="plane" href="/staff/travel" />
          : can('payments.view') ? <Kpi loading={!w} label="Invoices to collect" value={w?.invoices ? w.invoices.pending + w.invoices.partial : 0} icon="card" tone="warning" href="/staff/payments" />
          : <Kpi loading={!w} label="Unread notifications" value={w?.unreadNotifications} icon="bell" />}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel title="My cases" className="xl:col-span-2" pad={false} action={<Link href="/staff/cases" className="text-sm font-medium">View all</Link>}>
          {!w ? <div className="p-4"><Skeleton className="h-40" /></div> : w.cases.recent.length === 0 ? <div className="p-4"><EmptyState title="No cases assigned to you yet">An admin will assign cases to you.</EmptyState></div> : (
            <ul className="divide-y divide-ink-100">
              {w.cases.recent.map((c) => (
                <li key={c.id}>
                  <Link href={`/staff/cases/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-ink-50 sm:px-5">
                    <div className="min-w-0 basis-full sm:flex-1 sm:basis-0"><p className="truncate font-semibold text-ink-900">{c.patient.fullName}</p><p className="truncate text-sm text-ink-600">{c.treatment ?? 'Treatment not chosen'}{c.country ? ` · ${c.country}` : ''} · <span className="font-mono text-xs">{c.caseNumber}</span></p></div>
                    <PriorityDot p={c.priority} />
                    <StatusBadge e={entry(CASE_STATUS, c.status)} />
                    <span className="ml-auto text-xs text-ink-500 sm:w-24 sm:text-right">{relTime(c.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Upcoming appointments" pad={false} action={can('appointments.view') ? <Link href="/staff/appointments" className="text-sm font-medium">Calendar</Link> : undefined}>
          {!w ? <div className="p-4"><Skeleton className="h-40" /></div> : w.appointments.upcoming.length === 0 ? <div className="p-4 text-sm text-ink-600">Nothing scheduled.</div> : (
            <ul className="divide-y divide-ink-100">
              {w.appointments.upcoming.slice(0, 5).map((a) => (
                <li key={a.id} className="px-4 py-3 sm:px-5">
                  <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-ink-900">{fmtWhen(a.scheduledAt)}</p><StatusBadge e={entry(APPT_STATUS, a.status)} /></div>
                  <p className="text-sm text-ink-700">{a.patient?.fullName} · {APPT_TYPE[a.type]}</p>
                  <p className="text-xs text-ink-500">{a.doctor ? `Dr. ${a.doctor.fullName}` : 'No doctor yet'} · {METHOD[a.method]}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title={`Documents waiting for review${w ? ` (${w.documents.total})` : ''}`} pad={false} action={<Link href="/staff/documents" className="text-sm font-medium">Open queue</Link>}>
          {!w ? <div className="p-4"><Skeleton className="h-32" /></div> : w.documents.items.length === 0 ? <div className="p-4 text-sm text-ink-600">Nothing waiting. Only documents your role may verify appear here.</div> : (
            <ul className="divide-y divide-ink-100">
              {w.documents.items.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3 sm:px-5"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{DOC_CATEGORY[d.category] ?? d.category}</p><p className="truncate text-xs text-ink-600">{d.patient?.fullName} · {d.caseNumber}</p></div><span className="text-xs text-ink-500">{relTime(d.createdAt)}</span></li>
              ))}
            </ul>
          )}
        </Panel>

        {w?.visa && (
          <Panel title="Visa applications" pad={false} action={<Link href="/staff/visa" className="text-sm font-medium">All visas</Link>}>
            {w.visa.items.length === 0 ? <div className="p-4 text-sm text-ink-600">No open applications.</div> : (
              <ul className="divide-y divide-ink-100">{w.visa.items.map((v) => <li key={v.id} className="flex items-center gap-3 px-4 py-3 sm:px-5"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{v.patient?.fullName} · {v.country.name}</p><p className="text-xs text-ink-600">{v.missingCount ? `${v.missingCount} document${v.missingCount > 1 ? 's' : ''} missing` : 'Checklist complete'}</p></div><StatusBadge e={entry(VISA_STATUS, v.status)} /></li>)}</ul>
            )}
          </Panel>
        )}
        {w?.travel && !w.visa && (
          <Panel title="Travel plans" pad={false} action={<Link href="/staff/travel" className="text-sm font-medium">All plans</Link>}>
            <ul className="divide-y divide-ink-100">{w.travel.items.map((t) => <li key={t.id} className="px-4 py-3 sm:px-5"><p className="text-sm font-semibold">{t.patient?.fullName} · {t.case.caseNumber}</p><p className="text-xs text-ink-600">{t.nextMilestone ? `Next: ${fmtDateTime(t.nextMilestone)}` : 'All milestones passed'}</p></li>)}</ul>
          </Panel>
        )}
        {w?.invoices && (
          <Panel title="Invoices to collect" pad={false} action={<Link href="/staff/payments" className="text-sm font-medium">All invoices</Link>}>
            {w.invoices.items.length === 0 ? <div className="p-4 text-sm text-ink-600">Everything is paid.</div> : (
              <ul className="divide-y divide-ink-100">{w.invoices.items.map((i) => <li key={i.id} className="flex items-center gap-3 px-4 py-3 sm:px-5"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{i.patient?.fullName}</p><p className="font-mono text-xs text-ink-600">{i.invoiceNumber}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums">{money(i.balance, i.currency)}</p>{i.overdue ? <Badge tone="danger">Overdue</Badge> : <StatusBadge e={entry(INVOICE_STATUS, i.status)} />}</div></li>)}</ul>
            )}
          </Panel>
        )}
        {w && w.cases.byStatus.length > 0 && (
          <Panel title="My cases by stage"><Distribution parts={w.cases.byStatus.map((c, i) => ({ label: c.label.length > 28 ? entry(CASE_STATUS, c.status).label : c.label, value: c.count, color: PALETTE[i % PALETTE.length] }))} /></Panel>
        )}
      </div>
    </>
  );
}

// ─────────────────────────── doctor ───────────────────────────
export function DoctorTodayScreen() {
  const q = useWorkspace();
  const w = q.data;
  const doc = w?.doctor;
  const today = w?.appointments.upcoming.filter((a) => new Date(a.scheduledAt).toDateString() === new Date().toDateString()) ?? [];
  const rows = doc ? scheduleRows(doc.availability) : [];

  return (
    <>
      <PageHeader title={doc ? `${greeting()}, Dr. ${doc.fullName.split(' ').slice(-1)[0]}` : 'Doctor workspace'} subtitle="Your patients, appointments and reports" />
      {q.isError && <ErrorNote error={q.error} retry={() => q.refetch()} />}
      {w && !doc && <EmptyState title="No doctor profile is linked to your account">Ask an administrator to link your account to your doctor profile.</EmptyState>}

      {doc && (
        <>
          <Panel className="mb-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <DoctorPhoto name={doc.fullName} photoKey={doc.photoKey} size={88} rounded="xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{[doc.title, doc.fullName].filter(Boolean).join(' ')}</h2>{doc.isVerified && <Badge tone="success">Verified profile</Badge>}{doc.isDemo && <Badge tone="warning">Sample profile</Badge>}</div>
                <p className="text-sm text-ink-600">{doc.designation}</p>
                <p className="mt-1 text-sm text-ink-700">{doc.specialties.map((s) => s.specialty.name).join(', ')} · {doc.hospitals[0]?.hospital.name}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs"><Link href={`/doctors/${doc.slug}`} className="font-semibold">View my public profile</Link><span className="text-ink-300">·</span><Link href="/doctor/hours" className="font-semibold">Edit consultation hours</Link></div>
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Today" value={today.length} hint="appointments" icon="calendar" href="/doctor/schedule" />
            <Kpi label="Next 7 days" value={doc.stats.appointmentsNext7Days} hint="appointments" icon="clock" href="/doctor/schedule" />
            <Kpi label="Active patients" value={doc.stats.activePatients} icon="users" tone="success" href="/doctor/patients" />
            <Kpi label="Completed (30 days)" value={doc.stats.completedLast30Days} icon="check" tone="success" />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <Panel title="Upcoming appointments" className="xl:col-span-2" pad={false} action={<Link href="/doctor/schedule" className="text-sm font-medium">Full schedule</Link>}>
              {w!.appointments.upcoming.length === 0 ? <div className="p-4"><EmptyState title="No upcoming appointments">New bookings from the coordination team appear here.</EmptyState></div> : (
                <ul className="divide-y divide-ink-100">
                  {w!.appointments.upcoming.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
                      <div className="w-32 shrink-0"><p className="text-sm font-semibold text-ink-900">{fmtWhen(a.scheduledAt)}</p><p className="text-xs text-ink-500">{a.durationMinutes} min</p></div>
                      <div className="min-w-0 flex-1"><p className="truncate font-medium">{a.patient?.fullName}</p><p className="truncate text-sm text-ink-600">{APPT_TYPE[a.type]} · {METHOD[a.method]}</p></div>
                      <StatusBadge e={entry(APPT_STATUS, a.status)} />
                      {a.meetingUrl && <a href={a.meetingUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800 no-underline">Join video</a>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="My consultation hours" action={<Link href="/doctor/hours" className="text-sm font-medium">Edit</Link>}>
              {rows.length === 0 ? <p className="text-sm text-ink-600">No hours set yet.</p> : (
                <ul className="space-y-3">{rows.map((r) => <li key={r.days + r.local} className="text-sm"><p className="font-semibold">{r.days}</p><p className="text-ink-700">{r.local} <span className="text-ink-500">({r.place})</span></p><p className="text-xs text-ink-500">{r.bangladesh} Bangladesh · {r.method}</p></li>)}</ul>
              )}
            </Panel>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Panel title="Active patients" pad={false} action={<Link href="/doctor/patients" className="text-sm font-medium">All patients</Link>}>
              {w!.cases.recent.length === 0 ? <div className="p-4 text-sm text-ink-600">No active patients.</div> : (
                <ul className="divide-y divide-ink-100">
                  {w!.cases.recent.slice(0, 6).map((c) => (
                    <li key={c.id}><Link href={`/doctor/cases/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50 sm:px-5"><Avatar name={c.patient.fullName} size={36} /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{c.patient.fullName}</p><p className="truncate text-xs text-ink-600">{c.treatment ?? 'Treatment not chosen'}</p></div><StatusBadge e={entry(CASE_STATUS, c.status)} /></Link></li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Recent reports from patients" pad={false} action={<Link href="/doctor/documents" className="text-sm font-medium">All documents</Link>}>
              <p className="border-b border-ink-100 px-4 py-2 text-xs text-ink-500 sm:px-5">You can view medical reports for patients you are linked to. Identity documents are not shown to doctors.</p>
              <DocPreview />
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

function DocPreview() {
  const list = useGet<{ id: string; categoryLabel: string; patient?: { fullName: string }; caseNumber?: string | null; createdAt: string; statusLabel: string }[]>(['doctor-docs'], '/documents?pageSize=5');
  if (list.isLoading) return <div className="p-4"><Skeleton className="h-24" /></div>;
  const items = list.data ?? [];
  if (!items.length) return <div className="p-4 text-sm text-ink-600">No reports yet.</div>;
  return <ul className="divide-y divide-ink-100">{items.map((d) => <li key={d.id} className="flex items-center gap-3 px-4 py-3 sm:px-5"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold capitalize">{d.categoryLabel}</p><p className="truncate text-xs text-ink-600">{d.patient?.fullName} · {d.caseNumber}</p></div><span className="text-xs text-ink-500">{relTime(d.createdAt)}</span></li>)}</ul>;
}
