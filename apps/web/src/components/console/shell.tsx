'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { SITE_NAME } from '@/lib/config';
import { useGet, useList } from '@/lib/hooks';
import { homeFor, roleLabel } from '@/lib/roles';
import { relTime } from '@/lib/status';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Avatar, Button, Logo, Skeleton, cx } from '../ui';
import type { IconName } from './icons';
import { Icon } from './icons';
import { NoAccess } from './kit';

export interface NavItem { href: string; label: string; icon: IconName; show?: boolean; badge?: number | null; group?: string }

// ─── toasts ───
interface Toast { id: number; tone: 'success' | 'danger' | 'info'; text: string }
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

function Toasts({ items, dismiss }: { items: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} role="status" className={cx('pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-pop', t.tone === 'danger' ? 'border-red-200 bg-red-50 text-red-900' : t.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-brand-200 bg-white text-ink-900')}>
          <span className="flex-1">{t.text}</span>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-mr-1 rounded p-0.5 text-ink-500 hover:bg-black/5"><Icon name="x" className="size-4" /></button>
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const toast = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <Toasts items={toasts} dismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </ToastCtx.Provider>
  );
}

// ─── notifications bell ───
interface Notif { id: string; type: string; title: string; body: string | null; entityType: string | null; entityId: string | null; readAt: string | null; createdAt: string }

export function Bell({ area }: { area: 'admin' | 'staff' | 'doctor' | 'patient' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const count = useGet<{ count: number }>(['notif-count'], '/notifications/unread-count', { refetchMs: 30_000 });
  const list = useList<Notif>(['notif-list'], open ? '/notifications?pageSize=8' : null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['notif-count'] }); void qc.invalidateQueries({ queryKey: ['notif-list'] }); void qc.invalidateQueries({ queryKey: ['notifications'] }); };
  const n = count.data?.count ?? 0;
  const go = async (x: Notif) => {
    if (!x.readAt) await api(`/notifications/${x.id}/read`, { method: 'POST' }).catch(() => undefined);
    refresh();
    setOpen(false);
    if (x.entityType === 'MedicalCase' && x.entityId) router.push(area === 'patient' ? `/patient/cases/${x.entityId}` : `/${area}/cases/${x.entityId}`);
    else router.push(`/${area}/notifications`);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} aria-haspopup="true" aria-expanded={open} aria-label={n ? `Notifications, ${n} unread` : 'Notifications'} className="relative flex size-11 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100">
        <Icon name="bell" className="size-5" />
        {n > 0 && <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">{n > 9 ? '9+' : n}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="fixed inset-x-3 top-16 z-50 max-h-[70vh] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <p className="font-semibold">Notifications</p>
            {n > 0 && <button className="text-sm font-medium text-brand-700 hover:underline" onClick={async () => { await api('/notifications/read-all', { method: 'POST' }); refresh(); }}>Mark all read</button>}
          </div>
          <ul className="max-h-[50vh] divide-y divide-ink-100 overflow-y-auto">
            {list.isLoading && <li className="p-4"><Skeleton className="h-10" /></li>}
            {list.data?.items.length === 0 && <li className="p-6 text-center text-sm text-ink-600">You are all caught up.</li>}
            {list.data?.items.map((x) => (
              <li key={x.id}>
                <button onClick={() => go(x)} className={cx('flex w-full gap-3 px-4 py-3 text-left hover:bg-ink-50', !x.readAt && 'bg-brand-50/60')}>
                  <span aria-hidden="true" className={cx('mt-1.5 size-2 shrink-0 rounded-full', x.readAt ? 'bg-transparent' : 'bg-brand-600')} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink-900">{x.title}</span>{x.body && <span className="block truncate text-xs text-ink-600">{x.body}</span>}<span className="text-xs text-ink-500">{relTime(x.createdAt)}</span></span>
                </button>
              </li>
            ))}
          </ul>
          <Link href={`/${area}/notifications`} onClick={() => setOpen(false)} className="block border-t border-ink-100 px-4 py-3 text-center text-sm font-semibold">See all notifications</Link>
        </div>
      )}
    </div>
  );
}

