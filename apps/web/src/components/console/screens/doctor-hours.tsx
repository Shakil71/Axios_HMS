'use client';

import { useState } from 'react';
import { Alert, Button, Input, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Slot } from '@/lib/console-types';
import { errorText, useAction, useGet } from '@/lib/hooks';
import { DAY_SHORT, inBangladeshTime, scheduleRows } from '@/lib/schedule';
import { METHOD } from '@/lib/status';
import { Icon } from '../icons';
import { useToast } from '../shell';
import { ErrorNote, PageHeader, Panel, Skeleton } from '../kit';

const ZONES = ['Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Dubai', 'Asia/Seoul', 'Europe/Istanbul', 'Europe/London', 'Europe/Berlin'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // week starts on Monday

export function DoctorHoursScreen() {
  const toast = useToast();
  const q = useGet<Slot[]>(['doctor-hours'], '/workspace/doctor/availability');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cur = slots ?? q.data ?? [];
  const dirty = slots !== null;
  const defaultZone = cur[0]?.timezone ?? 'Asia/Kolkata';

  const save = useAction(() => api<Slot[]>('/workspace/doctor/availability', { method: 'PUT', body: { availability: cur.map(({ dayOfWeek, startTime, endTime, timezone, method, notes }) => ({ dayOfWeek, startTime, endTime, timezone, method, notes: notes || null })) } }), {
    invalidate: [['doctor-hours'], ['workspace']], onSuccess: () => { toast('Consultation hours saved. Your public profile is updated.'); setSlots(null); }, onError: (e) => setError(errorText(e)),
  });
  const upd = (i: number, p: Partial<Slot>) => setSlots(cur.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const add = (day: number) => setSlots([...cur, { dayOfWeek: day, startTime: '10:00', endTime: '13:00', timezone: defaultZone, method: 'VIDEO' }]);
  const problem = cur.find((s) => s.startTime >= s.endTime);
  const preview = scheduleRows(cur.map((s) => ({ ...s, id: s.id ?? `${s.dayOfWeek}${s.startTime}` })));

  if (q.isLoading) return <Skeleton className="h-72" />;
  if (q.isError) return <ErrorNote error={q.error} retry={() => q.refetch()} />;

  return (
    <>
      <PageHeader title="Consultation hours" subtitle="When patients can be booked with you. Times are in your hospital’s time zone and shown to patients in Bangladesh time too." />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
          {ORDER.map((day) => {
            const rows = cur.map((s, i) => ({ s, i })).filter(({ s }) => s.dayOfWeek === day);
            return (
              <Panel key={day} title={DAYS_FULL[day]} action={<Button variant="ghost" className="min-h-9 px-2.5 py-1" onClick={() => add(day)}><Icon name="plus" className="size-4" />Add hours</Button>}>
                {rows.length === 0 ? <p className="text-sm text-ink-500">Not available.</p> : (
                  <ul className="space-y-3">{rows.map(({ s, i }) => {
                    const bd = inBangladeshTime(s);
                    return (
                      <li key={i} className="grid gap-2 rounded-lg border border-ink-200 p-3 sm:grid-cols-[repeat(2,7rem)_1fr_1fr_auto] sm:items-end">
                        <div><label htmlFor={`s-a-${i}`} className="mb-1 block text-xs font-medium text-ink-600">From</label><Input id={`s-a-${i}`} type="time" className="min-h-10" value={s.startTime} onChange={(e) => upd(i, { startTime: e.target.value })} /></div>
                        <div><label htmlFor={`s-b-${i}`} className="mb-1 block text-xs font-medium text-ink-600">To</label><Input id={`s-b-${i}`} type="time" className="min-h-10" value={s.endTime} onChange={(e) => upd(i, { endTime: e.target.value })} /></div>
                        <div><label htmlFor={`s-m-${i}`} className="mb-1 block text-xs font-medium text-ink-600">Type</label><Select id={`s-m-${i}`} className="min-h-10 py-1.5 text-sm" value={s.method} onChange={(e) => upd(i, { method: e.target.value as Slot['method'] })}>{Object.entries(METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>
                        <div><label htmlFor={`s-z-${i}`} className="mb-1 block text-xs font-medium text-ink-600">Time zone</label><Select id={`s-z-${i}`} className="min-h-10 py-1.5 text-sm" value={s.timezone} onChange={(e) => upd(i, { timezone: e.target.value })}>{[...new Set([s.timezone, ...ZONES])].map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</Select></div>
                        <button onClick={() => setSlots(cur.filter((_, j) => j !== i))} aria-label={`Remove ${DAY_SHORT[day]} hours ${s.startTime} to ${s.endTime}`} className="flex size-10 items-center justify-center rounded-lg text-red-700 hover:bg-red-50"><Icon name="x" className="size-5" /></button>
                        <p className="text-xs text-ink-500 sm:col-span-5">{s.startTime < s.endTime ? <>Patients in Bangladesh see <strong>{bd.startTime}–{bd.endTime}</strong>{bd.dayOfWeek !== s.dayOfWeek ? ` (${DAY_SHORT[bd.dayOfWeek]})` : ''}.</> : <span className="font-medium text-red-700">The end time must be after the start time.</span>}</p>
                      </li>
                    );
                  })}</ul>
                )}
              </Panel>
            );
          })}
        </div>

        <div className="space-y-5 xl:sticky xl:top-20 xl:self-start">
          <Panel title="How patients see it">
            {preview.length === 0 ? <p className="text-sm text-ink-600">No hours set. Patients will be told your coordinator arranges the time.</p> : (
              <ul className="space-y-3">{preview.map((r) => <li key={r.days + r.local + r.method} className="text-sm"><p className="font-semibold">{r.days}</p><p className="text-ink-700">{r.local} <span className="text-ink-500">({r.place})</span></p><p className="text-xs text-ink-500">{r.bangladesh} Bangladesh time · {r.method}</p></li>)}</ul>
            )}
          </Panel>
          <Alert tone="info">Hours are guidance, not bookings. The coordination team confirms each appointment with the patient.</Alert>
        </div>
      </div>

      {dirty && (
        <div className="sticky bottom-20 z-20 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-white p-3 shadow-pop lg:bottom-4">
          <p className="text-sm">{problem ? 'Fix the highlighted hours to save.' : 'You have unsaved changes.'}</p>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => { setSlots(null); setError(null); }}>Discard</Button><Button disabled={save.isPending || !!problem} onClick={() => { setError(null); save.mutate(undefined); }}>{save.isPending ? 'Saving…' : 'Save hours'}</Button></div>
        </div>
      )}
    </>
  );
}
