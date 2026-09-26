'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, DoctorPhoto, EmptyState, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { ApptRow, DocRow, InvoiceRow, TravelRow, VisaRow } from '@/lib/console-types';
import { errorText, qstr, useAction, useGet, useList } from '@/lib/hooks';
import { fmtDate } from '@/lib/labels';
import { APPT_STATUS, APPT_TYPE, INVOICE_STATUS, METHOD, VISA_ITEM, VISA_STATUS, entry, fmtWhen, money } from '@/lib/status';
import { Icon } from '../console/icons';
import { useToast } from '../console/shell';
import { ConfirmDialog, Drawer, ErrorNote, KeyValue, PageHeader, Panel, Skeleton, StatusBadge, Tabs } from '../console/kit';

const Loading = () => <div className="space-y-3" aria-busy="true"><Skeleton className="h-10 w-56" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
interface CaseOpt { id: string; caseNumber: string; status: string; statusLabel: string }
interface DoctorOpt { id: string; fullName: string; title: string | null }

// ───────────── appointments ─────────────
function RequestDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const cases = useGet<CaseOpt[]>(['my-cases'], open ? '/cases?pageSize=50' : null);
  const doctors = useGet<DoctorOpt[]>(['appt-doctors'], open ? '/doctors?pageSize=60' : null);
  const [caseId, setCaseId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [type, setType] = useState('ONLINE_CONSULTATION');
  const [method, setMethod] = useState('VIDEO');
  const [when, setWhen] = useState(toLocalInput(new Date(Date.now() + 3 * 86_400_000)));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const open_ = (cases.data ?? []).filter((c) => !['COMPLETED', 'CANCELLED'].includes(c.status));
  const chosen = caseId || open_[0]?.id || '';

  const save = useAction(() => api('/appointments/request', { method: 'POST', body: { caseId: chosen, doctorId: doctorId || null, type, method, preferredAt: new Date(when).toISOString(), notes: notes || null } }), {
    invalidate: [['appts'], ['patient-home']], onSuccess: () => { toast('Request sent. Your coordinator will confirm the time with you.'); onClose(); setNotes(''); }, onError: (e) => setError(errorText(e)),
  });

  return (
    <Drawer open={open} onClose={onClose} title="Request an appointment" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={save.isPending || !chosen} onClick={() => { setError(null); save.mutate(undefined); }}>{save.isPending ? 'Sending…' : 'Send request'}</Button></>}>
      <div className="space-y-4">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
        {open && !cases.isLoading && open_.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">You need an open treatment case before you can request an appointment. <Link href="/patient/cases/new" className="font-semibold">Start a case</Link>.</p>}
        <Field label="For which case?" htmlFor="ap-case"><Select id="ap-case" value={chosen} onChange={(e) => setCaseId(e.target.value)}>{open_.map((c) => <option key={c.id} value={c.id}>{c.caseNumber} · {c.statusLabel}</option>)}</Select></Field>
        <Field label="Doctor (optional)" htmlFor="ap-doc" hint="Leave empty and your coordinator will suggest the right specialist."><Select id="ap-doc" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}><option value="">Let my coordinator choose</option>{(doctors.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.title ? `${d.title} ` : 'Dr. '}{d.fullName}</option>)}</Select></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="ap-type"><Select id="ap-type" value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(APPT_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="How" htmlFor="ap-method"><Select id="ap-method" value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        </div>
        <Field label="Preferred date and time" htmlFor="ap-when" hint="Shown in your device’s time zone."><Input id="ap-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <Field label="Anything we should know?" htmlFor="ap-notes"><Textarea id="ap-notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Drawer>
  );
}