// ─── the shell ───
export function ConsoleShell({ area, title, nav, children, allow }: { area: 'admin' | 'staff' | 'doctor'; title: string; nav: NavItem[]; children: ReactNode; allow: (roles: string[]) => boolean }) {
  const { state, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  const ctx = useMemo(() => toast, [toast]);

  useEffect(() => { setDrawer(false); }, [path]);
  useEffect(() => { if (state.status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(path)}`); }, [state.status, path, router]);
  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawer]);

  if (state.status !== 'authenticated') {
    return <div className="p-6" aria-busy="true"><span className="sr-only">Loading your workspace</span><Skeleton className="mb-4 h-10 w-60" /><Skeleton className="h-64" /></div>;
  }
  const me = state.user;
  if (!allow(me.roles)) {
    return (
      <div className="mx-auto max-w-lg p-6 pt-20">
        <Alert tone="warning" title="This area is not part of your account">You are signed in as {roleLabel(me.roles[0] ?? 'PATIENT')}. Your workspace is somewhere else.</Alert>
        <div className="mt-4 flex gap-3"><Link href={homeFor(me.roles)} className="inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white">Go to my workspace</Link><Button variant="secondary" onClick={logout}>Sign out</Button></div>
      </div>
    );
  }

  const items = nav.filter((n) => n.show !== false);
  const blocked = nav.find((n) => n.show === false && (path === n.href || path.startsWith(n.href + '/')));
  const active = (href: string) => path === href || (href !== `/${area}` && path.startsWith(href));
  const groups = [...new Set(items.map((i) => i.group ?? ''))];

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav aria-label={`${title} navigation`} className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g}>
          {g && <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{g}</p>}
          <ul className="space-y-0.5">
            {items.filter((i) => (i.group ?? '') === g).map((i) => (
              <li key={i.href}>
                <Link href={i.href} onClick={onNavigate} aria-current={active(i.href) ? 'page' : undefined} className={cx('flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium', active(i.href) ? 'bg-brand-700 text-white' : 'text-ink-200 hover:bg-white/10 hover:text-white')}>
                  <Icon name={i.icon} className="size-5 shrink-0" />
                  <span className="flex-1 truncate">{i.label}</span>
                  {i.badge ? <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold', active(i.href) ? 'bg-white/20 text-white' : 'bg-red-600 text-white')}>{i.badge}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const Brand = () => (
    <Link href={`/${area}`} className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/10 px-5 text-white">
      <Logo size={30} />
      <span className="min-w-0"><span className="block truncate text-sm font-bold leading-tight">{SITE_NAME}</span><span className="block text-[11px] uppercase tracking-wider text-ink-400">{title}</span></span>
    </Link>
  );

  return (
    <ToastCtx.Provider value={ctx}>
      <div className="min-h-dvh bg-ink-50 lg:pl-64">
        {/* desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-ink-900 lg:flex"><Brand /><NavList /><UserCard me={me} logout={logout} /></aside>

        {/* mobile drawer */}
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-ink-900 shadow-pop"><Brand /><NavList onNavigate={() => setDrawer(false)} /><UserCard me={me} logout={logout} /></aside>
          </div>
        )}

        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-ink-200 bg-white/95 px-3 backdrop-blur sm:px-6">
          <button onClick={() => setDrawer(true)} aria-label="Open menu" className="flex size-11 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100 lg:hidden"><Icon name="menu" className="size-6" /></button>
          <Breadcrumb area={area} title={title} items={items} path={path} />
          <div className="ml-auto flex items-center gap-1">
            <GlobalSearch area={area} />
            <Bell area={area} />
            <Link href="/" className="hidden h-11 items-center rounded-lg px-3 text-sm font-medium text-ink-700 hover:bg-ink-100 md:flex">View website</Link>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[90rem] px-3 py-5 pb-24 sm:px-6 sm:py-7 lg:pb-10">{blocked ? <NoAccess what={blocked.label} /> : children}</main>
        <Toasts items={toasts} dismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      </div>
    </ToastCtx.Provider>
  );
}

function UserCard({ me, logout }: { me: { fullName: string; email: string; roles: string[] }; logout: () => void }) {
  return (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <Avatar name={me.fullName} size={36} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{me.fullName}</p><p className="truncate text-xs text-ink-400">{roleLabel(me.roles[0] ?? '')}</p></div>
      </div>
      <button onClick={logout} className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-ink-200 hover:bg-white/10 hover:text-white"><Icon name="logout" className="size-5" />Sign out</button>
    </div>
  );
}

function Breadcrumb({ area, title, items, path }: { area: string; title: string; items: NavItem[]; path: string }) {
  const home = `/${area}`;
  const current = [...items].filter((i) => i.href !== home).sort((a, b) => b.href.length - a.href.length).find((i) => path === i.href || path.startsWith(i.href + '/'));
  const seg = path.split('/')[2];
  const label = current?.label ?? (seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : null);
  const onHome = path === home;
  const isDetail = !!current && path !== current.href;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1 text-sm">
      <ol className="flex items-center gap-1.5 truncate">
        <li className="hidden text-ink-500 sm:block"><Link href={home} className="hover:text-brand-700">{title}</Link></li>
        {onHome && <li className="truncate font-semibold text-ink-900">Overview</li>}
        {!onHome && label && <><li aria-hidden="true" className="hidden text-ink-300 sm:block">/</li><li className={cx('truncate', isDetail ? 'font-medium text-ink-600' : 'font-semibold text-ink-900')}>{isDetail ? <Link href={current.href}>{label}</Link> : label}</li></>}
        {isDetail && <><li aria-hidden="true" className="text-ink-300">/</li><li className="font-semibold text-ink-900">Details</li></>}
      </ol>
    </nav>
  );
}

function GlobalSearch({ area }: { area: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); } if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const target = area === 'doctor' ? '/doctor/patients' : `/${area}/cases`;
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (q.trim()) router.push(`${target}?q=${encodeURIComponent(q.trim())}`); setOpen(false); setQ(''); };
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Search cases and patients" className="flex size-11 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100 sm:hidden"><Icon name="search" className="size-5" /></button>
      <button onClick={() => setOpen(true)} className="hidden h-11 w-56 items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 text-sm text-ink-500 hover:border-ink-300 sm:flex lg:w-72"><Icon name="search" className="size-4" />Search cases, patients…<kbd className="ml-auto rounded border border-ink-300 bg-white px-1.5 text-[10px] font-semibold">Ctrl K</kbd></button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-20" role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form onSubmit={submit} className="w-full max-w-lg rounded-xl bg-white p-3 shadow-pop">
            <label htmlFor="global-search" className="sr-only">Search cases and patients</label>
            <input id="global-search" ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Case number or patient name" className="block min-h-12 w-full rounded-lg border border-ink-300 px-4 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200" />
            <p className="mt-2 px-1 text-xs text-ink-500">Press Enter to search. Only records you may access are shown.</p>
          </form>
        </div>
      )}
    </>
  );
}
