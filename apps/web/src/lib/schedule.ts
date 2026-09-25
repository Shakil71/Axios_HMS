export interface Slot {
  id: string;
  dayOfWeek: number; // 0 = Sunday
  startTime: string; // HH:MM
  endTime: string;
  timezone: string; // IANA, the doctor's hospital time
  method: 'IN_PERSON' | 'VIDEO' | 'PHONE';
  notes: string | null;
}

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const METHOD_LABEL: Record<Slot['method'], string> = { VIDEO: 'Online (video)', IN_PERSON: 'In person at the hospital', PHONE: 'Phone' };
const BD_TZ = 'Asia/Dhaka';

/** Minutes east of UTC for a timezone right now (handles half-hour zones such as India). */
function offsetMinutes(timeZone: string): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmt = (min: number) => {
  const n = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};

/** The same slot expressed in Bangladesh time (day can shift for far-away timezones). */
export function inBangladeshTime(slot: Pick<Slot, 'dayOfWeek' | 'startTime' | 'endTime' | 'timezone'>) {
  const diff = offsetMinutes(BD_TZ) - offsetMinutes(slot.timezone);
  const start = toMinutes(slot.startTime) + diff;
  const dayShift = Math.floor(start / 1440);
  return { dayOfWeek: (slot.dayOfWeek + dayShift + 7) % 7, startTime: fmt(start), endTime: fmt(toMinutes(slot.endTime) + diff) };
}

const dayRange = (days: number[]) => {
  const sorted = [...days].sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const d of sorted) (runs.at(-1)?.at(-1) === d - 1 ? runs.at(-1)! : runs[runs.push([]) - 1]).push(d);
  return runs.map((r) => (r.length >= 3 ? `${DAY_SHORT[r[0]]}–${DAY_SHORT[r.at(-1)!]}` : r.map((d) => DAY_SHORT[d]).join(', '))).join(', ');
};

export interface ScheduleRow { days: string; local: string; bangladesh: string; place: string; method: string; notes: string | null }

/** Groups identical time windows across weekdays into readable rows, e.g. "Mon–Wed · 10:00–13:00 · Online". */
export function scheduleRows(slots: Slot[]): ScheduleRow[] {
  const groups = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = [s.startTime, s.endTime, s.timezone, s.method, s.notes ?? ''].join('|');
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.values()]
    .map((g) => {
      const s = g[0];
      const bd = inBangladeshTime(s);
      const sameDay = bd.dayOfWeek === s.dayOfWeek;
      return {
        days: dayRange(g.map((x) => x.dayOfWeek)),
        local: `${s.startTime}–${s.endTime}`,
        bangladesh: `${bd.startTime}–${bd.endTime}${sameDay ? '' : ` (${DAY_SHORT[bd.dayOfWeek]})`}`,
        place: (s.timezone.split('/')[1] ?? s.timezone).replace(/_/g, ' '),
        method: METHOD_LABEL[s.method],
        notes: s.notes,
        first: Math.min(...g.map((x) => x.dayOfWeek)),
      };
    })
    .sort((a, b) => a.first - b.first)
    .map(({ first: _f, ...row }) => row);
}
