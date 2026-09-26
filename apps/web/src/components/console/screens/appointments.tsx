'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Avatar, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { ApptRow, CaseRow, Ref } from '@/lib/console-types';
import { errorText, qstr, useAction, useGet, useList } from '@/lib/hooks';
import { APPT_STATUS, APPT_TYPE, METHOD, entry, fmtWhen } from '@/lib/status';
import { usePermissions } from '../providers';
import { useToast } from '../shell';
import { DataTable, Drawer, FilterBar, FilterSelect, PageHeader, Pager, Panel, StatusBadge, Tabs, type Column } from '../kit';

const toLocalInput = (d: Date) => { const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return t.toISOString().slice(0, 16); };

interface DoctorOpt { id: string; fullName: string; title: string | null }

/** Schedule (staff) — case and doctor pickers are limited to what the caller may reach. */
export function AppointmentForm({ open, onClose, defaultCaseId, appt }: { open: boolean; onClose: () => void; defaultCaseId?: string; appt?: ApptRow }) {
  const toast = useToast();
  const cases = useGet<{ id: string }[]>(['appt-case-picker'], open && !appt ? '/cases?pageSize=100' : null);
  const doctors = useGet<DoctorOpt[]>(['appt-doctors'], open ? '/doctors?pageSize=60' : null);
  const [caseId, setCaseId] = useState(defaultCaseId ?? '');
  const [doctorId, setDoctorId] = useState(appt?.doctor?.id ?? '');
  const [type, setType] = useState(appt?.type ?? 'ONLINE_CONSULTATION');
  const [method, setMethod] = useState(appt?.method ?? 'VIDEO');
  const [when, setWhen] = useState(toLocalInput(appt ? new Date(appt.scheduledAt) : new Date(Date.now() + 2 * 86_400_000)));
  const [duration, setDuration] = useState(String(appt?.durationMinutes ?? 30));
  const [notes, setNotes] = useState(appt?.notes ?? '');
  const [meeting, setMeeting] = useState(appt?.meetingUrl ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useAction(
    () => {
      const body = { doctorId: doctorId || null, scheduledAt: new Date(when).toISOString(), durationMinutes: Number(duration), type, method, notes: notes || null, meetingUrl: meeting || null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      return appt ? api(`/appointments/${appt.id}`, { method: 'PATCH', body }) : api('/appointments', { method: 'POST', body: { ...body, caseId } });
    },
    { invalidate: [['appts'], ['workspace'], ['case']], onSuccess: () => { toast(appt ? 'Appointment updated.' : 'Appointment scheduled. The patient has been notified.'); onClose(); }, onError: (e) => setError(errorText(e)) },
  );

  const caseList = (cases.data as unknown as CaseRow[] | undefined) ?? [];
  return (
    <Drawer open={open} onClose={onClose} title={appt ? 'Edit appointment' : 'Schedule an appointment'} wide footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={save.isPending || (!appt && !caseId)} onClick={() => { setError(null); save.mutate(undefined); }}>{save.isPending ? 'Saving…' : appt ? 'Save changes' : 'Schedule'}</Button></>}>
      <div className="space-y-4">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
        {!appt && (
          <Field label="Case" htmlFor="ap-case" required>
            <Select id="ap-case" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">Choose a case</option>
              {caseList.filter((c) => !['COMPLETED', 'CANCELLED'].includes(c.status)).map((c) => <option key={c.id} value={c.id}>{c.caseNumber} · {c.patient.fullName}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Doctor" htmlFor="ap-doc"><Select id="ap-doc" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}><option value="">To be confirmed</option>{doctors.data?.map((d) => <option key={d.id} value={d.id}>{[d.title, d.fullName].filter(Boolean).join(' ')}</option>)}</Select></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="ap-type"><Select id="ap-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>{Object.entries(APPT_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="How" htmlFor="ap-method"><Select id="ap-method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>{Object.entries(METHOD).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Date and time (your local time)" htmlFor="ap-when" required><Input id="ap-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          <Field label="Length (minutes)" htmlFor="ap-dur"><Input id="ap-dur" type="number" min={10} max={480} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
        </div>
        {method === 'VIDEO' && <Field label="Video meeting link" htmlFor="ap-link" hint="Shown to the patient once the appointment is confirmed."><Input id="ap-link" type="url" value={meeting} onChange={(e) => setMeeting(e.target.value)} placeholder="https://" /></Field>}
        <Field label="Note for the patient" htmlFor="ap-notes"><Textarea id="ap-notes" className="min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Drawer>
  );
}

type Tab = 'upcoming' | 'requests' | 'past' | 'all';

export function AppointmentsScreen({ area }: { area: 'admin' | 'staff' | 'doctor' }) {
  const { can } = usePermissions();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(area === 'doctor' ? 'upcoming' : 'upcoming');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<{ appt?: ApptRow } | null>(null);
  const [resched, setResched] = useState<ApptRow | null>(null);
  const [newWhen, setNewWhen] = useState('');

  const params = useMemo(() => {
    const now = new Date().toISOString();
    if (tab === 'upcoming') return { upcoming: true, status: status || undefined };
    if (tab === 'requests') return { status: 'REQUESTED' };
    if (tab === 'past') return { to: now, sort: '-scheduledAt', status: status || undefined };
    return { status: status || undefined };
  }, [tab, status]);
  const list = useList<ApptRow>(['appts'], `/appointments${qstr({ page, pageSize: 12, ...params })}`);

  const setStatusM = useAction((v: { id: string; status: string; scheduledAt?: string }) => api(`/appointments/${v.id}/status`, { method: 'POST', body: { status: v.status, scheduledAt: v.scheduledAt } }), {
    invalidate: [['appts'], ['workspace'], ['case']], onSuccess: () => { toast('Appointment updated. The patient has been notified.'); setResched(null); }, onError: (e) => toast(errorText(e), 'danger'),
  });
  const canEdit = can('appointments.edit');

  const columns: Column<ApptRow>[] = [
    { key: 'when', header: 'When', primary: true, cell: (a) => <div><p className="font-semibold">{fmtWhen(a.scheduledAt)}</p><p className="text-xs font-normal text-ink-500">{a.durationMinutes} min</p></div> },
    { key: 'patient', header: 'Patient', cell: (a) => a.patient ? <Link href={`/${area}/cases/${a.case.id}`} onClick={(e) => e.stopPropagation()} className="font-medium">{a.patient.fullName}</Link> : null },
    { key: 'doctor', header: 'Doctor', cell: (a) => a.doctor ? <span className="inline-flex items-center gap-2"><Avatar name={a.doctor.fullName} size={24} />{a.doctor.fullName}</span> : <span className="text-ink-400">To be confirmed</span> },
    { key: 'type', header: 'Type', cell: (a) => <div><p>{APPT_TYPE[a.type]}</p><p className="text-xs text-ink-500">{METHOD[a.method]}</p></div> },
    { key: 'status', header: 'Status', cell: (a) => <StatusBadge e={entry(APPT_STATUS, a.status)} /> },
    {
      key: 'actions', header: '', cell: (a) => {
        const open = ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'].includes(a.status);
        if (!open || !canEdit) return a.meetingUrl && open ? <a href={a.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold">Join</a> : null;
        return (
          <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {a.status === 'REQUESTED' && <Button className="min-h-9 px-2.5 py-1.5" disabled={setStatusM.isPending} onClick={() => setStatusM.mutate({ id: a.id, status: 'CONFIRMED' })}>Confirm</Button>}
            {a.status !== 'REQUESTED' && <Button variant="secondary" className="min-h-9 px-2.5 py-1.5" disabled={setStatusM.isPending} onClick={() => setStatusM.mutate({ id: a.id, status: 'COMPLETED' })}>Complete</Button>}
            {can('appointments.create') && <Button variant="ghost" className="min-h-9 px-2.5 py-1.5" onClick={() => setForm({ appt: a })}>Edit</Button>}
            <Button variant="ghost" className="min-h-9 px-2.5 py-1.5" onClick={() => { setResched(a); setNewWhen(toLocalInput(new Date(a.scheduledAt))); }}>Reschedule</Button>
            <Button variant="ghost" className="min-h-9 px-2.5 py-1.5 text-red-700" disabled={setStatusM.isPending} onClick={() => setStatusM.mutate({ id: a.id, status: 'CANCELLED' })}>Cancel</Button>
          </div>
        );
      },
    },
  ];

  // group by day for a calendar feel on the upcoming tab
  return (
    <>
      <PageHeader title={area === 'doctor' ? 'My schedule' : 'Appointments'} subtitle="Consultations, second opinions, diagnostics and follow-ups" actions={can('appointments.create') ? <Button onClick={() => setForm({})}>Schedule appointment</Button> : undefined} />
      <Panel pad={false}>
        <div className="px-3 pt-1"><Tabs label="Appointment view" value={tab} onChange={(t) => { setTab(t); setPage(1); setStatus(''); }} tabs={[{ id: 'upcoming', label: 'Upcoming' }, { id: 'requests', label: 'Requests' }, { id: 'past', label: 'Past' }, { id: 'all', label: 'All' }]} /></div>
        {tab !== 'requests' && <FilterBar><FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={Object.entries(APPT_STATUS).map(([k, v]) => [k, v.label])} className="w-48" /></FilterBar>}
        <DataTable rows={list.data?.items} loading={list.isLoading} columns={columns} rowKey={(a) => a.id} caption="Appointments" empty={<p className="py-6 text-center text-sm text-ink-600">{tab === 'requests' ? 'No requests waiting.' : 'No appointments match.'}</p>} />
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Panel>

      {form && <AppointmentForm key={form.appt?.id ?? 'new'} open onClose={() => setForm(null)} appt={form.appt} />}
      <Drawer open={!!resched} onClose={() => setResched(null)} title="Reschedule appointment" footer={<><Button variant="secondary" onClick={() => setResched(null)}>Cancel</Button><Button disabled={setStatusM.isPending || !newWhen} onClick={() => resched && setStatusM.mutate({ id: resched.id, status: 'RESCHEDULED', scheduledAt: new Date(newWhen).toISOString() })}>Reschedule</Button></>}>
        <p className="mb-3 text-sm text-ink-700">The patient is told the new time straight away.</p>
        <Field label="New date and time (your local time)" htmlFor="rs-when"><Input id="rs-when" type="datetime-local" value={newWhen} onChange={(e) => setNewWhen(e.target.value)} /></Field>
      </Drawer>
    </>
  );
}

export { Badge };
export type { Ref };