function ApptCard({ a, onCancel }: { a: ApptRow; onCancel?: () => void }) {
  const live = !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(a.status);
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-ink-200 bg-white p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {a.doctor ? <DoctorPhoto name={a.doctor.fullName} photoKey={a.doctor.photoKey} size={48} /> : <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Icon name="calendar" className="size-6" /></span>}
        <div className="min-w-0">
          <p className="font-semibold text-ink-900">{fmtWhen(a.scheduledAt)}</p>
          <p className="truncate text-sm text-ink-700">{APPT_TYPE[a.type] ?? a.type} · {METHOD[a.method] ?? a.method}{a.doctor ? ` · ${a.doctor.title ?? 'Dr.'} ${a.doctor.fullName}` : ''}</p>
          <p className="truncate text-xs text-ink-500">{a.hospital?.name ?? 'Hospital to be confirmed'} · {a.durationMinutes} min · <span className="font-mono">{a.case.caseNumber}</span></p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <StatusBadge e={entry(APPT_STATUS, a.status)} />
        {live && a.meetingUrl && a.method === 'VIDEO' && <a href={a.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white no-underline"><Icon name="video" className="size-4" />Join</a>}
        {live && onCancel && <button onClick={onCancel} className="min-h-10 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50">Cancel</button>}
      </div>
    </li>
  );
}

export function PatientAppointmentsScreen() {
  const toast = useToast();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [req, setReq] = useState(false);
  const [cancel, setCancel] = useState<ApptRow | null>(null);
  const up = useList<ApptRow>(['appts', 'up'], `/appointments${qstr({ upcoming: 'true', sort: 'scheduledAt', pageSize: 50 })}`);
  const all = useList<ApptRow>(['appts', 'all'], `/appointments${qstr({ sort: '-scheduledAt', pageSize: 100 })}`);
  const past = (all.data?.items ?? []).filter((a) => new Date(a.scheduledAt) < new Date() || ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(a.status));
  const doCancel = useAction(() => api(`/appointments/${cancel!.id}/status`, { method: 'POST', body: { status: 'CANCELLED' } }), {
    invalidate: [['appts'], ['patient-home']], onSuccess: () => { toast('Appointment cancelled. Your coordinator has been told.'); setCancel(null); }, onError: (e) => { toast(errorText(e), 'danger'); setCancel(null); },
  });
  const active = tab === 'upcoming' ? up : all;
  const rows = tab === 'upcoming' ? up.data?.items : past;

  return (
    <>
      <PageHeader title="Appointments" subtitle="Consultations with your doctors, online or at the hospital." actions={<Button onClick={() => setReq(true)}><Icon name="plus" className="size-4" />Request appointment</Button>} />
      <Panel pad={false}>
        <div className="px-3 pt-1"><Tabs label="Appointments" value={tab} onChange={setTab} tabs={[{ id: 'upcoming', label: 'Upcoming', count: up.data?.meta.total }, { id: 'past', label: 'Past & cancelled' }]} /></div>
        <div className="p-4">
          {active.isLoading ? <Skeleton className="h-32" /> : active.isError ? <ErrorNote error={active.error} retry={() => active.refetch()} /> : !rows?.length ? (
            <EmptyState title={tab === 'upcoming' ? 'No upcoming appointments' : 'Nothing here yet'} action={tab === 'upcoming' ? <Button onClick={() => setReq(true)}>Request an appointment</Button> : undefined}>{tab === 'upcoming' ? 'Ask for a consultation and your coordinator will confirm a time.' : 'Finished and cancelled appointments will appear here.'}</EmptyState>
          ) : <ul className="space-y-3">{rows.map((a) => <ApptCard key={a.id} a={a} onCancel={() => setCancel(a)} />)}</ul>}
        </div>
      </Panel>
      <RequestDrawer open={req} onClose={() => setReq(false)} />
      <ConfirmDialog open={!!cancel} title="Cancel this appointment?" confirmLabel="Yes, cancel it" danger busy={doCancel.isPending} onConfirm={() => doCancel.mutate(undefined)} onCancel={() => setCancel(null)}>
        {cancel && <>Your appointment on <strong>{fmtWhen(cancel.scheduledAt)}</strong> will be cancelled and your coordinator will be told. You can request a new time at any point.</>}
      </ConfirmDialog>
    </>
  );
}

// ───────────── visa ─────────────
function VisaCard({ v }: { v: VisaRow }) {
  const toast = useToast();
  const [pick, setPick] = useState<{ itemId: string; name: string } | null>(null);
  const [docId, setDocId] = useState('');
  const docs = useGet<DocRow[]>(['my-docs'], pick ? '/documents?pageSize=100' : null);
  const attach = useAction(() => api(`/visa/${v.id}/checklist/${pick!.itemId}/attach`, { method: 'POST', body: { documentId: docId } }), {
    invalidate: [['visa'], ['patient-home']], onSuccess: () => { toast('Document sent to your visa officer.'); setPick(null); setDocId(''); }, onError: (e) => toast(errorText(e), 'danger'),
  });
  const done = v.checklist.filter((c) => c.status === 'VERIFIED').length;
  const pct = v.checklist.length ? Math.round((done / v.checklist.length) * 100) : 0;
  return (
    <Panel title={<span className="flex flex-wrap items-center gap-2">{v.country.name} visa <StatusBadge e={entry(VISA_STATUS, v.status)} /></span>} action={<Link href={`/patient/cases/${v.case.id}`} className="text-sm font-semibold">Case {v.case.caseNumber}</Link>}>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <KeyValue items={[['Reference', v.referenceNumber], ['Applied', v.applicationDate ? fmtDate(v.applicationDate) : null], ['Decision', v.decisionDate ? fmtDate(v.decisionDate) : null], ['Expected time', v.expectedProcessingInfo], ['Note from your officer', v.patientRemarks]]} />
          <p className="mt-3 rounded-lg bg-ink-50 p-3 text-xs text-ink-600">{v.disclaimer}</p>
        </div>
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between text-sm"><p className="font-semibold">Document checklist</p><p className="text-ink-600">{done} of {v.checklist.length} verified</p></div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Visa documents verified"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
          <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
            {v.checklist.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1"><p className="text-sm font-medium text-ink-900">{c.name}{c.isMandatory && <span className="ml-1 text-xs text-ink-500">(required)</span>}</p>{(c.remarks || c.description) && <p className="text-xs text-ink-600">{c.remarks ?? c.description}</p>}</div>
                <StatusBadge e={entry(VISA_ITEM, c.status)} />
                {(c.status === 'MISSING' || c.status === 'REJECTED') && <Button variant="secondary" className="min-h-9 px-3 py-1 text-sm" onClick={() => setPick({ itemId: c.id, name: c.name })}>Attach document</Button>}
              </li>
            ))}
            {v.checklist.length === 0 && <li className="p-4 text-sm text-ink-600">Your visa officer will add the checklist for this country.</li>}
          </ul>
        </div>
      </div>
      <Drawer open={!!pick} onClose={() => setPick(null)} title={pick ? `Attach: ${pick.name}` : ''} footer={<><Button variant="secondary" onClick={() => setPick(null)}>Cancel</Button><Button disabled={!docId || attach.isPending} onClick={() => attach.mutate(undefined)}>{attach.isPending ? 'Sending…' : 'Send to visa officer'}</Button></>}>
        <p className="mb-3 text-sm text-ink-700">Choose one of your uploaded documents. Need a new one? <Link href="/patient/documents" className="font-semibold">Upload it first</Link>.</p>
        {docs.isLoading ? <Skeleton className="h-24" /> : (
          <Field label="Your documents" htmlFor="visa-doc"><Select id="visa-doc" value={docId} onChange={(e) => setDocId(e.target.value)}><option value="">Select a document…</option>{(docs.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.categoryLabel}{d.file ? ` — ${d.file.fileName}` : ''} ({d.statusLabel})</option>)}</Select></Field>
        )}
      </Drawer>
    </Panel>
  );
}

