'use client';

import { useState } from 'react';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { TravelRow } from '@/lib/console-types';
import { errorText, useAction, useGet, useList } from '@/lib/hooks';
import { fmtDateTime, fmtDate } from '@/lib/labels';
import { relTime } from '@/lib/status';
import { usePermissions } from '../providers';
import { Icon } from '../icons';
import { useToast } from '../shell';
import { DataTable, Drawer, KeyValue, PageHeader, Pager, Panel, type Column } from '../kit';

const local = (iso: string | null | undefined) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
const TRANSPORT: Record<string, string> = { AIRPORT_PICKUP: 'Airport pickup', AIRPORT_DROP: 'Airport drop-off', HOSPITAL_TRANSFER: 'Hospital transfer', OTHER: 'Other' };
const DIRECTION: Record<string, string> = { OUTBOUND: 'Outbound', RETURN: 'Return', INTERNAL: 'Internal' };

type Flight = { direction: string; airline: string; flightNumber: string; departureAirport: string; arrivalAirport: string; departureAt: string; arrivalAt: string; bookingReference: string };
type Hotel = { name: string; address: string; phone: string; checkInDate: string; checkOutDate: string; bookingReference: string; roomInfo: string };
type Transport = { type: string; pickupLocation: string; dropLocation: string; scheduledAt: string; driverName: string; driverPhone: string; vehicleInfo: string };

/** Read-only summary of a travel plan (used inside the case workspace and the list drawer). */
export function TravelSummary({ t }: { t: TravelRow }) {
  return (
    <div className="space-y-5">
      <KeyValue items={[['Travellers', t.travelerCount], ['Local coordinator', t.localCoordinatorName ? `${t.localCoordinatorName}${t.localCoordinatorPhone ? ` · ${t.localCoordinatorPhone}` : ''}` : null], ['Emergency contact', t.emergencyContactName ? `${t.emergencyContactName}${t.emergencyContactPhone ? ` · ${t.emergencyContactPhone}` : ''}` : null], ['Notes', t.notes]]} />
      {t.flights.length > 0 && <div><h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Flights</h4><ul className="space-y-2">{t.flights.map((f) => <li key={f.id} className="flex items-start gap-3 rounded-lg border border-ink-200 p-3 text-sm"><Icon name="plane" className="mt-0.5 size-4 shrink-0 text-brand-700" /><div><p className="font-semibold">{DIRECTION[f.direction]} · {f.departureAirport} → {f.arrivalAirport}</p><p className="text-ink-600">{fmtDateTime(f.departureAt)}{f.airline ? ` · ${f.airline} ${f.flightNumber ?? ''}` : ''}{f.bookingReference ? ` · ref ${f.bookingReference}` : ''}</p></div></li>)}</ul></div>}
      {t.hotels.length > 0 && <div><h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Stay</h4><ul className="space-y-2">{t.hotels.map((h) => <li key={h.id} className="rounded-lg border border-ink-200 p-3 text-sm"><p className="font-semibold">{h.name}</p><p className="text-ink-600">{fmtDate(h.checkInDate)}{h.checkOutDate ? ` → ${fmtDate(h.checkOutDate)}` : ''}{h.roomInfo ? ` · ${h.roomInfo}` : ''}</p>{h.address && <p className="text-xs text-ink-500">{h.address}{h.phone ? ` · ${h.phone}` : ''}</p>}</li>)}</ul></div>}
      {t.transports.length > 0 && <div><h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Transport</h4><ul className="space-y-2">{t.transports.map((x) => <li key={x.id} className="rounded-lg border border-ink-200 p-3 text-sm"><p className="font-semibold">{TRANSPORT[x.type]}{x.scheduledAt ? ` · ${fmtDateTime(x.scheduledAt)}` : ''}</p><p className="text-ink-600">{[x.pickupLocation, x.dropLocation].filter(Boolean).join(' → ')}</p>{x.driverName && <p className="text-xs text-ink-500">{x.driverName}{x.driverPhone ? ` · ${x.driverPhone}` : ''}{x.vehicleInfo ? ` · ${x.vehicleInfo}` : ''}</p>}</li>)}</ul></div>}
    </div>
  );
}

