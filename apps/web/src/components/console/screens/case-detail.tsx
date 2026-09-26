'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Avatar, Badge, Button, EmptyState, Field, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { ApptRow, CaseRow, DocRow, InvoiceRow, NoteRow, Ref, TimelineRow, TravelRow, VisaRow, StaffPick } from '@/lib/console-types';
import { errorText, useAction, useGet, useList } from '@/lib/hooks';
import { fmtDate, fmtDateTime } from '@/lib/labels';
import { APPT_STATUS, APPT_TYPE, CASE_STATUS, INVOICE_STATUS, METHOD, PRIORITY, STAFF_ROLE_ON_CASE, VISA_STATUS, entry, fmtWhen, money, relTime } from '@/lib/status';
import { usePermissions } from '../providers';
import { Icon } from '../icons';
import { useToast } from '../shell';
import { AppointmentForm } from './appointments';
import { RejectDrawer, docColumns, useDocActions } from './documents';
import { InvoiceDrawer, InvoiceForm } from './payments';
import { TravelEditor, TravelSummary } from './travel';
import { NewVisaDrawer, VisaDrawer } from './visa';
import { DataTable, Drawer, ErrorNote, KeyValue, PageHeader, Panel, PriorityDot, Skeleton, StatusBadge, Tabs, type Column } from '../kit';

type Tab = 'overview' | 'documents' | 'appointments' | 'visa' | 'travel' | 'payments' | 'notes';

export function CaseDetailScreen({ area }: { area: 'admin' | 'staff' | 'doctor' }) {
  const { id } = useParams<{ id: string }>();
  const { can } = usePermissions();
  const [tab, setTab] = useState<Tab>('overview');
  const c = useGet<CaseRow>(['case', 'main'], `/cases/${id}`);
  const [statusOpen, setStatusOpen] = useState(false);

  if (c.isLoading) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-72" /></div>;
  if (c.isError || !c.data) return <ErrorNote error={c.error} retry={() => c.refetch()} />;
  const d = c.data;
  const canEdit = can('cases.edit') || can('cases.edit.all');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' }, { id: 'documents', label: 'Documents' }, { id: 'appointments', label: 'Appointments' },
    ...(can('visa.view') ? [{ id: 'visa' as const, label: 'Visa' }] : []), ...(can('travel.view') ? [{ id: 'travel' as const, label: 'Travel' }] : []),
    ...(can('payments.view') ? [{ id: 'payments' as const, label: 'Payments' }] : []), { id: 'notes', label: 'Notes & history' },
  ];
  const closed = ['COMPLETED', 'CANCELLED'].includes(d.status);

  return (
    <>
      <Link href={`/${area}/${area === 'doctor' ? 'patients' : 'cases'}`} className="mb-2 inline-flex items-center gap-1 text-sm font-medium"><Icon name="chevron" className="size-4 rotate-180" />Back to {area === 'doctor' ? 'patients' : 'cases'}</Link>
      <PageHeader
        title={d.patient.fullName}
        subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-mono">{d.caseNumber}</span><span>{d.treatment?.name ?? 'Treatment not chosen'}{d.preferredCountry ? ` · ${d.preferredCountry.name}` : ''}</span>{d.familyMember && <Badge>For {d.familyMember.fullName} ({d.familyMember.relationship.toLowerCase()})</Badge>}</span>}
        actions={<><PriorityDot p={d.priority} /><StatusBadge e={entry(CASE_STATUS, d.status)} />{canEdit && !closed && <Button onClick={() => setStatusOpen(true)}>Change stage</Button>}</>}
      />
      <Panel pad={false}>
        <div className="px-3 pt-1"><Tabs label="Case sections" value={tab} onChange={setTab} tabs={tabs} /></div>
        <div className="p-4 sm:p-5" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'overview' && <Overview d={d} area={area} canEdit={canEdit && !closed} />}
          {tab === 'documents' && <DocumentsTab caseId={id} area={area} />}
          {tab === 'appointments' && <AppointmentsTab caseId={id} />}
          {tab === 'visa' && <VisaTab caseId={id} />}
          {tab === 'travel' && <TravelTab caseId={id} />}
          {tab === 'payments' && <PaymentsTab caseId={id} />}
          {tab === 'notes' && <NotesTab caseId={id} canWrite={canEdit && !closed} />}
        </div>
      </Panel>
      <StatusDrawer open={statusOpen} onClose={() => setStatusOpen(false)} d={d} />
    </>
  );
}

