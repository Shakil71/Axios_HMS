'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import { errorText, qstr, useAction, useDebounced, useGet, useList } from '@/lib/hooks';
import { relTime, compactMoney, entry, CASE_STATUS, APPT_STATUS, APPT_TYPE, VISA_STATUS, DOC_CATEGORY, money } from '@/lib/status';
import { roleLabel } from '@/lib/roles';
import { Icon } from '../icons';
import { usePermissions } from '../providers';
import { useToast } from '../shell';
import { BarList, ConfirmDialog, Columns, DataTable, Drawer, ErrorNote, FilterBar, KeyValue, Kpi, PageHeader, Pager, Panel, SearchBox, Skeleton, StatusBadge, Tabs, type Column } from '../kit';

// ═══════════════════════════ reports ═══════════════════════════
interface Bucket { label: string; count: number }
interface Report {
  range: { from: string; to: string }; cases: { created: number; completed: number; avgDaysToComplete: number | null };
  casesByStatus: Bucket[]; casesByCountry: Bucket[]; casesByTreatment: Bucket[]; casesByPriority: Bucket[]; appointmentsByType: Bucket[]; appointmentsByStatus: Bucket[]; visaByStatus: Bucket[]; documentsByCategory: Bucket[];
  invoices: { status: string; currency: string; count: number; total: number }[]; revenueByMonth: { month: string; currency: string; total: number }[];
  staffWorkload: { staffId: string; fullName: string; roles: string[]; activeCases: number }[];
}

