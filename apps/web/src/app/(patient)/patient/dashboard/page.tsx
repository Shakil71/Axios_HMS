'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { JourneyStepper } from '@/components/journey';
import { Badge, Card, EmptyState, LinkButton, Skeleton } from '@/components/ui';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { CASE_STATUS_ORDER, caseTone, documentTone, fmtDate } from '@/lib/labels';
import type { CaseSummary, DocumentDto } from '@/lib/types';

const TERMINAL = ['COMPLETED', 'CANCELLED'];

function Tile({ title, children, href, cta }: { title: string; children: React.ReactNode; href?: string; cta?: string }) {
  return (
    <Card className="flex flex-col">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">{title}</h2>
      <div className="mt-2 flex-1 text-ink-800">{children}</div>
      {href && <Link href={href} className="mt-3 text-sm font-semibold">{cta ?? 'View'} →</Link>}
    </Card>
  );
}

export default function DashboardPage() {
  const { state } = useAuth();
  const cases = useQuery({ queryKey: ['cases'], queryFn: async () => (await api<CaseSummary[]>('/cases?pageSize=50')).data });
  const docs = useQuery({ queryKey: ['documents'], queryFn: async () => (await api<DocumentDto[]>('/documents?pageSize=100')).data });
  const name = state.status === 'authenticated' ? state.user.fullName.split(' ')[0] : '';

  if (cases.isLoading || docs.isLoading) {
    return <div className="space-y-4" aria-busy="true"><Skeleton className="h-9 w-64" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div></div>;
  }
  if (cases.isError || docs.isError) {
    return <EmptyState title="We could not load your dashboard" action={<button className="font-semibold underline" onClick={() => { void cases.refetch(); void docs.refetch(); }}>Try again</button>}>Please check your connection.</EmptyState>;
  }

  const all = cases.data ?? [];
  const active = all.find((c) => !TERMINAL.includes(c.status));
  const documents = docs.data ?? [];
  const needAttention = documents.filter((d) => d.status === 'REJECTED' || d.status === 'EXPIRED');
  const waiting = documents.filter((d) => d.status === 'UPLOADED' || d.status === 'UNDER_REVIEW');
  const idx = active ? CASE_STATUS_ORDER.indexOf(active.status) : -1;
  const at = (s: string) => CASE_STATUS_ORDER.indexOf(s);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Hello{name ? `, ${name}` : ''}</h1>
        <p className="text-ink-600">Here is where things stand with your treatment.</p>
      </div>

      {!active && (
        <EmptyState title="You have not started a treatment case yet" action={<LinkButton href="/patient/cases/new">Start your treatment journey</LinkButton>}>
          Tell us about your condition and upload your reports. A coordinator will guide you from there.
        </EmptyState>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {active && (
          <Tile title="Active treatment case" href={`/patient/cases/${active.id}`} cta="Open your case">
            <p className="font-mono text-sm text-ink-500">{active.caseNumber}</p>
            <p className="mt-1 text-lg font-semibold">{active.statusLabel}</p>
            <Badge tone={caseTone(active.status)}>Step {Math.max(1, idx + 1)} of 13</Badge>
          </Tile>
        )}
        <Tile title="Documents" href="/patient/documents" cta={needAttention.length ? 'Fix now' : 'Manage documents'}>
          {needAttention.length > 0 ? <><p className="text-lg font-semibold text-red-700">{needAttention.length} need{needAttention.length === 1 ? 's' : ''} a new copy</p><p className="text-sm text-ink-600"><span className="first-letter:uppercase">{needAttention[0].categoryLabel}</span>{needAttention[0].rejectionReason ? `: ${needAttention[0].rejectionReason}` : ''}</p></>
            : waiting.length > 0 ? <><p className="text-lg font-semibold">{waiting.length} waiting for review</p><p className="text-sm text-ink-600">Our team will check them soon.</p></>
            : documents.length > 0 ? <p className="text-lg font-semibold text-emerald-800">All documents verified</p>
            : <><p className="text-lg font-semibold">No documents yet</p><p className="text-sm text-ink-600">Upload your medical reports and passport.</p></>}
        </Tile>
        <Tile title="Upcoming appointment"><p className="font-medium">Nothing scheduled yet</p><p className="text-sm text-ink-600">Your coordinator will add appointments here.</p></Tile>
        <Tile title="Visa status">
          {active && at(active.status) >= at('VISA_PROCESSING') ? <p className="text-lg font-semibold">{at(active.status) === at('VISA_PROCESSING') ? 'In progress' : 'Handled'}</p> : <><p className="font-medium">Not started</p><p className="text-sm text-ink-600">We will guide you when it is time.</p></>}
        </Tile>
        <Tile title="Travel status">
          {active && at(active.status) >= at('TRAVEL_PLANNING') ? <p className="text-lg font-semibold">Being arranged</p> : <p className="font-medium">Not started</p>}
        </Tile>
        <Tile title="Payments"><p className="font-medium">No invoices yet</p><p className="text-sm text-ink-600">Invoices will appear here.</p></Tile>
      </div>

      {active && (
        <Card>
          <h2 className="text-lg font-semibold">Your treatment journey</h2>
          <div className="mt-4"><JourneyStepper status={active.status} /></div>
        </Card>
      )}

      {documents.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold">Recent documents</h2>
          <ul className="mt-3 divide-y divide-ink-100">
            {documents.slice(0, 4).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0"><p className="truncate font-medium first-letter:uppercase">{d.categoryLabel}</p><p className="text-xs text-ink-500">{fmtDate(d.createdAt)}</p></div>
                <Badge tone={documentTone(d.status)}>{d.statusLabel}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