export function PatientVisaScreen() {
  const q = useList<VisaRow>(['visa'], '/visa?pageSize=20');
  return (
    <>
      <PageHeader title="Visa" subtitle="Follow your visa application and send the papers your officer asks for." />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorNote error={q.error} retry={() => q.refetch()} /> : !q.data?.items.length ? (
        <Panel><EmptyState title="No visa application yet">When your treatment plan is confirmed, your visa officer will open the application and list the documents you need.</EmptyState></Panel>
      ) : <div className="space-y-5">{q.data.items.map((v) => <VisaCard key={v.id} v={v} />)}</div>}
    </>
  );
}

// ───────────── travel ─────────────
const when = (d: string | null) => (d ? fmtWhen(d) : 'To be confirmed');
function TravelCard({ t }: { t: TravelRow }) {
  return (
    <Panel title={<span>Trip for case <span className="font-mono">{t.case.caseNumber}</span>{t.case.hospital ? ` · ${t.case.hospital}` : ''}</span>} action={t.nextMilestone ? <Badge tone="info">Next: {fmtWhen(t.nextMilestone)}</Badge> : undefined}>
      <div className="grid gap-5 lg:grid-cols-2">
        <section><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-600"><Icon name="plane" className="size-4" />Flights</h3>
          {t.flights.length === 0 ? <p className="text-sm text-ink-500">Not booked yet.</p> : <ul className="space-y-2">{t.flights.map((f) => <li key={f.id} className="rounded-lg border border-ink-200 p-3 text-sm"><p className="font-semibold">{f.departureAirport} → {f.arrivalAirport} <span className="text-xs font-normal text-ink-500">{f.direction === 'RETURN' ? 'Return' : 'Outbound'}</span></p><p className="text-ink-700">{fmtWhen(f.departureAt)}{f.airline ? ` · ${f.airline} ${f.flightNumber ?? ''}` : ''}</p>{f.bookingReference && <p className="text-xs text-ink-500">Booking ref <span className="font-mono">{f.bookingReference}</span></p>}</li>)}</ul>}
        </section>
        <section><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-600"><Icon name="building" className="size-4" />Where you will stay</h3>
          {t.hotels.length === 0 ? <p className="text-sm text-ink-500">Not booked yet.</p> : <ul className="space-y-2">{t.hotels.map((h) => <li key={h.id} className="rounded-lg border border-ink-200 p-3 text-sm"><p className="font-semibold">{h.name}</p><p className="text-ink-700">{fmtDate(h.checkInDate)}{h.checkOutDate ? ` – ${fmtDate(h.checkOutDate)}` : ''}{h.roomInfo ? ` · ${h.roomInfo}` : ''}</p>{h.address && <p className="text-xs text-ink-500">{h.address}</p>}{h.phone && <p className="text-xs text-ink-500">{h.phone}</p>}</li>)}</ul>}
        </section>
        <section><h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Airport and local transport</h3>
          {t.transports.length === 0 ? <p className="text-sm text-ink-500">Not arranged yet.</p> : <ul className="space-y-2">{t.transports.map((x) => <li key={x.id} className="rounded-lg border border-ink-200 p-3 text-sm"><p className="font-semibold">{x.type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</p><p className="text-ink-700">{when(x.scheduledAt)}</p><p className="text-xs text-ink-500">{[x.pickupLocation, x.dropLocation].filter(Boolean).join(' → ')}</p>{x.driverName && <p className="text-xs text-ink-500">Driver {x.driverName}{x.driverPhone ? ` · ${x.driverPhone}` : ''}</p>}</li>)}</ul>}
        </section>
        <section><h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Contacts</h3>
          <KeyValue items={[['Travellers', String(t.travelerCount)], ['Local coordinator', t.localCoordinatorName ? `${t.localCoordinatorName}${t.localCoordinatorPhone ? ` · ${t.localCoordinatorPhone}` : ''}` : null], ['Emergency contact', t.emergencyContactName ? `${t.emergencyContactName}${t.emergencyContactPhone ? ` · ${t.emergencyContactPhone}` : ''}` : null], ['Notes', t.notes]]} />
        </section>
      </div>
    </Panel>
  );
}

export function PatientTravelScreen() {
  const q = useList<TravelRow>(['travel'], '/travel?pageSize=20');
  return (
    <>
      <PageHeader title="Travel" subtitle="Flights, hotel and pick-ups arranged for your treatment trip." />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorNote error={q.error} retry={() => q.refetch()} /> : !q.data?.items.length ? (
        <Panel><EmptyState title="No travel plan yet">Once your treatment dates are set, your travel coordinator will add your flights, stay and transport here.</EmptyState></Panel>
      ) : <div className="space-y-5">{q.data.items.map((t) => <TravelCard key={t.id} t={t} />)}</div>}
    </>
  );
}

