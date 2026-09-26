'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { JourneyStepper } from '@/components/journey';
import { Icon, type IconName } from '@/components/console/icons';
import { ErrorNote, Panel, Skeleton, StatusBadge } from '@/components/console/kit';
import { Badge, DoctorPhoto, EmptyState, LinkButton } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { ApptRow, DocRow, InvoiceRow, NotifRow, TravelRow, VisaRow } from '@/lib/console-types';
import { useList } from '@/lib/hooks';
import { CASE_STATUS_ORDER, caseTone, fmtDate } from '@/lib/labels';
import { APPT_STATUS, APPT_TYPE, DOC_STATUS, METHOD, VISA_STATUS, entry, fmtWhen, money, relTime } from '@/lib/status';
import type { CaseSummary } from '@/lib/types';

const TERMINAL = ['COMPLETED', 'CANCELLED'];

function Tile({ icon, title, href, cta, tone = 'info', children }: { icon: IconName; title: string; href: string; cta: string; tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode }) {
  const bg = { info: 'bg-brand-50 text-brand-700', warning: 'bg-amber-50 text-amber-800', danger: 'bg-red-50 text-red-700', success: 'bg-emerald-50 text-emerald-700' }[tone];
  return (
    <div className="flex flex-col rounded-xl border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex items-center gap-2.5"><span className={`flex size-9 items-center justify-center rounded-lg ${bg}`}><Icon name={icon} className="size-5" /></span><h2 className="text-sm font-semibold text-ink-700">{title}</h2></div>
      <div className="mt-3 flex-1 text-ink-800">{children}</div>
      <Link href={href} className="mt-3 inline-flex min-h-9 items-center gap-1 text-sm font-semibold">{cta}<Icon name="chevron" className="size-4" /></Link>
    </div>
  );
}

