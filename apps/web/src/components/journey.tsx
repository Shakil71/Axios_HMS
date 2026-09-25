import { CASE_STATUS_ORDER, JOURNEY_STEPS, fmtDateTime } from '@/lib/labels';
import type { TimelineEvent } from '@/lib/types';
import { cx } from './ui';

/** Visual "Treatment Journey": completed, current and upcoming steps. */
export function JourneyStepper({ status }: { status: string }) {
  const current = status === 'CANCELLED' ? -1 : CASE_STATUS_ORDER.indexOf(status);
  const complete = status === 'COMPLETED';
  return (
    <ol className="grid gap-x-4 gap-y-1 sm:grid-cols-2" aria-label="Your treatment journey">
      {JOURNEY_STEPS.map((s, i) => {
        const done = complete || i < current;
        const now = !complete && i === current;
        return (
          <li key={s.status} aria-current={now ? 'step' : undefined} className="flex items-center gap-3 py-1.5">
            <span
              aria-hidden="true"
              className={cx('flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold', done ? 'border-brand-700 bg-brand-700 text-white' : now ? 'border-brand-700 bg-white text-brand-700 ring-4 ring-brand-100' : 'border-ink-300 bg-white text-ink-600')}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={cx('text-sm', now ? 'font-semibold text-ink-900' : done ? 'text-ink-700' : 'text-ink-500')}>
              {s.label}
              <span className="sr-only">{done ? ' (done)' : now ? ' (current step)' : ' (later)'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function TimelineList({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <p className="text-sm text-ink-600">Nothing has happened yet.</p>;
  return (
    <ol className="relative space-y-5 border-l-2 border-ink-200 pl-5">
      {[...events].reverse().map((e) => (
        <li key={e.id} className="relative">
          <span aria-hidden="true" className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-white bg-brand-600 ring-2 ring-brand-200" />
          <time dateTime={e.occurredAt} className="text-xs font-medium text-ink-500">{fmtDateTime(e.occurredAt)}</time>
          <p className="font-medium text-ink-900">{e.title}</p>
          {e.description && <p className="text-sm text-ink-600">{e.description}</p>}
        </li>
      ))}
    </ol>
  );
}
