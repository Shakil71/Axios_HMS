'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Ref, VisaRow } from '@/lib/console-types';
import { errorText, qstr, useAction, useGet, useList } from '@/lib/hooks';
import { fmtDate } from '@/lib/labels';
import { VISA_ITEM, VISA_STATUS, entry, relTime } from '@/lib/status';
import { usePermissions } from '../providers';
import { useToast } from '../shell';
import { DataTable, Drawer, FilterBar, FilterSelect, KeyValue, PageHeader, Pager, Panel, StatusBadge, type Column } from '../kit';

const isoDate = (d: string | null) => (d ? d.slice(0, 10) : '');

/** One visa application: status, remarks and the country checklist. Editing needs visa.edit; the decision needs visa.approve. */
export function VisaDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { can } = usePermissions();
  const toast = useToast();
  const v = useGet<VisaRow>(['visa', id], id ? `/visa/${id}` : null);
  const d = v.data;
  const [form, setForm] = useState<{ status: string; referenceNumber: string; applicationDate: string; patientRemarks: string; internalRemarks: string } | null>(null);
  const cur = d ? (form ?? { status: d.status, referenceNumber: d.referenceNumber ?? '', applicationDate: isoDate(d.applicationDate), patientRemarks: d.patientRemarks ?? '', internalRemarks: d.internalRemarks ?? '' }) : null;
  const edit = can('visa.edit');

  const save = useAction(() => api(`/visa/${id}`, { method: 'PATCH', body: { status: cur!.status, referenceNumber: cur!.referenceNumber || null, applicationDate: cur!.applicationDate || null, patientRemarks: cur!.patientRemarks || null, internalRemarks: cur!.internalRemarks || null } }), {
    invalidate: [['visa'], ['visas'], ['workspace'], ['case']], onSuccess: () => { toast('Visa application updated. The patient has been notified.'); setForm(null); }, onError: (e) => toast(errorText(e), 'danger'),
  });
  const item = useAction((x: { itemId: string; status: string }) => api(`/visa/${id}/checklist/${x.itemId}`, { method: 'PATCH', body: { status: x.status } }), {
    invalidate: [['visa'], ['visas'], ['case']], onError: (e) => toast(errorText(e), 'danger'),
  });
  const set = (k: string, val: string) => setForm({ ...(cur as NonNullable<typeof cur>), [k]: val });

  return (
    <Drawer open={!!id} onClose={() => { setForm(null); onClose(); }} title={d ? `Visa · ${d.country.name}` : 'Visa application'} wide footer={edit ? <><Button variant="secondary" onClick={() => { setForm(null); onClose(); }}>Close</Button><Button disabled={save.isPending || !form} onClick={() => save.mutate(undefined)}>{save.isPending ? 'Saving…' : 'Save changes'}</Button></> : undefined}>
      {!d || !cur ? <p className="text-sm text-ink-600">Loading…</p> : (
        <div className="space-y-5">
          <KeyValue items={[['Patient', d.patient?.fullName], ['Case', <Link key="c" href={`/admin/cases/${d.case.id}`} className="font-mono">{d.case.caseNumber}</Link>], ['Visa officer', d.officer?.fullName ?? 'Not assigned'], ['Expected processing', d.expectedProcessingInfo], ['Decision date', d.decisionDate ? fmtDate(d.decisionDate) : null]]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" htmlFor="v-status"><Select id="v-status" disabled={!edit} value={cur.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(VISA_STATUS).map(([k, x]) => <option key={k} value={k} disabled={['APPROVED', 'REJECTED'].includes(k) && !can('visa.approve')}>{x.label}</option>)}</Select></Field>
            <Field label="Reference number" htmlFor="v-ref"><Input id="v-ref" disabled={!edit} value={cur.referenceNumber} onChange={(e) => set('referenceNumber', e.target.value)} /></Field>
            <Field label="Application date" htmlFor="v-date"><Input id="v-date" type="date" disabled={!edit} value={cur.applicationDate} onChange={(e) => set('applicationDate', e.target.value)} /></Field>
          </div>
          <Field label="Message shown to the patient" htmlFor="v-pat" hint="Plain language. Do not promise an outcome."><Textarea id="v-pat" disabled={!edit} className="min-h-20" value={cur.patientRemarks} onChange={(e) => set('patientRemarks', e.target.value)} /></Field>
          <Field label="Internal remarks (patients never see this)" htmlFor="v-int"><Textarea id="v-int" disabled={!edit} className="min-h-20" value={cur.internalRemarks} onChange={(e) => set('internalRemarks', e.target.value)} /></Field>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Document checklist</h3>
            <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
              {d.checklist.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{c.name}{!c.isMandatory && <span className="ml-1.5 text-xs font-normal text-ink-500">(if available)</span>}</p>{c.description && <p className="text-xs text-ink-500">{c.description}</p>}</div>
                  {edit ? (
                    <select aria-label={`Status of ${c.name}`} value={c.status} onChange={(e) => item.mutate({ itemId: c.id, status: e.target.value })} className="min-h-9 rounded-lg border border-ink-300 bg-white px-2 text-sm">{Object.entries(VISA_ITEM).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</select>
                  ) : <StatusBadge e={entry(VISA_ITEM, c.status)} />}
                </li>
              ))}
            </ul>
          </div>
          <Alert tone="warning">{d.disclaimer}</Alert>
        </div>
      )}
    </Drawer>
  );
}

