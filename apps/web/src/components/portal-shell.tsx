'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api-client';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SITE_NAME } from '@/lib/config';
import { homeFor } from '@/lib/roles';
import { Bell, ToastProvider } from './console/shell';
import { Icon, type IconName } from './console/icons';
import { Alert, Avatar, Button, Container, Logo, Skeleton, cx } from './ui';

const NAV: { href: string; label: string; icon: IconName; group?: string; mobile?: boolean }[] = [
  { href: '/patient/dashboard', label: 'Home', icon: 'home', mobile: true },
  { href: '/patient/cases', label: 'My cases', icon: 'folder', mobile: true, group: 'My treatment' },
  { href: '/patient/appointments', label: 'Appointments', icon: 'calendar', mobile: true, group: 'My treatment' },
  { href: '/patient/documents', label: 'Documents', icon: 'file', mobile: true, group: 'My treatment' },
  { href: '/patient/visa', label: 'Visa', icon: 'stamp', group: 'My treatment' },
  { href: '/patient/travel', label: 'Travel', icon: 'plane', group: 'My treatment' },
  { href: '/patient/payments', label: 'Payments', icon: 'card', group: 'My treatment' },
  { href: '/patient/family', label: 'Family', icon: 'users', group: 'Account' },
  { href: '/patient/profile', label: 'Profile', icon: 'user', group: 'Account' },
  { href: '/patient/notifications', label: 'Notifications', icon: 'bell', group: 'Account' },
];
const MOBILE = NAV.filter((n) => n.mobile);
const groups = [...new Set(NAV.map((n) => n.group ?? ''))];

const active = (path: string, href: string) => path === href || (href !== '/patient/dashboard' && path.startsWith(href));

function Gate({ children }: { children: ReactNode }) {
  const { state, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (state.status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [state.status, path, router]);
  useEffect(() => setDrawer(false), [path]);

  if (state.status !== 'authenticated') {
    return (
      <Container className="py-10">
        <div className="space-y-4" aria-busy="true" aria-live="polite"><span className="sr-only">Loading your account</span><Skeleton className="h-10 w-1/3" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      </Container>
    );
  }

  const { user } = state;
  if (!user.patientProfileId) {
    return (
      <Container className="max-w-xl py-16">
        <Alert tone="warning" title="This area is for patients">You are signed in as a member of our team. Your workspace is somewhere else.</Alert>
        <div className="mt-4 flex gap-3"><Link href={homeFor(user.roles)} className="inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white no-underline">Go to my workspace</Link><Button variant="secondary" onClick={logout}>Sign out</Button></div>
      </Container>
    );
  }

  const Nav = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav aria-label="Portal" className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g}>
          {g && <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{g}</p>}
          <ul className="space-y-0.5">{NAV.filter((n) => (n.group ?? '') === g).map((n) => (
            <li key={n.href}><Link href={n.href} onClick={onNavigate} aria-current={active(path, n.href) ? 'page' : undefined} className={cx('flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium no-underline', active(path, n.href) ? 'bg-brand-700 text-white' : 'text-ink-200 hover:bg-white/10 hover:text-white')}><Icon name={n.icon} className="size-5" />{n.label}</Link></li>
          ))}</ul>
        </div>
      ))}
    </nav>
  );
  const Brand = () => (
    <Link href="/" className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/10 px-5 text-white no-underline"><Logo size={30} /><span className="truncate text-sm font-bold">{SITE_NAME}</span></Link>
  );
  const User = () => (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-center gap-3 px-2 py-2"><Avatar name={user.fullName} size={36} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{user.fullName}</p><p className="truncate text-xs text-ink-400">Patient</p></div></div>
      <button onClick={logout} className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-ink-200 hover:bg-white/10 hover:text-white"><Icon name="logout" className="size-5" />Sign out</button>
    </div>
  );

  return (
    <div className="min-h-dvh bg-ink-50 pb-20 lg:pb-0 lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-ink-900 lg:flex"><Brand /><Nav /><User /></aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-ink-900 shadow-pop"><Brand /><Nav onNavigate={() => setDrawer(false)} /><User /></aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-ink-200 bg-white px-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-ink-900 no-underline lg:hidden"><Logo size={28} /><span className="hidden text-sm sm:inline">{SITE_NAME}</span></Link>
        <span className="hidden text-sm text-ink-600 lg:block">Welcome back, <strong className="text-ink-900">{user.fullName.split(' ')[0]}</strong></span>
        <div className="ml-auto flex items-center gap-1"><Bell area="patient" /><button onClick={() => setDrawer(true)} aria-label="Open menu" className="flex size-11 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100 lg:hidden"><Icon name="menu" className="size-6" /></button></div>
      </header>

      {!user.emailVerified && <VerifyBanner />}
      <main id="main"><div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div></main>

      <nav aria-label="Portal shortcuts" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-ink-200 bg-white lg:hidden">
        {MOBILE.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(path, n.href) ? 'page' : undefined} className={cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium no-underline', active(path, n.href) ? 'text-brand-800' : 'text-ink-600')}><Icon name={n.icon} className="size-5" />{n.label}</Link>
        ))}
        <button onClick={() => setDrawer(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-ink-600"><Icon name="menu" className="size-5" />More</button>
      </nav>
    </div>
  );
}

function VerifyBanner() {
  const [sent, setSent] = useState(false);
  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <Container className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-amber-900">
        <p>Please confirm your email address to start a treatment case. We sent you a link when you registered.</p>
        {sent ? <span>New link sent.</span> : <button className="font-semibold underline" onClick={() => api('/auth/resend-verification', { method: 'POST' }).then(() => setSent(true)).catch(() => undefined)}>Send the link again</button>}
      </Container>
    </div>
  );
}

export function PortalShell({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <AuthProvider>
      <QueryClientProvider client={client}>
        <ToastProvider><Gate>{children}</Gate></ToastProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}