const RANGES: [string, string, number][] = [['30', 'Last 30 days', 30], ['90', 'Last 90 days', 90], ['365', 'Last 12 months', 365]];
const pretty = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export function ReportsScreen() {
  const [range, setRange] = useState('90');
  const days = RANGES.find((r) => r[0] === range)![2];
  const path = useState(() => Date.now())[0]; // stable "now" for the query key while the page is open
  const from = new Date(path - days * 86_400_000).toISOString();
  const q = useGet<Report>(['report'], `/admin/reports/summary${qstr({ from, to: new Date(path).toISOString() })}`);
  const d = q.data;
  const usd = (rows: Report['invoices']) => rows.filter((r) => r.currency === 'USD');
  const invoiced = d ? usd(d.invoices).reduce((s, r) => s + r.total, 0) : 0;
  const paid = d ? usd(d.invoices).filter((r) => r.status === 'PAID').reduce((s, r) => s + r.total, 0) : 0;

  const print = () => window.print();
  return (
    <>
      <PageHeader title="Reports" subtitle={d ? `${new Date(d.range.from).toLocaleDateString('en-GB')} – ${new Date(d.range.to).toLocaleDateString('en-GB')}` : 'Loading…'} actions={<><div className="flex rounded-lg border border-ink-300 bg-white p-0.5" role="group" aria-label="Date range">{RANGES.map(([k, l]) => <button key={k} onClick={() => setRange(k)} aria-pressed={range === k} className={`min-h-9 rounded-md px-3 text-sm font-medium ${range === k ? 'bg-brand-700 text-white' : 'text-ink-700 hover:bg-ink-50'}`}>{l}</button>)}</div><Button variant="secondary" onClick={print}>Print</Button></>} />
      {q.isError && <ErrorNote error={q.error} retry={() => q.refetch()} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi loading={!d} label="Cases opened" value={d?.cases.created} icon="folder" />
        <Kpi loading={!d} label="Cases completed" value={d?.cases.completed} icon="check" tone="success" hint={d?.cases.avgDaysToComplete ? `${d.cases.avgDaysToComplete} days on average` : undefined} />
        <Kpi loading={!d} label="Invoiced (USD)" value={d ? compactMoney(invoiced) : ''} icon="file" />
        <Kpi loading={!d} label="Collected (USD)" value={d ? compactMoney(paid) : ''} icon="card" tone="success" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Cases by stage">{d ? <BarList data={d.casesByStatus.map((x) => ({ label: entry(CASE_STATUS, x.label).label, value: x.count }))} /> : <Skeleton className="h-40" />}</Panel>
        <Panel title="Revenue by month (USD)">{d ? <Columns data={d.revenueByMonth.filter((r) => r.currency === 'USD').map((r) => ({ label: new Date(r.month + '-01').toLocaleString('en', { month: 'short' }), value: r.total }))} format={(n) => compactMoney(n)} /> : <Skeleton className="h-40" />}</Panel>
        <Panel title="Destination countries">{d ? <BarList data={d.casesByCountry.map((x) => ({ label: x.label, value: x.count }))} /> : <Skeleton className="h-40" />}</Panel>
        <Panel title="Treatments requested">{d ? <BarList colorClass="bg-emerald-600" data={d.casesByTreatment.slice(0, 8).map((x) => ({ label: x.label, value: x.count }))} /> : <Skeleton className="h-40" />}</Panel>
        <Panel title="Appointments by type">{d ? <BarList colorClass="bg-sky-600" data={d.appointmentsByType.map((x) => ({ label: APPT_TYPE[x.label] ?? x.label, value: x.count }))} /> : <Skeleton className="h-32" />}</Panel>
        <Panel title="Appointments by outcome">{d ? <BarList colorClass="bg-sky-600" data={d.appointmentsByStatus.map((x) => ({ label: entry(APPT_STATUS, x.label).label, value: x.count }))} /> : <Skeleton className="h-32" />}</Panel>
        <Panel title="Visa applications">{d ? <BarList colorClass="bg-amber-500" empty="No visa applications in this period." data={d.visaByStatus.map((x) => ({ label: entry(VISA_STATUS, x.label).label, value: x.count }))} /> : <Skeleton className="h-32" />}</Panel>
        <Panel title="Documents received">{d ? <BarList colorClass="bg-violet-500" data={d.documentsByCategory.slice(0, 8).map((x) => ({ label: DOC_CATEGORY[x.label] ?? x.label, value: x.count }))} /> : <Skeleton className="h-32" />}</Panel>
        <Panel title="Invoices by status" className="lg:col-span-2" pad={false}>
          {!d ? <div className="p-4"><Skeleton className="h-24" /></div> : d.invoices.length === 0 ? <p className="p-5 text-sm text-ink-600">No invoices in this period.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-sm"><thead><tr className="border-b border-ink-100 text-left text-xs uppercase text-ink-500"><th className="px-5 py-2 font-semibold">Status</th><th className="px-3 py-2 font-semibold">Currency</th><th className="px-3 py-2 text-right font-semibold">Invoices</th><th className="px-5 py-2 text-right font-semibold">Value</th></tr></thead><tbody className="divide-y divide-ink-100">{d.invoices.map((r) => <tr key={r.status + r.currency}><td className="px-5 py-2.5">{pretty(r.status)}</td><td className="px-3 py-2.5">{r.currency}</td><td className="px-3 py-2.5 text-right tabular-nums">{r.count}</td><td className="px-5 py-2.5 text-right tabular-nums">{money(r.total, r.currency)}</td></tr>)}</tbody></table></div>
          )}
        </Panel>
        <Panel title="Team workload (active cases)" className="lg:col-span-2">{d ? <BarList colorClass="bg-amber-500" empty="No assigned cases." data={d.staffWorkload.map((s) => ({ label: s.fullName, value: s.activeCases, sub: s.roles.map(roleLabel).join(', ') }))} format={(n) => `${n} ${n === 1 ? 'case' : 'cases'}`} /> : <Skeleton className="h-32" />}</Panel>
      </div>
    </>
  );
}

// ═══════════════════════════ directory management ═══════════════════════════
type Entity = 'doctors' | 'hospitals' | 'countries' | 'treatments';
interface Row { id: string; slug: string; name?: string; fullName?: string; status: string; isVerified?: boolean; updatedAt: string }
const STATUS_TONE = { PUBLISHED: 'success', DRAFT: 'warning', ARCHIVED: 'neutral' } as const;
interface Lookups { specialties: { id: string; name: string }[]; categories: { id: string; name: string }[]; languages: { id: string; name: string }[]; countries: { id: string; name: string }[]; cities: { id: string; name: string; countryId: string }[] }