// ─────────── overview ───────────
function Overview({ d, area, canEdit }: { d: CaseRow; area: string; canEdit: boolean }) {
  const { can } = usePermissions();
  const timeline = useGet<TimelineRow[]>(['case', 'timeline', d.id], `/cases/${d.id}/timeline`);
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">Medical information</h3>
          <KeyValue items={[['Symptoms', d.symptoms], ['Current diagnosis', d.currentDiagnosis], ['Medical history', d.medicalHistory], ['Previous treatment', d.previousTreatment], ['Medicines', d.currentMedications], ['Urgent information', d.emergencyInformation]]} />
        </section>
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">Plans</h3>
          <KeyValue items={[['Preferred country', d.preferredCountry?.name], ['Preferred hospital', d.preferredHospital?.name], ['Selected hospital', d.selectedHospital?.name], ['Selected doctor', d.selectedDoctor?.fullName ? `Dr. ${d.selectedDoctor.fullName}` : null], ['Preferred travel date', d.preferredTravelDate ? fmtDate(d.preferredTravelDate) : null], ['Budget', d.budgetMin != null || d.budgetMax != null ? `${d.budgetMin ?? '…'} – ${d.budgetMax ?? '…'} ${d.budgetCurrency ?? ''}` : null], ['Opened', fmtDateTime(d.createdAt)], ['Last update', relTime(d.updatedAt)]]} />
        </section>
        {can('patients.view') && area !== 'doctor' && <Link href={`/${area}/patients/${d.patient.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold"><Icon name="user" className="size-4" />Open {d.patient.fullName}’s patient record</Link>}
        {canEdit && <DoctorHospitalEditor d={d} />}
      </div>
      <div className="space-y-6">
        <TeamPanel d={d} />
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">Timeline</h3>
          {timeline.isLoading ? <Skeleton className="h-32" /> : (
            <ol className="relative space-y-4 border-l-2 border-ink-200 pl-5">
              {[...(timeline.data ?? [])].reverse().slice(0, 12).map((e) => (
                <li key={e.id} className="relative">
                  <span aria-hidden="true" className={`absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-white ring-2 ${e.visibility === 'INTERNAL' ? 'bg-amber-500 ring-amber-200' : 'bg-brand-600 ring-brand-200'}`} />
                  <time dateTime={e.occurredAt} className="text-xs text-ink-500">{fmtDateTime(e.occurredAt)}{e.visibility === 'INTERNAL' && <span className="ml-2 rounded bg-amber-50 px-1 font-medium text-amber-800">Internal</span>}</time>
                  <p className="text-sm font-medium text-ink-900">{e.title}</p>
                  {e.description && <p className="text-xs text-ink-600">{e.description}</p>}
                  {e.actor && <p className="text-xs text-ink-400">{e.actor}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function TeamPanel({ d }: { d: CaseRow }) {
  const { can } = usePermissions();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [role, setRole] = useState('MEDICAL_COORDINATOR');
  const staff = useGet<StaffPick[]>(['staff-directory'], adding ? '/admin/staff-directory' : null);
  const inval = [['case'], ['cases'], ['workspace']];
  const add = useAction(() => api(`/cases/${d.id}/assignments`, { method: 'POST', body: { staffId, role } }), { invalidate: inval, onSuccess: () => { toast('Team member assigned. They have been notified.'); setAdding(false); setStaffId(''); }, onError: (e) => toast(errorText(e), 'danger') });
  const remove = useAction((aid: string) => api(`/cases/${d.id}/assignments/${aid}`, { method: 'DELETE' }), { invalidate: inval, onSuccess: () => toast('Removed from the case.'), onError: (e) => toast(errorText(e), 'danger') });
  const canAssign = can('cases.assign') && !['COMPLETED', 'CANCELLED'].includes(d.status);
  return (
    <section>
      <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold uppercase tracking-wide text-ink-600">Care team</h3>{canAssign && <Button variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => setAdding(true)}><Icon name="plus" className="size-4" />Assign</Button>}</div>
      {d.assignments.length === 0 ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Nobody is assigned to this case yet.</p> : (
        <ul className="space-y-2">{d.assignments.map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-lg border border-ink-200 p-2.5"><Avatar name={a.staff.fullName} size={36} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{a.staff.fullName}</p><p className="text-xs text-ink-500">{STAFF_ROLE_ON_CASE[a.role]}</p></div>{canAssign && <button className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${a.staff.fullName}`} disabled={remove.isPending} onClick={() => remove.mutate(a.id)}><Icon name="x" className="size-4" /></button>}</li>
        ))}</ul>
      )}
      <Drawer open={adding} onClose={() => setAdding(false)} title="Assign a team member" footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button disabled={!staffId || add.isPending} onClick={() => add.mutate(undefined)}>Assign</Button></>}>
        <div className="space-y-4">
          <Field label="Role on this case" htmlFor="as-role"><Select id="as-role" value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(STAFF_ROLE_ON_CASE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Staff member" htmlFor="as-staff" hint="Sorted by name. The number shows how many active cases each person already has."><Select id="as-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)}><option value="">Choose…</option>{staff.data?.filter((s) => !d.assignments.some((a) => a.staff.id === s.id && a.role === role)).map((s) => <option key={s.id} value={s.id}>{s.fullName} — {s.activeCases} active</option>)}</Select></Field>
        </div>
      </Drawer>
    </section>
  );
}

