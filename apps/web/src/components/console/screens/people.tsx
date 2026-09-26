'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar, Badge, EmptyState } from '@/components/ui';
import type { CaseRow, DocRow, NotifRow, PatientRow } from '@/lib/console-types';
import { qstr, useAction, useDebounced, useGet, useList } from '@/lib/hooks';
import { fmtDate } from '@/lib/labels';
import { api } from '@/lib/api-client';
import { CASE_STATUS, DOC_CATEGORY, DOC_STATUS, entry, relTime } from '@/lib/status';
import { Icon } from '../icons';
import { DataTable, ErrorNote, KeyValue, PageHeader, Pager, Panel, PriorityDot, SearchBox, FilterBar, Skeleton, StatusBadge, type Column } from '../kit';
import { DocActionButtons, RejectDrawer, useDocActions } from './documents';
import { Button } from '@/components/ui';

export function PatientsScreen({ area }: { area: 'admin' | 'staff' }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useList<PatientRow>(['patients'], `/patients${qstr({ page, pageSize: 12, q: dq })}`);
  const columns: Column<PatientRow>[] = [
    { key: 'name', header: 'Patient', primary: true, cell: (p) => <span className="inline-flex items-center gap-2.5"><Avatar name={p.fullName} size={34} /><span><span className="block font-semibold">{p.fullName}</span><span className="block text-xs font-normal text-ink-500">{p.email}</span></span></span> },
    { key: 'phone', header: 'Phone', cell: (p) => p.phone ?? '—' },
    { key: 'city', header: 'City', cell: (p) => p.city ?? '—' },
    { key: 'verified', header: 'Email', hideOnMobile: true, cell: (p) => p.emailVerified ? <Badge tone="success">Confirmed</Badge> : <Badge tone="warning">Not confirmed</Badge> },
    { key: 'joined', header: 'Joined', cell: (p) => <span className="text-ink-600">{fmtDate(p.createdAt)}</span> },
  ];
  return (
    <>
      <PageHeader title="Patients" subtitle={area === 'admin' ? 'Everyone who has registered' : 'Patients on your cases'} />
      <Panel pad={false}>
        <FilterBar><SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name, email or phone" /></FilterBar>
        <DataTable rows={list.data?.items} loading={list.isLoading} columns={columns} rowKey={(p) => p.id} caption="Patients" onRowClick={(p) => router.push(`/${area}/patients/${p.id}`)} empty={<p className="py-8 text-center text-sm text-ink-600">No patients match.</p>} />
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Panel>
    </>
  );
}