// ───────────── payments ─────────────
export function PatientPaymentsScreen() {
  const q = useList<InvoiceRow>(['invoices'], '/invoices?pageSize=50');
  const [open, setOpen] = useState<InvoiceRow | null>(null);
  const items = q.data?.items ?? [];
  const totals = new Map<string, { billed: number; paid: number; balance: number }>();
  for (const i of items) if (i.status !== 'CANCELLED') { const t = totals.get(i.currency) ?? { billed: 0, paid: 0, balance: 0 }; t.billed += i.total; t.paid += i.paid; t.balance += i.balance; totals.set(i.currency, t); }

  return (
    <>
      <PageHeader title="Payments" subtitle="Your invoices and the payments we have received." />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorNote error={q.error} retry={() => q.refetch()} /> : (
        <>
          {totals.size > 0 && (
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              {[...totals.entries()].flatMap(([cur, t]) => [['Billed', t.billed, cur, 'text-ink-900'], ['Paid', t.paid, cur, 'text-emerald-700'], ['Balance due', t.balance, cur, t.balance > 0 ? 'text-amber-700' : 'text-ink-900']] as const).map(([l, v, cur, cls], i) => (
                <div key={`${l}${cur}${i}`} className="rounded-xl border border-ink-200 bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink-500">{l}</p><p className={`mt-1 text-2xl font-bold ${cls}`}>{money(v, cur)}</p></div>
              ))}
            </div>
          )}
          {!items.length ? <Panel><EmptyState title="No invoices yet">When your coordinator or the finance team sends an invoice, it will show up here.</EmptyState></Panel> : (
            <Panel pad={false}>
              <ul className="divide-y divide-ink-100">{items.map((i) => (
                <li key={i.id}><button onClick={() => setOpen(i)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3.5 text-left hover:bg-ink-50 sm:px-5">
                  <div className="min-w-0 flex-1"><p className="font-semibold text-ink-900">{i.invoiceNumber}</p><p className="text-xs text-ink-500">Case {i.case.caseNumber} · issued {fmtDate(i.issuedAt)}{i.dueDate ? ` · due ${fmtDate(i.dueDate)}` : ''}</p></div>
                  <div className="text-right"><p className="font-semibold">{money(i.total, i.currency)}</p>{i.balance > 0 && i.status !== 'CANCELLED' && <p className="text-xs text-amber-700">{money(i.balance, i.currency)} due</p>}</div>
                  <StatusBadge e={i.overdue ? { label: 'Overdue', tone: 'danger' } : entry(INVOICE_STATUS, i.status)} />
                </button></li>
              ))}</ul>
            </Panel>
          )}
        </>
      )}
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `Invoice ${open.invoiceNumber}` : ''} wide>
        {open && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge e={entry(INVOICE_STATUS, open.status)} /><span className="text-sm text-ink-600">Case {open.case.caseNumber}</span></div>
            <table className="w-full text-sm"><caption className="sr-only">Invoice items</caption><thead className="text-left text-xs uppercase text-ink-500"><tr><th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-ink-100">{open.items.map((x) => <tr key={x.id}><td className="py-2 pr-2">{x.description}</td><td className="py-2 text-right">{x.quantity}</td><td className="py-2 text-right">{money(x.amount, open.currency)}</td></tr>)}</tbody>
              <tfoot className="text-sm"><tr><td colSpan={2} className="pt-3 text-right text-ink-600">Subtotal</td><td className="pt-3 text-right">{money(open.subtotal, open.currency)}</td></tr>{open.discount > 0 && <tr><td colSpan={2} className="text-right text-ink-600">Discount</td><td className="text-right">−{money(open.discount, open.currency)}</td></tr>}{open.tax > 0 && <tr><td colSpan={2} className="text-right text-ink-600">Tax</td><td className="text-right">{money(open.tax, open.currency)}</td></tr>}<tr className="font-bold"><td colSpan={2} className="pt-1 text-right">Total</td><td className="pt-1 text-right">{money(open.total, open.currency)}</td></tr><tr><td colSpan={2} className="text-right text-emerald-700">Paid</td><td className="text-right text-emerald-700">{money(open.paid, open.currency)}</td></tr><tr className="font-bold"><td colSpan={2} className="text-right">Balance</td><td className="text-right">{money(open.balance, open.currency)}</td></tr></tfoot>
            </table>
            <section><h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Payments received</h3>
              {open.payments.length === 0 ? <p className="text-sm text-ink-500">No payments yet.</p> : <ul className="space-y-2">{open.payments.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 p-3 text-sm"><div><p className="font-medium">{money(p.amount, p.currency)} · {p.method.replace(/_/g, ' ').toLowerCase()}</p><p className="text-xs text-ink-500">{p.paidAt ? fmtDate(p.paidAt) : ''}{p.receiptNumber ? ` · receipt ${p.receiptNumber}` : ''}</p></div><Badge tone={p.status === 'COMPLETED' ? 'success' : 'neutral'}>{p.status.toLowerCase()}</Badge></li>)}</ul>}
            </section>
            {open.notes && <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-700">{open.notes}</p>}
            <p className="text-xs text-ink-500">To pay, contact your coordinator. Our team records bank transfers and card payments against your invoice.</p>
          </div>
        )}
      </Drawer>
    </>
  );
}