function DoctorHospitalEditor({ d }: { d: CaseRow }) {
  const toast = useToast();
  const doctors = useGet<{ id: string; fullName: string; title: string | null }[]>(['dh-doctors'], '/doctors?pageSize=60');
  const hospitals = useGet<Ref[]>(['dh-hospitals'], '/hospitals?pageSize=60');
  const [doctorId, setDoctorId] = useState(d.selectedDoctor?.id ?? '');
  const [hospitalId, setHospitalId] = useState(d.selectedHospital?.id ?? '');
  const [priority, setPriority] = useState(d.priority);
  const save = useAction(() => api(`/cases/${d.id}`, { method: 'PATCH', body: { selectedDoctorId: doctorId || null, selectedHospitalId: hospitalId || null, priority } }), {
    invalidate: [['case'], ['cases'], ['workspace']], onSuccess: () => toast('Case updated.'), onError: (e) => toast(errorText(e), 'danger'),
  });
  const dirty = doctorId !== (d.selectedDoctor?.id ?? '') || hospitalId !== (d.selectedHospital?.id ?? '') || priority !== d.priority;
  return (
    <section className="rounded-lg border border-ink-200 bg-ink-50 p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">Recommendation and priority</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Selected doctor" htmlFor="se-doc"><Select id="se-doc" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}><option value="">None yet</option>{doctors.data?.map((x) => <option key={x.id} value={x.id}>{[x.title, x.fullName].filter(Boolean).join(' ')}</option>)}</Select></Field>
        <Field label="Selected hospital" htmlFor="se-hos"><Select id="se-hos" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}><option value="">None yet</option>{hospitals.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label="Priority" htmlFor="se-pri"><Select id="se-pri" value={priority} onChange={(e) => setPriority(e.target.value)}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
      </div>
      <p className="mt-2 text-xs text-ink-500">The patient sees a timeline entry when you pick a doctor or hospital.</p>
      <Button className="mt-3" disabled={!dirty || save.isPending} onClick={() => save.mutate(undefined)}>{save.isPending ? 'Saving…' : 'Save'}</Button>
    </section>
  );
}

function StatusDrawer({ open, onClose, d }: { open: boolean; onClose: () => void; d: CaseRow }) {
  const { can } = usePermissions();
  const toast = useToast();
  const [status, setStatus] = useState(d.status);
  const [message, setMessage] = useState('');
  const change = useAction(() => api(`/cases/${d.id}/status`, { method: 'POST', body: { status, message: message || undefined } }), {
    invalidate: [['case'], ['cases'], ['workspace'], ['admin-overview']], onSuccess: () => { toast('Stage updated. The patient has been notified.'); setMessage(''); onClose(); }, onError: (e) => toast(errorText(e), 'danger'),
  });
  return (
    <Drawer open={open} onClose={onClose} title="Change case stage" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={status === d.status || change.isPending} onClick={() => change.mutate(undefined)}>{change.isPending ? 'Saving…' : 'Update stage'}</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-700">The patient sees the new stage and your message in their treatment journey, and gets a notification.</p>
        <Field label="New stage" htmlFor="st-status"><Select id="st-status" value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(CASE_STATUS).map(([k, v]) => <option key={k} value={k} disabled={['COMPLETED', 'CANCELLED'].includes(k) && !can('cases.close')}>{v.label}{['COMPLETED', 'CANCELLED'].includes(k) && !can('cases.close') ? ' (needs permission)' : ''}</option>)}</Select></Field>
        <Field label="Message to the patient (optional)" htmlFor="st-msg"><Textarea id="st-msg" className="min-h-24" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="For example: Your reports were reviewed by the doctor." /></Field>
      </div>
    </Drawer>
  );
}

