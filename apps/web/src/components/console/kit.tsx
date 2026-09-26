'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Tone } from '@/lib/labels';
import { Badge, Button, Card, EmptyState, Skeleton, cx } from '../ui';
import { Icon, type IconName } from './icons';

// ─── page layout ───
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0"><h1 className="text-xl font-bold sm:text-2xl">{title}</h1>{subtitle && <p className="mt-0.5 text-sm text-ink-600">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className, pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('min-w-0 rounded-xl border border-ink-200 bg-white shadow-card', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-600">{title}</h2>
          {action}
        </header>
      )}
      <div className={pad ? 'p-4 sm:p-5' : ''}>{children}</div>
    </section>
  );
}

// ─── KPI tiles ───
const KPI_TONE: Record<Tone, string> = { neutral: 'bg-ink-100 text-ink-700', info: 'bg-brand-50 text-brand-700', success: 'bg-emerald-50 text-emerald-700', warning: 'bg-amber-50 text-amber-800', danger: 'bg-red-50 text-red-700' };
export function Kpi({ label, value, hint, icon, tone = 'info', href, loading }: { label: string; value: ReactNode; hint?: ReactNode; icon: IconName; tone?: Tone; href?: string; loading?: boolean }) {
  const body = (
    <div className={cx('flex h-full items-start gap-3 rounded-xl border border-ink-200 bg-white p-4 shadow-card', href && 'transition-shadow hover:shadow-pop')}>
      <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-lg', KPI_TONE[tone])}><Icon name={icon} className="size-5" /></span>
      <div className="min-w-0"><p className="truncate text-xs font-medium text-ink-600">{label}</p>{loading ? <Skeleton className="mt-1 h-7 w-16" /> : <p className="text-2xl font-bold leading-tight text-ink-900">{value}</p>}{hint && <p className="mt-0.5 truncate text-xs text-ink-500">{hint}</p>}</div>
    </div>
  );
  return href ? <Link href={href} className="block focus-visible:rounded-xl">{body}</Link> : body;
}

// ─── charts (inline SVG) ───
export function AreaChart({ data, height = 160, label }: { data: { label: string; value: number }[]; height?: number; label: string }) {
  const id = useId();
  if (!data.length) return <p className="py-8 text-center text-sm text-ink-500">No data yet.</p>;
  const w = 600;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = w / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => [i * step, height - 18 - (d.value / max) * (height - 34)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full" role="img" aria-label={`${label}: ${total} in total, highest ${max}`} preserveAspectRatio="none">
        <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#1f93a8" stopOpacity="0.28" /><stop offset="100%" stopColor="#1f93a8" stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={w} y1={(height - 18) * f} y2={(height - 18) * f} stroke="#eceff3" strokeWidth="1" />)}
        <path d={`${line} L${w},${height - 18} L0,${height - 18} Z`} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke="#16778c" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {pts.map(([x, y], i) => data[i].value > 0 && i % Math.ceil(data.length / 30) === 0 ? <circle key={i} cx={x} cy={y} r="2.6" fill="#16778c" vectorEffect="non-scaling-stroke" /> : null)}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-ink-500"><span>{data[0].label}</span><span>{data[data.length - 1].label}</span></figcaption>
    </figure>
  );
}