export function DirectoryScreen() {
  const { can } = usePermissions();
  const toast = useToast();
  const [entity, setEntity] = useState<Entity>('doctors');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [archive, setArchive] = useState<Row | null>(null);
  const dq = useDebounced(q);
  const list = useList<Row>(['directory', entity], `/admin/directory/${entity}${qstr({ page, pageSize: 12, q: dq, status })}`);
  const inval = [['directory'], ['dir-lookups']];
  const setStatusM = useAction((v: { id: string; status: string }) => api(`/admin/directory/${entity}/${v.id}`, { method: 'PATCH', body: { status: v.status } }), { invalidate: inval, onSuccess: () => toast('Saved. The public website updates within a few minutes.'), onError: (e) => toast(errorText(e), 'danger') });
  const verify = useAction((v: { id: string; verified: boolean }) => api(`/admin/directory/doctors/${v.id}/verify`, { method: 'POST', body: { verified: v.verified } }), { invalidate: inval, onSuccess: (_r) => toast('Verification updated.'), onError: (e) => toast(errorText(e), 'danger') });
  const doArchive = useAction((id: string) => api(`/admin/directory/${entity}/${id}`, { method: 'DELETE' }), { invalidate: inval, onSuccess: () => { toast('Archived. It is no longer public.'); setArchive(null); }, onError: (e) => { toast(errorText(e), 'danger'); setArchive(null); } });

  const label = (r: Row) => r.fullName ?? r.name ?? r.slug;
  const columns: Column<Row>[] = [
    { key: 'name', header: entity === 'doctors' ? 'Doctor' : entity.charAt(0).toUpperCase() + entity.slice(1, -1), primary: true, cell: (r) => <div><p className="font-semibold">{label(r)}</p><p className="font-mono text-xs font-normal text-ink-500">/{entity}/{r.slug}</p></div> },
    { key: 'status', header: 'Status', cell: (r) => <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? 'neutral'}>{pretty(r.status)}</Badge> },
    ...(entity === 'doctors' ? [{ key: 'verified', header: 'Verified', cell: (r: Row) => r.isVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge> } as Column<Row>] : []),
    { key: 'upd', header: 'Updated', hideOnMobile: true, cell: (r) => <span className="text-ink-600">{relTime(r.updatedAt)}</span> },
    {
      key: 'actions', header: '', cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {entity === 'doctors' && !r.isVerified && <Button variant="secondary" className="min-h-9 px-2.5 py-1.5" disabled={verify.isPending} onClick={() => verify.mutate({ id: r.id, verified: true })}>Verify</Button>}
          {r.status !== 'PUBLISHED' && !(entity === 'doctors' && !r.isVerified) && <Button className="min-h-9 px-2.5 py-1.5" disabled={setStatusM.isPending} onClick={() => setStatusM.mutate({ id: r.id, status: 'PUBLISHED' })}>Publish</Button>}
          {r.status === 'PUBLISHED' && <Button variant="secondary" className="min-h-9 px-2.5 py-1.5" disabled={setStatusM.isPending} onClick={() => setStatusM.mutate({ id: r.id, status: 'DRAFT' })}>Unpublish</Button>}
          {entity === 'doctors' && r.isVerified && <Button variant="ghost" className="min-h-9 px-2.5 py-1.5" onClick={() => verify.mutate({ id: r.id, verified: false })}>Remove verification</Button>}
          <Button variant="ghost" className="min-h-9 px-2.5 py-1.5 text-red-700" onClick={() => setArchive(r)}>Archive</Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Directory" subtitle="Doctors, hospitals, countries and treatments shown on the public website" actions={can('directory.manage') ? <Button onClick={() => setCreating(true)}><Icon name="plus" className="size-4" />Add {entity === 'countries' ? 'country' : entity.slice(0, -1)}</Button> : undefined} />
      <Alert tone="info" title="Only verified information goes live">A doctor profile is public only after you verify it against the doctor’s own documents and publish it.</Alert>
      <Panel pad={false} className="mt-5">
        <div className="px-3 pt-1"><Tabs label="Directory sections" value={entity} onChange={(t) => { setEntity(t); setPage(1); setQ(''); setStatus(''); }} tabs={[{ id: 'doctors', label: 'Doctors' }, { id: 'hospitals', label: 'Hospitals' }, { id: 'countries', label: 'Countries' }, { id: 'treatments', label: 'Treatments' }]} /></div>
        <FilterBar>
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search by name" />
          <div className="w-40"><label htmlFor="dir-status" className="mb-1 block text-xs font-medium text-ink-600">Status</label><select id="dir-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="block min-h-10 w-full rounded-lg border border-ink-300 bg-white px-3 text-sm"><option value="">All</option><option value="PUBLISHED">Published</option><option value="DRAFT">Draft</option></select></div>
        </FilterBar>
        <DataTable rows={list.data?.items} loading={list.isLoading} columns={columns} rowKey={(r) => r.id} caption={`Directory ${entity}`} empty={<p className="py-8 text-center text-sm text-ink-600">Nothing here yet.</p>} />
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Panel>
      {creating && <CreateEntity entity={entity} onClose={() => setCreating(false)} />}
      <ConfirmDialog open={!!archive} title={`Archive ${archive ? label(archive) : ''}?`} danger confirmLabel="Archive" busy={doArchive.isPending} onCancel={() => setArchive(null)} onConfirm={() => archive && doArchive.mutate(archive.id)}>It will disappear from the public website. Existing cases that reference it keep working.</ConfirmDialog>
    </>
  );
}