// ─────────── tabs ───────────
function DocumentsTab({ caseId, area }: { caseId: string; area: string }) {
  const actions = useDocActions();
  const [reject, setReject] = useState<DocRow | null>(null);
  const list = useList<DocRow>(['docs', 'case'], `/documents?caseId=${caseId}&pageSize=50`);
  return (
    <>
      <div className="-mx-4 -mb-4 sm:-mx-5 sm:-mb-5"><DataTable rows={list.data?.items} loading={list.isLoading} columns={docColumns(actions, setReject, area, false)} rowKey={(d) => d.id} caption="Case documents" empty={<p className="py-6 text-center text-sm text-ink-600">No documents you may open for this case yet.</p>} /></div>
      <RejectDrawer doc={reject} onClose={() => setReject(null)} busy={actions.verify.isPending} onSubmit={(reason) => reject && actions.verify.mutate({ id: reject.id, decision: 'REJECTED', reason }, { onSuccess: () => setReject(null) })} />
    </>
  );
}

function AppointmentsTab({ caseId }: { caseId: string }) {
  const { can } = usePermissions();
  const [form, setForm] = useState(false);
  const list = useList<ApptRow>(['appts', 'case'], `/appointments?caseId=${caseId}&pageSize=50`);
  return (
    <div>
      {can('appointments.create') && <div className="mb-3 flex justify-end"><Button onClick={() => setForm(true)}><Icon name="plus" className="size-4" />Schedule</Button></div>}
      {list.isLoading ? <Skeleton className="h-24" /> : !list.data?.items.length ? <EmptyState title="No appointments yet" /> : (
        <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">{list.data.items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"><div className="w-40"><p className="text-sm font-semibold">{fmtWhen(a.scheduledAt)}</p><p className="text-xs text-ink-500">{a.durationMinutes} min</p></div><div className="min-w-0 flex-1"><p className="text-sm">{APPT_TYPE[a.type]} · {METHOD[a.method]}</p><p className="text-xs text-ink-500">{a.doctor ? `Dr. ${a.doctor.fullName}` : 'Doctor to be confirmed'}{a.hospital ? ` · ${a.hospital.name}` : ''}</p></div><StatusBadge e={entry(APPT_STATUS, a.status)} /></li>
        ))}</ul>
      )}
      {form && <AppointmentForm open onClose={() => setForm(false)} defaultCaseId={caseId} />}
    </div>
  );
}

function VisaTab({ caseId }: { caseId: string }) {
  const { can } = usePermissions();
  const [open, setOpen] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const list = useList<VisaRow>(['visas', 'case'], `/visa?caseId=${caseId}&pageSize=20`);
  return (
    <div>
      {can('visa.edit') && <div className="mb-3 flex justify-end"><Button onClick={() => setCreate(true)}><Icon name="plus" className="size-4" />Start visa application</Button></div>}
      {list.isLoading ? <Skeleton className="h-24" /> : !list.data?.items.length ? <EmptyState title="No visa application" /> : (
        <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">{list.data.items.map((v) => (
          <li key={v.id}><button onClick={() => setOpen(v.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-ink-50"><div className="min-w-0 flex-1"><p className="font-semibold">{v.country.name}</p><p className="text-xs text-ink-500">{v.missingCount ? `${v.missingCount} documents missing` : 'Checklist complete'}{v.referenceNumber ? ` · ${v.referenceNumber}` : ''}</p></div><StatusBadge e={entry(VISA_STATUS, v.status)} /></button></li>
        ))}</ul>
      )}
      <VisaDrawer id={open} onClose={() => setOpen(null)} />
      <NewVisaDrawer open={create} caseId={caseId} onClose={() => setCreate(false)} />
    </div>
  );
}

function TravelTab({ caseId }: { caseId: string }) {
  const { can } = usePermissions();
  const [edit, setEdit] = useState(false);
  const q = useGet<TravelRow | null>(['travel-case', caseId], `/travel/case/${caseId}`);
  return (
    <div>
      {can('travel.edit') && <div className="mb-3 flex justify-end"><Button onClick={() => setEdit(true)}>{q.data ? 'Edit travel plan' : 'Create travel plan'}</Button></div>}
      {q.isLoading ? <Skeleton className="h-32" /> : q.data ? <TravelSummary t={q.data} /> : <EmptyState title="No travel plan yet">Flights, hotel and pickups appear here once they are arranged.</EmptyState>}
      {edit && <TravelEditor caseId={caseId} open onClose={() => setEdit(false)} />}
    </div>
  );
}