export function PatientDetailScreen({ area }: { area: 'admin' | 'staff' }) {
  const { id } = useParams<{ id: string }>();
  const p = useGet<PatientRow>(['patient', id], `/patients/${id}`);
  const cases = useList<CaseRow>(['cases', 'patient'], `/cases?patientId=${id}&pageSize=50`);
  const docs = useList<DocRow>(['docs', 'patient'], `/documents?patientId=${id}&pageSize=50`);
  const actions = useDocActions();
  const [reject, setReject] = useState<DocRow | null>(null);
  if (p.isLoading) return <Skeleton className="h-72" />;
  if (p.isError || !p.data) return <ErrorNote error={p.error} retry={() => p.refetch()} />;
  const d = p.data;

  return (
    <>
      <Link href={`/${area}/patients`} className="mb-2 inline-flex items-center gap-1 text-sm font-medium"><Icon name="chevron" className="size-4 rotate-180" />Back to patients</Link>
      <PageHeader title={d.fullName} subtitle={`${d.email}${d.phone ? ` · ${d.phone}` : ''}`} actions={d.emailVerified ? <Badge tone="success">Email confirmed</Badge> : <Badge tone="warning">Email not confirmed</Badge>} />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Panel title="Treatment cases" pad={false}>
            {cases.isLoading ? <div className="p-4"><Skeleton className="h-24" /></div> : !cases.data?.items.length ? <div className="p-4"><EmptyState title="No cases you can access" /></div> : (
              <ul className="divide-y divide-ink-100">{cases.data.items.map((c) => (
                <li key={c.id}><Link href={`/${area}/cases/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-ink-50 sm:px-5"><div className="min-w-0 flex-1"><p className="font-semibold">{c.treatment?.name ?? 'Treatment not chosen'}</p><p className="font-mono text-xs text-ink-500">{c.caseNumber}{c.familyMember ? ` · for ${c.familyMember.fullName}` : ''}</p></div><PriorityDot p={c.priority} /><StatusBadge e={entry(CASE_STATUS, c.status)} /><span className="text-xs text-ink-500">{relTime(c.updatedAt)}</span></Link></li>
              ))}</ul>
            )}
          </Panel>
          <Panel title="Documents you may open" pad={false}>
            {docs.isLoading ? <div className="p-4"><Skeleton className="h-24" /></div> : !docs.data?.items.length ? <div className="p-4 text-sm text-ink-600">No documents available to your role.</div> : (
              <ul className="divide-y divide-ink-100">{docs.data.items.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{DOC_CATEGORY[x.category]}</p><p className="truncate text-xs text-ink-500">{x.file?.fileName} · {x.caseNumber}</p></div><StatusBadge e={entry(DOC_STATUS, x.status)} /><DocActionButtons d={x} actions={actions} onReject={setReject} /></li>
              ))}</ul>
            )}
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel title="Personal details"><KeyValue items={[['Date of birth', d.dateOfBirth ? fmtDate(d.dateOfBirth) : null], ['Gender', d.gender.charAt(0) + d.gender.slice(1).toLowerCase()], ['City', d.city], ['Address', d.address], ['Blood group', d.bloodGroup], ['Language', d.preferredLanguage]]} /></Panel>
          <Panel title="Identity"><KeyValue items={[['Passport number', d.passportNumber ?? 'Not provided'], ['Passport expiry', d.passportExpiry ? fmtDate(d.passportExpiry) : null], ['NID number', d.nidNumber ?? 'Not provided']]} /><p className="mt-3 text-xs text-ink-500">Numbers are stored encrypted and shown masked. Opening a patient record is written to the audit log.</p></Panel>
          <Panel title="Emergency contact"><KeyValue items={[['Name', d.emergencyContactName], ['Phone', d.emergencyContactPhone], ['Relationship', d.emergencyContactRelation]]} />{!d.emergencyContactName && <p className="text-sm text-ink-600">Not provided.</p>}</Panel>
          {(d.allergies || d.chronicConditions) && <Panel title="Medical notes"><KeyValue items={[['Allergies', d.allergies], ['Long-term conditions', d.chronicConditions]]} /></Panel>}
        </div>
      </div>
      <RejectDrawer doc={reject} onClose={() => setReject(null)} busy={actions.verify.isPending} onSubmit={(reason) => reject && actions.verify.mutate({ id: reject.id, decision: 'REJECTED', reason }, { onSuccess: () => setReject(null) })} />
    </>
  );
}

const TYPE_LABEL: Record<string, string> = { DOCUMENT_UPLOADED: 'Document', DOCUMENT_VERIFIED: 'Document', DOCUMENT_REJECTED: 'Document', APPOINTMENT_CONFIRMED: 'Appointment', APPOINTMENT_CHANGED: 'Appointment', APPOINTMENT_UPCOMING: 'Appointment', VISA_STATUS_CHANGED: 'Visa', PAYMENT_RECEIVED: 'Payment', CASE_STATUS_CHANGED: 'Case', NEW_MESSAGE: 'Message', MISSING_DOCUMENT: 'Document', SYSTEM: 'Update' };

export function NotificationsScreen({ area }: { area: string }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [unread, setUnread] = useState(false);
  const list = useList<NotifRow>(['notifications'], `/notifications${qstr({ page, pageSize: 15, unread })}`);
  const refresh = useAction(async () => { await api('/notifications/read-all', { method: 'POST' }); }, { invalidate: [['notifications'], ['notif-count'], ['notif-list']] });
  const open = async (n: NotifRow) => {
    if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
    if (n.entityType === 'MedicalCase' && n.entityId) router.push(area === 'patient' ? `/patient/cases/${n.entityId}` : `/${area}/cases/${n.entityId}`);
    else void list.refetch();
  };
  return (
    <>
      <PageHeader title="Notifications" subtitle="Things that changed on your cases" actions={<><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 rounded" checked={unread} onChange={(e) => { setUnread(e.target.checked); setPage(1); }} />Unread only</label><Button variant="secondary" disabled={refresh.isPending} onClick={() => refresh.mutate(undefined)}>Mark all read</Button></>} />
      <Panel pad={false}>
        {list.isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : !list.data?.items.length ? <div className="p-6"><EmptyState title="You are all caught up" /></div> : (
          <ul className="divide-y divide-ink-100">{list.data.items.map((n) => (
            <li key={n.id}><button onClick={() => open(n)} className={`flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-ink-50 sm:px-5 ${n.readAt ? '' : 'bg-brand-50/50'}`}><span aria-hidden="true" className={`mt-2 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-brand-600'}`} /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink-900">{n.title}</p>{n.body && <p className="text-sm text-ink-600">{n.body}</p>}<p className="mt-0.5 text-xs text-ink-500">{relTime(n.createdAt)}</p></div><Badge>{TYPE_LABEL[n.type] ?? 'Update'}</Badge></button></li>
          ))}</ul>
        )}
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Panel>
    </>
  );
}