export default function DashboardPage() {
  const { state } = useAuth();
  const cases = useList<CaseSummary>(['patient-home', 'cases'], '/cases?pageSize=50');
  const docs = useList<DocRow>(['patient-home', 'docs'], '/documents?pageSize=100');
  const appts = useList<ApptRow>(['patient-home', 'appts'], '/appointments?upcoming=true&sort=scheduledAt&pageSize=5');
  const visa = useList<VisaRow>(['patient-home', 'visa'], '/visa?pageSize=10');
  const travel = useList<TravelRow>(['patient-home', 'travel'], '/travel?pageSize=5');
  const invoices = useList<InvoiceRow>(['patient-home', 'invoices'], '/invoices?pageSize=50');
  const notes = useList<NotifRow>(['patient-home', 'notes'], '/notifications?pageSize=5');
  const name = state.status === 'authenticated' ? state.user.fullName.split(' ')[0] : '';

  if (cases.isLoading || docs.isLoading) {
    return <div className="space-y-4" aria-busy="true"><Skeleton className="h-9 w-64" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}</div></div>;
  }
  if (cases.isError || docs.isError) return <ErrorNote error={cases.error ?? docs.error} retry={() => { void cases.refetch(); void docs.refetch(); }} />;

  const all = cases.data?.items ?? [];
  const active = all.find((c) => !TERMINAL.includes(c.status));
  const documents = docs.data?.items ?? [];
  const needAttention = documents.filter((d) => d.status === 'REJECTED' || d.status === 'EXPIRED');
  const waiting = documents.filter((d) => d.status === 'UPLOADED' || d.status === 'UNDER_REVIEW');
  const next = appts.data?.items[0];
  const activeVisa = visa.data?.items[0];
  const missingVisa = (visa.data?.items ?? []).reduce((n, v) => n + v.missingCount, 0);
  const trip = travel.data?.items[0];
  const nextFlight = trip?.flights.filter((f) => new Date(f.departureAt) > new Date()).sort((a, b) => +new Date(a.departureAt) - +new Date(b.departureAt))[0];
  const openInv = (invoices.data?.items ?? []).filter((i) => !['PAID', 'CANCELLED', 'REFUNDED'].includes(i.status));
  const due = new Map<string, number>();
  for (const i of openInv) due.set(i.currency, (due.get(i.currency) ?? 0) + i.balance);
  const idx = active ? CASE_STATUS_ORDER.indexOf(active.status) : -1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold sm:text-3xl">Hello{name ? `, ${name}` : ''}</h1><p className="text-ink-600">Here is where things stand with your treatment.</p></div>
        <LinkButton href="/patient/cases/new" variant="secondary"><Icon name="plus" className="size-4" />New case</LinkButton>
      </div>

      {!active && (
        <EmptyState title="You have not started a treatment case yet" action={<LinkButton href="/patient/cases/new">Start your treatment journey</LinkButton>}>
          Tell us about your condition and upload your reports. A coordinator will guide you from there.
        </EmptyState>
      )}

      {(needAttention.length > 0 || missingVisa > 0 || openInv.some((i) => i.overdue)) && (
        <div role="region" aria-label="Needs your attention" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-amber-900"><Icon name="alert" className="size-5" />Needs your attention</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {needAttention.length > 0 && <li>{needAttention.length} document{needAttention.length === 1 ? ' needs' : 's need'} a new copy. <Link href="/patient/documents" className="font-semibold">Fix now</Link></li>}
            {missingVisa > 0 && <li>{missingVisa} visa document{missingVisa === 1 ? ' is' : 's are'} still missing. <Link href="/patient/visa" className="font-semibold">Send them</Link></li>}
            {openInv.some((i) => i.overdue) && <li>You have an overdue invoice. <Link href="/patient/payments" className="font-semibold">See invoices</Link></li>}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {active && (
          <Tile icon="folder" title="Active treatment case" href={`/patient/cases/${active.id}`} cta="Open your case">
            <p className="font-mono text-xs text-ink-500">{active.caseNumber}</p>
            <p className="mt-0.5 text-lg font-semibold">{active.statusLabel}</p>
            <p className="text-sm text-ink-600">{active.treatment?.name ?? 'Treatment to be chosen'}{active.preferredCountry ? ` · ${active.preferredCountry.name}` : ''}</p>
            <div className="mt-2"><Badge tone={caseTone(active.status)}>Step {Math.max(1, idx + 1)} of 13</Badge></div>
          </Tile>
        )}
        <Tile icon="calendar" title="Next appointment" href="/patient/appointments" cta={next ? 'All appointments' : 'Request one'}>
          {next ? (
            <div className="flex items-center gap-3">
              {next.doctor ? <DoctorPhoto name={next.doctor.fullName} photoKey={next.doctor.photoKey} size={44} /> : null}
              <div className="min-w-0"><p className="font-semibold">{fmtWhen(next.scheduledAt)}</p><p className="truncate text-sm text-ink-600">{APPT_TYPE[next.type] ?? next.type} · {METHOD[next.method] ?? next.method}</p>{next.doctor && <p className="truncate text-xs text-ink-500">{next.doctor.title ?? 'Dr.'} {next.doctor.fullName}</p>}<StatusBadge e={entry(APPT_STATUS, next.status)} /></div>
            </div>
          ) : <><p className="font-medium">Nothing scheduled yet</p><p className="text-sm text-ink-600">Ask for a consultation and your coordinator will confirm a time.</p></>}
        </Tile>
        <Tile icon="file" title="Documents" href="/patient/documents" cta={needAttention.length ? 'Fix now' : 'Manage documents'} tone={needAttention.length ? 'danger' : 'info'}>
          {needAttention.length > 0 ? <><p className="text-lg font-semibold text-red-700">{needAttention.length} need{needAttention.length === 1 ? 's' : ''} a new copy</p><p className="text-sm text-ink-600"><span className="first-letter:uppercase">{needAttention[0].categoryLabel}</span>{needAttention[0].rejectionReason ? `: ${needAttention[0].rejectionReason}` : ''}</p></>
            : waiting.length > 0 ? <><p className="text-lg font-semibold">{waiting.length} waiting for review</p><p className="text-sm text-ink-600">Our team will check them soon.</p></>
            : documents.length > 0 ? <p className="text-lg font-semibold text-emerald-800">All {documents.length} documents verified</p>
            : <><p className="text-lg font-semibold">No documents yet</p><p className="text-sm text-ink-600">Upload your medical reports and passport.</p></>}
        </Tile>
        <Tile icon="stamp" title="Visa" href="/patient/visa" cta="Visa details">
          {activeVisa ? <><p className="font-semibold">{activeVisa.country.name}</p><StatusBadge e={entry(VISA_STATUS, activeVisa.status)} />{activeVisa.missingCount > 0 && <p className="mt-1 text-sm text-amber-800">{activeVisa.missingCount} document{activeVisa.missingCount === 1 ? '' : 's'} still needed</p>}</> : <><p className="font-medium">Not started</p><p className="text-sm text-ink-600">We will guide you when it is time.</p></>}
        </Tile>
        <Tile icon="plane" title="Travel" href="/patient/travel" cta="Trip details">
          {trip ? (nextFlight ? <><p className="font-semibold">{nextFlight.departureAirport} → {nextFlight.arrivalAirport}</p><p className="text-sm text-ink-600">{fmtWhen(nextFlight.departureAt)}</p></> : <p className="font-semibold">Plan in progress</p>) : <><p className="font-medium">Not started</p><p className="text-sm text-ink-600">Flights and stay appear here once arranged.</p></>}
          {trip?.nextMilestone && <p className="mt-1 text-xs text-ink-500">Next: {fmtWhen(trip.nextMilestone)}</p>}
        </Tile>
        <Tile icon="card" title="Payments" href="/patient/payments" cta="Invoices" tone={openInv.length ? 'warning' : 'info'}>
          {openInv.length ? <><p className="text-lg font-semibold">{[...due.entries()].map(([c, v]) => money(v, c)).join(' + ')} due</p><p className="text-sm text-ink-600">{openInv.length} open invoice{openInv.length === 1 ? '' : 's'}</p></> : (invoices.data?.items.length ? <p className="text-lg font-semibold text-emerald-800">Nothing due</p> : <><p className="font-medium">No invoices yet</p><p className="text-sm text-ink-600">Invoices will appear here.</p></>)}
        </Tile>
      </div>

      {active && (
        <Panel title="Your treatment journey"><JourneyStepper status={active.status} /></Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Recent updates" action={<Link href="/patient/notifications" className="text-sm font-semibold">See all</Link>}>
          {notes.isLoading ? <Skeleton className="h-24" /> : !notes.data?.items.length ? <p className="text-sm text-ink-600">You are all caught up.</p> : (
            <ul className="divide-y divide-ink-100">{notes.data.items.map((n) => <li key={n.id} className="flex gap-3 py-2.5"><span aria-hidden="true" className={`mt-2 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-ink-200' : 'bg-brand-600'}`} /><div className="min-w-0"><p className="text-sm font-medium text-ink-900">{n.title}</p>{n.body && <p className="truncate text-xs text-ink-600">{n.body}</p>}<p className="text-xs text-ink-500">{relTime(n.createdAt)}</p></div></li>)}</ul>
          )}
        </Panel>
        <Panel title="Recent documents" action={<Link href="/patient/documents" className="text-sm font-semibold">Manage</Link>}>
          {documents.length === 0 ? <p className="text-sm text-ink-600">No documents uploaded yet.</p> : (
            <ul className="divide-y divide-ink-100">{documents.slice(0, 5).map((d) => <li key={d.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium first-letter:uppercase">{d.categoryLabel}</p><p className="text-xs text-ink-500">{fmtDate(d.createdAt)}</p></div><StatusBadge e={entry(DOC_STATUS, d.status)} /></li>)}</ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