export function NewVisaDrawer({ open, caseId, onClose }: { open: boolean; caseId: string; onClose: () => void }) {
  const toast = useToast();
  const countries = useGet<Ref[]>(['countries-pick'], open ? '/countries?pageSize=60' : null);
  const [countryId, setCountryId] = useState('');
  const create = useAction(() => api('/visa', { method: 'POST', body: { caseId, countryId } }), { invalidate: [['visa'], ['visas'], ['case'], ['workspace']], onSuccess: () => { toast('Visa application started with the country checklist.'); onClose(); }, onError: (e) => toast(errorText(e), 'danger') });
  return (
    <Drawer open={open} onClose={onClose} title="Start a visa application" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!countryId || create.isPending} onClick={() => create.mutate(undefined)}>Start application</Button></>}>
      <p className="mb-3 text-sm text-ink-700">The checklist is copied from the country’s visa requirements.</p>
      <Field label="Destination country" htmlFor="nv-country" required><Select id="nv-country" value={countryId} onChange={(e) => setCountryId(e.target.value)}><option value="">Choose a country</option>{countries.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
    </Drawer>
  );
}

export function VisaScreen({ area }: { area: 'admin' | 'staff' }) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const list = useList<VisaRow>(['visas'], `/visa${qstr({ page, pageSize: 12, status })}`);
  const columns: Column<VisaRow>[] = [
    { key: 'patient', header: 'Patient', primary: true, cell: (v) => <div><p className="font-semibold">{v.patient?.fullName}</p><p className="font-mono text-xs font-normal text-ink-500">{v.case.caseNumber}</p></div> },
    { key: 'country', header: 'Country', cell: (v) => v.country.name },
    { key: 'status', header: 'Status', cell: (v) => <StatusBadge e={entry(VISA_STATUS, v.status)} /> },
    { key: 'docs', header: 'Checklist', cell: (v) => v.missingCount ? <span className="font-medium text-red-700">{v.missingCount} missing</span> : <span className="text-emerald-700">Complete</span> },
    { key: 'ref', header: 'Reference', hideOnMobile: true, cell: (v) => v.referenceNumber ?? <span className="text-ink-400">—</span> },
    { key: 'upd', header: 'Updated', cell: (v) => <span className="text-ink-600">{relTime(v.updatedAt)}</span> },
  ];
  void area;
  return (
    <>
      <PageHeader title="Visa applications" subtitle="Country checklists, application status and decisions" />
      <Panel pad={false}>
        <FilterBar><FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={Object.entries(VISA_STATUS).map(([k, x]) => [k, x.label])} className="w-56" /></FilterBar>
        <DataTable rows={list.data?.items} loading={list.isLoading} columns={columns} rowKey={(v) => v.id} caption="Visa applications" onRowClick={(v) => setOpen(v.id)} empty={<p className="py-8 text-center text-sm text-ink-600">No visa applications yet. Start one from a case.</p>} />
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Panel>
      <VisaDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}