function PaymentsTab({ caseId }: { caseId: string }) {
  const { can } = usePermissions();
  const [open, setOpen] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const list = useList<InvoiceRow>(['invoices', 'case'], `/invoices?caseId=${caseId}&pageSize=20`);
  const columns: Column<InvoiceRow>[] = [
    { key: 'no', header: 'Invoice', primary: true, cell: (i) => <span className="font-mono">{i.invoiceNumber}</span> },
    { key: 'status', header: 'Status', cell: (i) => <StatusBadge e={entry(INVOICE_STATUS, i.status)} /> },
    { key: 'total', header: 'Total', align: 'right', cell: (i) => money(i.total, i.currency) },
    { key: 'bal', header: 'Balance', align: 'right', cell: (i) => money(i.status === 'CANCELLED' ? 0 : i.balance, i.currency) },
  ];
  return (
    <div>
      {can('payments.create') && <div className="mb-3 flex justify-end"><Button onClick={() => setCreate(true)}><Icon name="plus" className="size-4" />New invoice</Button></div>}
      <div className="rounded-lg border border-ink-200"><DataTable rows={list.data?.items} loading={list.isLoading} columns={columns} rowKey={(i) => i.id} caption="Invoices for this case" onRowClick={(i) => setOpen(i.id)} empty={<p className="py-6 text-center text-sm text-ink-600">No invoices for this case.</p>} /></div>
      <InvoiceDrawer id={open} onClose={() => setOpen(null)} />
      {create && <InvoiceForm open caseId={caseId} onClose={() => setCreate(false)} />}
    </div>
  );
}

function NotesTab({ caseId, canWrite }: { caseId: string; canWrite: boolean }) {
  const toast = useToast();
  const notes = useGet<NoteRow[]>(['case', 'notes', caseId], `/cases/${caseId}/notes`);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'INTERNAL' | 'PATIENT_VISIBLE'>('INTERNAL');
  const add = useAction(() => api(`/cases/${caseId}/notes`, { method: 'POST', body: { body, visibility } }), { invalidate: [['case']], onSuccess: () => { setBody(''); toast(visibility === 'INTERNAL' ? 'Internal note saved.' : 'Update posted to the patient.'); }, onError: (e) => toast(errorText(e), 'danger') });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {canWrite && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Add a note</h3>
          <Field label="Note" htmlFor="nt-body"><Textarea id="nt-body" className="min-h-28" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <fieldset className="mt-3"><legend className="mb-1 text-sm font-medium">Who can see it?</legend>
            <label className="flex items-start gap-2 py-1 text-sm"><input type="radio" name="vis" className="mt-1" checked={visibility === 'INTERNAL'} onChange={() => setVisibility('INTERNAL')} /><span><strong>Internal</strong> — staff only. The patient never sees it.</span></label>
            <label className="flex items-start gap-2 py-1 text-sm"><input type="radio" name="vis" className="mt-1" checked={visibility === 'PATIENT_VISIBLE'} onChange={() => setVisibility('PATIENT_VISIBLE')} /><span><strong>Update for the patient</strong> — appears in their journey and sends a message.</span></label>
          </fieldset>
          <Button className="mt-3" disabled={!body.trim() || add.isPending} onClick={() => add.mutate(undefined)}>{add.isPending ? 'Saving…' : visibility === 'INTERNAL' ? 'Save internal note' : 'Post update'}</Button>
        </div>
      )}
      <div className={canWrite ? '' : 'lg:col-span-2'}>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Notes</h3>
        {notes.isLoading ? <Skeleton className="h-24" /> : !notes.data?.length ? <p className="text-sm text-ink-600">No notes yet.</p> : (
          <ul className="space-y-3">{notes.data.map((n) => (
            <li key={n.id} className={`rounded-lg border p-3 ${n.visibility === 'INTERNAL' ? 'border-amber-200 bg-amber-50/60' : 'border-brand-200 bg-brand-50/50'}`}>
              <p className="whitespace-pre-line text-sm text-ink-900">{n.body}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">{n.author} · {relTime(n.createdAt)}{n.visibility === 'INTERNAL' ? <Badge tone="warning">Internal</Badge> : <Badge tone="info">Shown to patient</Badge>}</p>
            </li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}