function CreateEntity({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  const toast = useToast();
  const lookups = useGet<Lookups>(['dir-lookups'], '/admin/directory/lookups');
  const L = lookups.data;
  const [name, setName] = useState('');
  const [extra, setExtra] = useState({ countryId: '', categoryId: '', iso: '', specialtyId: '', bio: '', years: '', summary: '' });
  const [error, setError] = useState<string | null>(null);

  const body = () => {
    if (entity === 'doctors') return { fullName: name, title: 'Dr.', yearsOfExperience: extra.years ? Number(extra.years) : undefined, bio: extra.bio || undefined, specialties: extra.specialtyId ? [{ specialtyId: extra.specialtyId, isPrimary: true }] : undefined };
    if (entity === 'hospitals') return { name, countryId: extra.countryId, description: extra.bio || undefined };
    if (entity === 'countries') return { name, isoCode: extra.iso, description: extra.bio || undefined };
    return { name, categoryId: extra.categoryId, summary: extra.summary || undefined };
  };
  const ready = name.trim().length >= 2 && (entity !== 'hospitals' || extra.countryId) && (entity !== 'countries' || extra.iso.length === 2) && (entity !== 'treatments' || extra.categoryId);
  const create = useAction(() => api(`/admin/directory/${entity}`, { method: 'POST', body: body() }), { invalidate: [['directory'], ['dir-lookups']], onSuccess: () => { toast('Created as a draft. Add details, then publish.'); onClose(); }, onError: (e) => setError(errorText(e)) });
  return (
    <Drawer open onClose={onClose} title={`Add ${entity === 'countries' ? 'country' : entity.slice(0, -1)}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!ready || create.isPending} onClick={() => { setError(null); create.mutate(undefined); }}>{create.isPending ? 'Creating…' : 'Create draft'}</Button></>}>
      <div className="space-y-4">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
        <Field label={entity === 'doctors' ? 'Full name' : 'Name'} htmlFor="ce-name" required><Input id="ce-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {entity === 'doctors' && (<>
          <Field label="Primary specialty" htmlFor="ce-spec"><Select id="ce-spec" value={extra.specialtyId} onChange={(e) => setExtra({ ...extra, specialtyId: e.target.value })}><option value="">Choose…</option>{L?.specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Years of experience" htmlFor="ce-years"><Input id="ce-years" type="number" min={0} max={80} value={extra.years} onChange={(e) => setExtra({ ...extra, years: e.target.value })} /></Field>
        </>)}
        {entity === 'hospitals' && <Field label="Country" htmlFor="ce-country" required><Select id="ce-country" value={extra.countryId} onChange={(e) => setExtra({ ...extra, countryId: e.target.value })}><option value="">Choose…</option>{L?.countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
        {entity === 'countries' && <Field label="Country code" htmlFor="ce-iso" required hint="Two letters, e.g. TH"><Input id="ce-iso" maxLength={2} value={extra.iso} onChange={(e) => setExtra({ ...extra, iso: e.target.value.toUpperCase() })} /></Field>}
        {entity === 'treatments' && (<>
          <Field label="Category" htmlFor="ce-cat" required><Select id="ce-cat" value={extra.categoryId} onChange={(e) => setExtra({ ...extra, categoryId: e.target.value })}><option value="">Choose…</option>{L?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Short summary" htmlFor="ce-sum"><Input id="ce-sum" value={extra.summary} onChange={(e) => setExtra({ ...extra, summary: e.target.value })} /></Field>
        </>)}
        {entity !== 'treatments' && <Field label={entity === 'doctors' ? 'Profile text' : 'Description'} htmlFor="ce-bio"><Textarea id="ce-bio" className="min-h-28" value={extra.bio} onChange={(e) => setExtra({ ...extra, bio: e.target.value })} /></Field>}
        <p className="text-sm text-ink-600">It is created as a <strong>draft</strong>. {entity === 'doctors' ? 'Verify the profile, then publish it.' : 'Publish it when the details are complete.'}</p>
      </div>
    </Drawer>
  );
}

export { KeyValue, StatusBadge };
