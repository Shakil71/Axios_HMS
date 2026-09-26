'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Field, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { DocRow } from '@/lib/console-types';
import { errorText, qstr, useAction, useDebounced, useList } from '@/lib/hooks';
import { fmtBytes } from '@/lib/labels';
import { DOC_CATEGORY, DOC_STATUS, entry, relTime } from '@/lib/status';
import { usePermissions } from '../providers';
import { Icon } from '../icons';
import { useToast } from '../shell';
import { DataTable, Drawer, FilterBar, FilterSelect, PageHeader, Pager, Panel, SearchBox, StatusBadge, Tabs, type Column } from '../kit';

/** Opens a document through a short-lived signed URL. The popup is opened synchronously so blockers allow it. */
export async function openDocument(id: string, purpose: 'view' | 'download') {
  const w = purpose === 'view' ? window.open('', '_blank') : null;
  if (w) w.opener = null;
  try {
    const { data } = await api<{ url: string }>(`/documents/${id}/download-url`, { method: 'POST', body: { purpose } });
    if (w) w.location.href = data.url;
    else window.location.assign(data.url);
  } catch (e) {
    w?.close();
    throw e;
  }
}

export function useDocActions(invalidate: string[][] = [['docs'], ['workspace'], ['case']]) {
  const toast = useToast();
  const { can } = usePermissions();
  const verify = useAction((v: { id: string; decision: 'VERIFIED' | 'REJECTED' | 'UNDER_REVIEW'; reason?: string }) => api(`/documents/${v.id}/verify`, { method: 'PATCH', body: { decision: v.decision, reason: v.reason } }), {
    invalidate,
    onSuccess: () => toast('Document updated. The patient has been notified.'),
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const open = async (id: string, purpose: 'view' | 'download') => {
    try { await openDocument(id, purpose); } catch (e) { toast(errorText(e), 'danger'); }
  };
  return { verify, open, can };
}

export function RejectDrawer({ doc, onClose, onSubmit, busy }: { doc: DocRow | null; onClose: () => void; onSubmit: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <Drawer open={!!doc} onClose={() => { setReason(''); onClose(); }} title="Ask for a new copy" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => onSubmit(reason.trim())}>{busy ? 'Sending…' : 'Reject document'}</Button></>}>
      <p className="mb-3 text-sm text-ink-700">The patient will see your reason in plain language and can upload a new copy straight away.</p>
      <Field label="What should the patient fix?" htmlFor="reject-reason" required hint="For example: “The photo is too dark to read.”"><Textarea id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-28" /></Field>
    </Drawer>
  );
}

/** Row actions shared by every documents table. */
export function DocActionButtons({ d, actions, onReject }: { d: DocRow; actions: ReturnType<typeof useDocActions>; onReject: (d: DocRow) => void }) {
  const canVerify = actions.can(`documents.verify.${d.sensitivity.toLowerCase()}`);
  const canView = actions.can(`documents.view.${d.sensitivity.toLowerCase()}`);
  const canDownload = actions.can(`documents.download.${d.sensitivity.toLowerCase()}`);
  const pending = d.status === 'UPLOADED' || d.status === 'UNDER_REVIEW';
  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {canView && <Button variant="secondary" className="min-h-9 px-2.5 py-1.5" onClick={() => actions.open(d.id, 'view')} aria-label={`View ${d.categoryLabel}`}><Icon name="eye" className="size-4" />View</Button>}
      {canDownload && <Button variant="ghost" className="min-h-9 px-2 py-1.5" onClick={() => actions.open(d.id, 'download')} aria-label={`Download ${d.categoryLabel}`}><Icon name="download" className="size-4" /></Button>}
      {canVerify && pending && <Button className="min-h-9 px-2.5 py-1.5" disabled={actions.verify.isPending} onClick={() => actions.verify.mutate({ id: d.id, decision: 'VERIFIED' })}><Icon name="check" className="size-4" />Verify</Button>}
      {canVerify && pending && <Button variant="ghost" className="min-h-9 px-2.5 py-1.5 text-red-700" onClick={() => onReject(d)}>Reject</Button>}
    </div>
  );
}