/** Create or replace a case's travel plan. Requires travel.edit. */
export function TravelEditor({ caseId, open, onClose }: { caseId: string; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const existing = useGet<TravelRow | null>(['travel-case', caseId], open ? `/travel/case/${caseId}` : null);
  const loaded = existing.isSuccess;
  const t = existing.data;
  const [seed, setSeed] = useState<string | null>(null);
  const [basic, setBasic] = useState({ travelerCount: '1', localCoordinatorName: '', localCoordinatorPhone: '', emergencyContactName: '', emergencyContactPhone: '', notes: '' });
  const [flights, setFlights] = useState<Flight[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (loaded && seed !== caseId + (t?.updatedAt ?? 'new')) {
    setSeed(caseId + (t?.updatedAt ?? 'new'));
    setBasic({ travelerCount: String(t?.travelerCount ?? 1), localCoordinatorName: t?.localCoordinatorName ?? '', localCoordinatorPhone: t?.localCoordinatorPhone ?? '', emergencyContactName: t?.emergencyContactName ?? '', emergencyContactPhone: t?.emergencyContactPhone ?? '', notes: t?.notes ?? '' });
    setFlights((t?.flights ?? []).map((f) => ({ direction: f.direction, airline: f.airline ?? '', flightNumber: f.flightNumber ?? '', departureAirport: f.departureAirport, arrivalAirport: f.arrivalAirport, departureAt: local(f.departureAt), arrivalAt: local(f.arrivalAt), bookingReference: f.bookingReference ?? '' })));
    setHotels((t?.hotels ?? []).map((h) => ({ name: h.name, address: h.address ?? '', phone: h.phone ?? '', checkInDate: day(h.checkInDate), checkOutDate: day(h.checkOutDate), bookingReference: h.bookingReference ?? '', roomInfo: h.roomInfo ?? '' })));
    setTransports((t?.transports ?? []).map((x) => ({ type: x.type, pickupLocation: x.pickupLocation ?? '', dropLocation: x.dropLocation ?? '', scheduledAt: local(x.scheduledAt), driverName: x.driverName ?? '', driverPhone: x.driverPhone ?? '', vehicleInfo: x.vehicleInfo ?? '' })));
  }

  const n = (s: string) => (s.trim() ? s.trim() : null);
  const save = useAction(() => api(`/travel/case/${caseId}`, {
    method: 'PUT',
    body: {
      travelerCount: Number(basic.travelerCount) || 1, localCoordinatorName: n(basic.localCoordinatorName), localCoordinatorPhone: n(basic.localCoordinatorPhone), emergencyContactName: n(basic.emergencyContactName), emergencyContactPhone: n(basic.emergencyContactPhone), notes: n(basic.notes),
      flights: flights.map((f) => ({ direction: f.direction, airline: n(f.airline), flightNumber: n(f.flightNumber), departureAirport: f.departureAirport, arrivalAirport: f.arrivalAirport, departureAt: new Date(f.departureAt).toISOString(), arrivalAt: f.arrivalAt ? new Date(f.arrivalAt).toISOString() : null, bookingReference: n(f.bookingReference) })),
      hotels: hotels.map((h) => ({ name: h.name, address: n(h.address), phone: n(h.phone), checkInDate: h.checkInDate, checkOutDate: h.checkOutDate || null, bookingReference: n(h.bookingReference), roomInfo: n(h.roomInfo) })),
      transports: transports.map((x) => ({ type: x.type, pickupLocation: n(x.pickupLocation), dropLocation: n(x.dropLocation), scheduledAt: x.scheduledAt ? new Date(x.scheduledAt).toISOString() : null, driverName: n(x.driverName), driverPhone: n(x.driverPhone), vehicleInfo: n(x.vehicleInfo) })),
    },
  }), { invalidate: [['travel'], ['travel-case'], ['travels'], ['case'], ['workspace']], onSuccess: () => { toast('Travel plan saved. The patient has been notified.'); onClose(); }, onError: (e) => setError(errorText(e)) });

  const upd = <T,>(list: T[], set: (v: T[]) => void, i: number, patch: Partial<T>) => set(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const rm = <T,>(list: T[], set: (v: T[]) => void, i: number) => set(list.filter((_, j) => j !== i));

  return (
    <Drawer open={open} onClose={onClose} title={t ? 'Edit travel plan' : 'Create travel plan'} wide footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={save.isPending || !loaded} onClick={() => { setError(null); save.mutate(undefined); }}>{save.isPending ? 'Saving…' : 'Save travel plan'}</Button></>}>
      {!loaded ? <p className="text-sm text-ink-600">Loading…</p> : (
        <div className="space-y-6">
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Travellers" htmlFor="t-n"><Input id="t-n" type="number" min={1} max={10} value={basic.travelerCount} onChange={(e) => setBasic({ ...basic, travelerCount: e.target.value })} /></Field>
            <span />
            <Field label="Local coordinator" htmlFor="t-lc"><Input id="t-lc" value={basic.localCoordinatorName} onChange={(e) => setBasic({ ...basic, localCoordinatorName: e.target.value })} /></Field>
            <Field label="Coordinator phone" htmlFor="t-lp"><Input id="t-lp" type="tel" value={basic.localCoordinatorPhone} onChange={(e) => setBasic({ ...basic, localCoordinatorPhone: e.target.value })} /></Field>
            <Field label="Emergency contact" htmlFor="t-ec"><Input id="t-ec" value={basic.emergencyContactName} onChange={(e) => setBasic({ ...basic, emergencyContactName: e.target.value })} /></Field>
            <Field label="Emergency phone" htmlFor="t-ep"><Input id="t-ep" type="tel" value={basic.emergencyContactPhone} onChange={(e) => setBasic({ ...basic, emergencyContactPhone: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="Notes for the patient" htmlFor="t-notes"><Textarea id="t-notes" className="min-h-20" value={basic.notes} onChange={(e) => setBasic({ ...basic, notes: e.target.value })} /></Field></div>
          </section>

          <section><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Flights</h3><Button variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => setFlights([...flights, { direction: 'OUTBOUND', airline: '', flightNumber: '', departureAirport: '', arrivalAirport: '', departureAt: '', arrivalAt: '', bookingReference: '' }])}><Icon name="plus" className="size-4" />Add flight</Button></div>
            <div className="space-y-3">{flights.map((f, i) => (
              <div key={i} className="grid gap-3 rounded-lg border border-ink-200 p-3 sm:grid-cols-2">
                <Field label="Direction" htmlFor={`f-d-${i}`}><Select id={`f-d-${i}`} value={f.direction} onChange={(e) => upd(flights, setFlights, i, { direction: e.target.value })}>{Object.entries(DIRECTION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
                <Field label="Airline and number" htmlFor={`f-a-${i}`}><div className="flex gap-2"><Input id={`f-a-${i}`} placeholder="Airline" value={f.airline} onChange={(e) => upd(flights, setFlights, i, { airline: e.target.value })} /><Input aria-label="Flight number" placeholder="No." className="w-28" value={f.flightNumber} onChange={(e) => upd(flights, setFlights, i, { flightNumber: e.target.value })} /></div></Field>
                <Field label="From" htmlFor={`f-f-${i}`} required><Input id={`f-f-${i}`} value={f.departureAirport} onChange={(e) => upd(flights, setFlights, i, { departureAirport: e.target.value })} /></Field>
                <Field label="To" htmlFor={`f-t-${i}`} required><Input id={`f-t-${i}`} value={f.arrivalAirport} onChange={(e) => upd(flights, setFlights, i, { arrivalAirport: e.target.value })} /></Field>
                <Field label="Departs" htmlFor={`f-dep-${i}`} required><Input id={`f-dep-${i}`} type="datetime-local" value={f.departureAt} onChange={(e) => upd(flights, setFlights, i, { departureAt: e.target.value })} /></Field>
                <Field label="Arrives" htmlFor={`f-arr-${i}`}><Input id={`f-arr-${i}`} type="datetime-local" value={f.arrivalAt} onChange={(e) => upd(flights, setFlights, i, { arrivalAt: e.target.value })} /></Field>
                <Field label="Booking reference" htmlFor={`f-r-${i}`}><Input id={`f-r-${i}`} value={f.bookingReference} onChange={(e) => upd(flights, setFlights, i, { bookingReference: e.target.value })} /></Field>
                <div className="flex items-end justify-end"><Button variant="ghost" className="text-red-700" onClick={() => rm(flights, setFlights, i)}>Remove</Button></div>
              </div>))}</div></section>

          <section><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Hotel</h3><Button variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => setHotels([...hotels, { name: '', address: '', phone: '', checkInDate: '', checkOutDate: '', bookingReference: '', roomInfo: '' }])}><Icon name="plus" className="size-4" />Add stay</Button></div>
            <div className="space-y-3">{hotels.map((h, i) => (
              <div key={i} className="grid gap-3 rounded-lg border border-ink-200 p-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field label="Hotel name" htmlFor={`h-n-${i}`} required><Input id={`h-n-${i}`} value={h.name} onChange={(e) => upd(hotels, setHotels, i, { name: e.target.value })} /></Field></div>
                <Field label="Check-in" htmlFor={`h-i-${i}`} required><Input id={`h-i-${i}`} type="date" value={h.checkInDate} onChange={(e) => upd(hotels, setHotels, i, { checkInDate: e.target.value })} /></Field>
                <Field label="Check-out" htmlFor={`h-o-${i}`}><Input id={`h-o-${i}`} type="date" value={h.checkOutDate} onChange={(e) => upd(hotels, setHotels, i, { checkOutDate: e.target.value })} /></Field>
                <Field label="Address" htmlFor={`h-a-${i}`}><Input id={`h-a-${i}`} value={h.address} onChange={(e) => upd(hotels, setHotels, i, { address: e.target.value })} /></Field>
                <Field label="Phone" htmlFor={`h-p-${i}`}><Input id={`h-p-${i}`} type="tel" value={h.phone} onChange={(e) => upd(hotels, setHotels, i, { phone: e.target.value })} /></Field>
                <Field label="Room" htmlFor={`h-r-${i}`}><Input id={`h-r-${i}`} value={h.roomInfo} onChange={(e) => upd(hotels, setHotels, i, { roomInfo: e.target.value })} /></Field>
                <Field label="Booking reference" htmlFor={`h-b-${i}`}><Input id={`h-b-${i}`} value={h.bookingReference} onChange={(e) => upd(hotels, setHotels, i, { bookingReference: e.target.value })} /></Field>
                <div className="flex justify-end sm:col-span-2"><Button variant="ghost" className="text-red-700" onClick={() => rm(hotels, setHotels, i)}>Remove</Button></div>
              </div>))}</div></section>

          <section><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Transport</h3><Button variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => setTransports([...transports, { type: 'AIRPORT_PICKUP', pickupLocation: '', dropLocation: '', scheduledAt: '', driverName: '', driverPhone: '', vehicleInfo: '' }])}><Icon name="plus" className="size-4" />Add transfer</Button></div>
            <div className="space-y-3">{transports.map((x, i) => (
              <div key={i} className="grid gap-3 rounded-lg border border-ink-200 p-3 sm:grid-cols-2">
                <Field label="Type" htmlFor={`x-t-${i}`}><Select id={`x-t-${i}`} value={x.type} onChange={(e) => upd(transports, setTransports, i, { type: e.target.value })}>{Object.entries(TRANSPORT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
                <Field label="When" htmlFor={`x-w-${i}`}><Input id={`x-w-${i}`} type="datetime-local" value={x.scheduledAt} onChange={(e) => upd(transports, setTransports, i, { scheduledAt: e.target.value })} /></Field>
                <Field label="Pick-up" htmlFor={`x-p-${i}`}><Input id={`x-p-${i}`} value={x.pickupLocation} onChange={(e) => upd(transports, setTransports, i, { pickupLocation: e.target.value })} /></Field>
                <Field label="Drop-off" htmlFor={`x-d-${i}`}><Input id={`x-d-${i}`} value={x.dropLocation} onChange={(e) => upd(transports, setTransports, i, { dropLocation: e.target.value })} /></Field>
                <Field label="Driver" htmlFor={`x-n-${i}`}><Input id={`x-n-${i}`} value={x.driverName} onChange={(e) => upd(transports, setTransports, i, { driverName: e.target.value })} /></Field>
                <Field label="Driver phone" htmlFor={`x-h-${i}`}><Input id={`x-h-${i}`} type="tel" value={x.driverPhone} onChange={(e) => upd(transports, setTransports, i, { driverPhone: e.target.value })} /></Field>
                <div className="flex justify-end sm:col-span-2"><Button variant="ghost" className="text-red-700" onClick={() => rm(transports, setTransports, i)}>Remove</Button></div>
              </div>))}</div></section>
        </div>
      )}
    </Drawer>
  );
}

export function TravelScreen() {
  const { can } = usePermissions();
  const [page, setPage] = useState(1);
  const [view, setView] = useState<TravelRow | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const list = useList<TravelRow>(['travels'], `/travel?page=${page}&pageSize=12`);
  const columns: Column<TravelRow>[] = [
    { key: 'patient', header: 'Patient', primary: true, cell: (t) => <div><p className="font-semibold">{t.patient?.fullName}</p><p className="font-mono text-xs font-normal text-ink-500">{t.case.caseNumber}</p></div> },
    { key: 'hospital', header: 'Hospital', cell: (t) => t.case.hospital ?? <span className="text-ink-400">Not chosen</span> },
    { key: 'trip', header: 'Trip', cell: (t) => `${t.flights.length} flights · ${t.hotels.length} stays` },
    { key: 'next', header: 'Next milestone', cell: (t) => t.nextMilestone ? <span>{fmtDateTime(t.nextMilestone)}</span> : <span className="text-ink-400">None ahead</span> },
    { key: 'upd', header: 'Updated', cell: (t) => <span className="text-ink-600">{relTime(t.updatedAt)}</span> },
  ];
  return (
    <>
      <PageHeader title="Travel plans" subtitle="Flights, hotels and airport transfers for patients travelling for treatment" />
      <Panel pad={false}>
        <DataTable rows={list.data?.items} loading={list.isLoading} columns={columns} rowKey={(t) => t.id} caption="Travel plans" onRowClick={setView} empty={<p className="py-8 text-center text-sm text-ink-600">No travel plans yet. Create one from a case.</p>} />
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Panel>
      <Drawer open={!!view} onClose={() => setView(null)} title={view ? `Travel · ${view.patient?.fullName ?? view.case.caseNumber}` : 'Travel'} wide footer={view && can('travel.edit') ? <Button onClick={() => { setEdit(view.caseId); setView(null); }}>Edit plan</Button> : undefined}>{view && <TravelSummary t={view} />}</Drawer>
      {edit && <TravelEditor caseId={edit} open onClose={() => setEdit(null)} />}
    </>
  );
}