export function BarList({ data, format, colorClass = 'bg-brand-600', empty = 'No data yet.' }: { data: { label: string; value: number; sub?: string }[]; format?: (n: number) => string; colorClass?: string; empty?: string }) {
  if (!data.length) return <p className="py-6 text-center text-sm text-ink-500">{empty}</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 truncate font-medium text-ink-800">{d.label}</span><span className="shrink-0 tabular-nums text-ink-600">{format ? format(d.value) : d.value}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100" role="presentation"><div className={cx('h-full rounded-full', colorClass)} style={{ width: `${Math.max(3, (d.value / max) * 100)}%` }} /></div>
          {d.sub && <p className="mt-0.5 text-xs text-ink-500">{d.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

export function Columns({ data, height = 140, format }: { data: { label: string; value: number }[]; height?: number; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="py-6 text-center text-sm text-ink-500">No data yet.</p>;
  return (
    <div className="flex items-end gap-2" style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${format ? format(d.value) : d.value}`).join(', ')}>
      {data.map((d) => (
        <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[11px] font-medium tabular-nums text-ink-600">{format ? format(d.value) : d.value}</span>
          <div className="w-full max-w-10 rounded-t-md bg-brand-600" style={{ height: `${Math.max(4, (d.value / max) * (height - 42))}px` }} />
          <span className="text-[11px] text-ink-500">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Stacked horizontal bar with a legend: parts of a whole (e.g. cases by status). */
export function Distribution({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="py-6 text-center text-sm text-ink-500">Nothing here yet.</p>;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-ink-100" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
        {parts.filter((p) => p.value > 0).map((p) => <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} title={`${p.label}: ${p.value}`} />)}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        {parts.filter((p) => p.value > 0).map((p) => <li key={p.label} className="flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} /><span className="truncate text-ink-700">{p.label}</span><span className="ml-auto tabular-nums font-semibold text-ink-900">{p.value}</span></li>)}
      </ul>
    </div>
  );
}
export const PALETTE = ['#16778c', '#3fb0c2', '#7accd8', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#64748b', '#0ea5e9', '#f97316', '#84cc16', '#ec4899', '#14b8a6', '#a855f7', '#475569'];

// ─── data table (cards on phones) ───
export interface Column<T> { key: string; header: string; cell: (row: T) => ReactNode; className?: string; hideOnMobile?: boolean; primary?: boolean; align?: 'right' }

export function DataTable<T>({ rows, columns, rowKey, onRowClick, loading, empty, caption }: { rows: T[] | undefined; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; loading?: boolean; empty?: ReactNode; caption: string }) {
  if (loading && !rows) return <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>;
  if (!rows?.length) return <div className="p-4">{empty ?? <EmptyState title="Nothing to show">Try changing the filters.</EmptyState>}</div>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  return (
    <>
      {/* phones: one card per row */}
      <ul className="divide-y divide-ink-100 md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)}>
            <div role={onRowClick ? 'button' : undefined} tabIndex={onRowClick ? 0 : undefined} onClick={() => onRowClick?.(r)} onKeyDown={(e) => onRowClick && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(r))} className={cx('space-y-2 px-4 py-3', onRowClick && 'cursor-pointer active:bg-ink-50')}>
              <div className="font-semibold text-ink-900">{primary.cell(r)}</div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {columns.filter((c) => c !== primary && !c.hideOnMobile).map((c) => <div key={c.key} className="min-w-0"><dt className="text-xs text-ink-500">{c.header}</dt><dd className="truncate text-ink-800">{c.cell(r)}</dd></div>)}
              </dl>
            </div>
          </li>
        ))}
      </ul>
      {/* tablets and up: a real table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead><tr className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-600">{columns.map((c) => <th key={c.key} scope="col" className={cx('px-4 py-2.5 font-semibold', c.align === 'right' && 'text-right', c.className)}>{c.header}</th>)}</tr></thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={rowKey(r)} onClick={() => onRowClick?.(r)} className={cx(onRowClick && 'cursor-pointer hover:bg-ink-50')}>
                {columns.map((c, i) => <td key={c.key} className={cx('px-4 py-3 align-middle text-ink-800', c.align === 'right' && 'text-right tabular-nums', c.className)}>{onRowClick && i === 0 ? <button type="button" onClick={(e) => { e.stopPropagation(); onRowClick(r); }} className="block w-full rounded text-left">{c.cell(r)}</button> : c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Pager({ meta, onPage }: { meta?: { page: number; pageSize: number; total: number }; onPage: (p: number) => void }) {
  if (!meta || meta.total <= meta.pageSize) return meta ? <p className="border-t border-ink-100 px-4 py-2.5 text-xs text-ink-500">{meta.total} {meta.total === 1 ? 'result' : 'results'}</p> : null;
  const pages = Math.ceil(meta.total / meta.pageSize);
  const from = (meta.page - 1) * meta.pageSize + 1;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-ink-100 px-4 py-2.5 text-sm">
      <p className="text-xs text-ink-600 sm:text-sm">{from}–{Math.min(meta.total, from + meta.pageSize - 1)} of {meta.total}</p>
      <div className="flex gap-2">
        <Button variant="secondary" className="min-h-9 px-3 py-1.5" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Previous</Button>
        <Button variant="secondary" className="min-h-9 px-3 py-1.5" disabled={meta.page >= pages} onClick={() => onPage(meta.page + 1)}>Next</Button>
      </div>
    </nav>
  );
}

// ─── filters ───
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3 border-b border-ink-100 p-4" role="search">{children}</div>;
}
export function FilterSelect({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-600">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="block min-h-10 w-full rounded-lg border border-ink-300 bg-white px-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200">
        <option value="">All</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
export function SearchBox({ value, onChange, placeholder = 'Search…', label = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  const id = useId();
  return (
    <div className="min-w-48 flex-1">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-600">{label}</label>
      <div className="relative"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" /><input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="block min-h-10 w-full rounded-lg border border-ink-300 bg-white pl-9 pr-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200" /></div>
    </div>
  );
}

// ─── tabs ───
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto border-b border-ink-200 px-1">
      {tabs.map((t) => (
        <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={value === t.id} aria-controls={`panel-${t.id}`} onClick={() => onChange(t.id)} className={cx('flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium', value === t.id ? 'border-brand-700 text-brand-800' : 'border-transparent text-ink-600 hover:text-ink-900')}>
          {t.label}{t.count !== undefined && <span className="rounded-full bg-ink-100 px-2 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── modal & side drawer ───
export function Drawer({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} tabIndex={-1} />
      <div ref={ref} tabIndex={-1} className={cx('absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-2xl bg-white shadow-pop outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:rounded-none sm:rounded-l-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <header className="flex items-center justify-between border-b border-ink-100 px-5 py-4"><h2 className="text-lg font-semibold">{title}</h2><button onClick={onClose} aria-label="Close" className="flex size-10 items-center justify-center rounded-lg hover:bg-ink-100"><Icon name="x" className="size-5" /></button></header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-ink-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }: { open: boolean; title: string; children: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Drawer open={open} onClose={onCancel} title={title} footer={<><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</Button></>}>
      <div className="text-sm text-ink-700">{children}</div>
    </Drawer>
  );
}

// ─── small pieces ───
export function StatusBadge({ e }: { e: { label: string; tone: Tone } }) {
  return <Badge tone={e.tone}>{e.label}</Badge>;
}

export function PriorityDot({ p }: { p: string }) {
  const c = p === 'URGENT' ? 'bg-red-600' : p === 'HIGH' ? 'bg-amber-500' : 'bg-ink-300';
  return <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={cx('size-2 rounded-full', c)} />{p.charAt(0) + p.slice(1).toLowerCase()}</span>;
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{items.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => <div key={k}><dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{k}</dt><dd className="mt-0.5 whitespace-pre-line text-sm text-ink-900">{v}</dd></div>)}</dl>;
}

export function ErrorNote({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="font-semibold">We could not load this.</p>
      <p className="mt-0.5">{error instanceof Error ? error.message : 'Please try again.'}</p>
      {retry && <button onClick={retry} className="mt-2 font-semibold underline">Try again</button>}
    </div>
  );
}

export { Card, Skeleton };

export function NoAccess({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-ink-100 text-ink-600"><Icon name="lock" className="size-6" /></span>
      <h1 className="mt-4 text-xl font-bold text-ink-900">{what} is not part of your role</h1>
      <p className="mt-1 text-sm text-ink-600">Your account cannot open this area. If you think it should, ask an administrator to update your access.</p>
    </div>
  );
}