export function docColumns(actions: ReturnType<typeof useDocActions>, onReject: (d: DocRow) => void, area: string, showPatient = true): Column<DocRow>[] {
  return [
    { key: 'doc', header: 'Document', primary: true, cell: (d) => <div><p className="font-semibold capitalize">{DOC_CATEGORY[d.category] ?? d.category}</p><p className="max-w-56 truncate text-xs font-normal text-ink-500">{d.file?.fileName} · {d.file ? fmtBytes(d.file.sizeBytes) : ''}{d.currentVersion > 1 ? ` · v${d.currentVersion}` : ''}</p></div> },
    ...(showPatient ? [{ key: 'patient', header: 'Patient', cell: (d: DocRow) => <span>{d.patient?.fullName}</span> }] : []),
    { key: 'case', header: 'Case', cell: (d) => d.caseId ? <Link href={`/${area}/cases/${d.caseId}`} onClick={(e) => e.stopPropagation()} className="font-mono text-xs">{d.caseNumber}</Link> : <span className="text-ink-400">—</span> },
    { key: 'status', header: 'Status', cell: (d) => <div><StatusBadge e={entry(DOC_STATUS, d.status)} />{d.rejectionReason && <p className="mt-1 max-w-48 truncate text-xs text-ink-500" title={d.rejectionReason}>{d.rejectionReason}</p>}</div> },
    { key: 'sens', header: 'Type', hideOnMobile: true, cell: (d) => <Badge>{d.sensitivity.charAt(0) + d.sensitivity.slice(1).toLowerCase()}</Badge> },
    { key: 'when', header: 'Added', cell: (d) => <span className="text-ink-600">{relTime(d.createdAt)}</span> },
    { key: 'actions', header: '', cell: (d) => <DocActionButtons d={d} actions={actions} onReject={onReject} /> },
  ];
}

type Tab = 'review' | 'all' | 'rejected';

export function DocumentsScreen({ area }: { area: 'admin' | 'staff' | 'doctor' }) {
  const actions = useDocActions();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('review');
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [reject, setReject] = useState<DocRow | null>(null);
  const status = tab === 'rejected' ? 'REJECTED' : undefined;
  const path = `/documents${qstr({ page, pageSize: 12, category, status, pending: tab === 'review' })}`;
  const list = useList<DocRow>(['docs'], path);
  const items = list.data?.items;
  const columns = docColumns(actions, setReject, area);
  void toast;

  return (
    <>
      <PageHeader title={area === 'doctor' ? 'Patient documents' : 'Documents'} subtitle={area === 'doctor' ? 'Medical reports for patients you are linked to. Identity documents are not shown to doctors.' : 'Verify what patients upload. You only see the document types your role may open.'} />
      <Panel pad={false}>
        <div className="px-3 pt-1"><Tabs label="Document filter" value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[{ id: 'review', label: 'Needs review' }, { id: 'all', label: 'All documents' }, { id: 'rejected', label: 'Rejected' }]} /></div>
        <FilterBar><FilterSelect label="Type" value={category} onChange={(v) => { setCategory(v); setPage(1); }} options={Object.entries(DOC_CATEGORY)} className="w-48" /></FilterBar>
        <DataTable rows={items} loading={list.isLoading} columns={columns} rowKey={(d) => d.id} caption="Documents" empty={<p className="py-6 text-center text-sm text-ink-600">{tab === 'review' ? 'Nothing waiting for review.' : 'No documents match.'}</p>} />
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Panel>
      <RejectDrawer doc={reject} onClose={() => setReject(null)} busy={actions.verify.isPending} onSubmit={(reason) => reject && actions.verify.mutate({ id: reject.id, decision: 'REJECTED', reason }, { onSuccess: () => setReject(null) })} />
    </>
  );
}

/** Small controlled search input reused by list screens. */
export function useSearchState(initial = '') {
  const [q, setQ] = useState(initial);
  const debounced = useDebounced(q);
  return { q, setQ, debounced };
}
export { SearchBox };
