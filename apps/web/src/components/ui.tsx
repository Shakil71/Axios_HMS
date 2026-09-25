import Image from 'next/image';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import type { Tone } from '@/lib/labels';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/** Brand mark: a medical cross on the brand colour. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white">
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="currentColor">
        <path d="M9.5 3h5a1 1 0 0 1 1 1v4.5H20a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-4.5V20a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-4.5H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h4.5V4a1 1 0 0 1 1-1Z" />
      </svg>
    </span>
  );
}

// ─── buttons ───
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 min-h-11';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-card',
  secondary: 'bg-white text-ink-800 border border-ink-300 hover:bg-ink-50',
  ghost: 'text-brand-700 hover:bg-brand-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export function Button({ variant = 'primary', className, ...p }: ComponentProps<'button'> & { variant?: Variant }) {
  return <button {...p} className={cx(buttonBase, variants[variant], className)} />;
}

export function LinkButton({ variant = 'primary', className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...p} className={cx(buttonBase, variants[variant], variant === 'primary' && 'text-white', className)} />;
}

// ─── layout ───
export function Container({ className, ...p }: ComponentProps<'div'>) {
  return <div {...p} className={cx('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', className)} />;
}

export function Section({ title, subtitle, action, children, className }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('py-12 sm:py-16', className)}>
      <Container>
        {(title || action) && (
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              {title && <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>}
              {subtitle && <p className="mt-2 text-ink-600">{subtitle}</p>}
            </div>
            {action}
          </div>
        )}
        {children}
      </Container>
    </section>
  );
}

export function Card({ className, ...p }: ComponentProps<'div'>) {
  return <div {...p} className={cx('rounded-xl border border-ink-200 bg-white p-5 shadow-card', className)} />;
}

const tones: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  info: 'bg-brand-50 text-brand-800',
  success: 'bg-emerald-50 text-emerald-800',
  warning: 'bg-amber-50 text-amber-900',
  danger: 'bg-red-50 text-red-800',
};
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

export function Alert({ tone = 'info', title, children, role }: { tone?: Tone; title?: string; children?: ReactNode; role?: 'alert' | 'status' }) {
  return (
    <div role={role ?? (tone === 'danger' ? 'alert' : 'status')} className={cx('rounded-lg border px-4 py-3 text-sm', tones[tone], tone === 'danger' ? 'border-red-200' : tone === 'success' ? 'border-emerald-200' : tone === 'warning' ? 'border-amber-200' : 'border-brand-200')}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
    </div>
  );
}

export function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  const ini = name.replace(/^(dr|prof)\.?\s+/i, '').replace(/^demo\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  return (
    <span aria-hidden="true" style={{ width: size, height: size, fontSize: size / 2.6 }} className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800">
      {ini}
    </span>
  );
}

/** Doctor portrait. Local paths (sample photos) use next/image; anything else falls back to initials until media storage is wired up. */
export function DoctorPhoto({ name, photoKey, size = 64, rounded = 'full' }: { name: string; photoKey?: string | null; size?: number; rounded?: 'full' | 'xl' }) {
  const radius = rounded === 'full' ? 'rounded-full' : 'rounded-2xl';
  if (photoKey?.startsWith('/')) {
    return (
      <Image src={photoKey} alt="" width={size} height={Math.round(size * (rounded === 'full' ? 1 : 1.25))} sizes={`${size}px`} className={cx('shrink-0 bg-ink-100 object-cover object-top', radius)} style={{ width: size, height: rounded === 'full' ? size : Math.round(size * 1.25) }} />
    );
  }
  return <Avatar name={name} size={size} />;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50 px-6 py-10 text-center">
      <p className="font-semibold text-ink-800">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-ink-600">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-lg bg-ink-100', className)} />;
}

export function Breadcrumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-ink-600">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {it.href ? <Link href={it.href} className="text-ink-600 hover:text-brand-700">{it.name}</Link> : <span aria-current="page" className="text-ink-800">{it.name}</span>}
            {i < items.length - 1 && <span aria-hidden="true">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ─── form controls (labels are always real <label>s; errors are announced) ───
const control = 'block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-ink-900 placeholder:text-ink-400 min-h-11 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200';

export function Field({ label, htmlFor, error, hint, required, children }: { label: string; htmlFor: string; error?: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink-800">
        {label}
        {required && <span aria-hidden="true" className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="mt-1 text-xs text-ink-500">{hint}</p>}
      {error && <p id={`${htmlFor}-error`} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

type InputProps = ComponentProps<'input'> & { invalid?: boolean };
export function Input({ invalid, className, ...p }: InputProps) {
  return <input {...p} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${p.id}-error` : p['aria-describedby']} className={cx(control, invalid ? 'border-red-500' : 'border-ink-300', className)} />;
}
export function Textarea({ invalid, className, ...p }: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return <textarea {...p} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${p.id}-error` : undefined} className={cx(control, 'min-h-28', invalid ? 'border-red-500' : 'border-ink-300', className)} />;
}
export function Select({ invalid, className, children, ...p }: ComponentProps<'select'> & { invalid?: boolean }) {
  return (
    <select {...p} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${p.id}-error` : undefined} className={cx(control, invalid ? 'border-red-500' : 'border-ink-300', className)}>
      {children}
    </select>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-ink-600">
      <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-ink-300 border-t-brand-700" />
      {label}
    </span>
  );
}

export { cx };
