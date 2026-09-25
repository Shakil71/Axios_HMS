'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api-client';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SITE_NAME } from '@/lib/config';
import { Alert, Button, Container, Skeleton, cx } from './ui';

const NAV = [
  { href: '/patient/dashboard', label: 'Home', icon: '⌂' },
  { href: '/patient/cases', label: 'My cases', icon: '☰' },
  { href: '/patient/documents', label: 'Documents', icon: '⇪' },
  { href: '/patient/family', label: 'Family', icon: '☺' },
  { href: '/patient/profile', label: 'Profile', icon: '⚙' },
];

function Gate({ children }: { children: ReactNode }) {
  const { state, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (state.status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [state.status, path, router]);

  if (state.status !== 'authenticated') {
    return (
      <Container className="py-10" >
        <div className="space-y-4" aria-busy="true" aria-live="polite"><span className="sr-only">Loading your account</span><Skeleton className="h-10 w-1/3" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      </Container>
    );
  }

  const { user } = state;
  if (!user.patientProfileId) {
    return (
      <Container className="max-w-xl py-16">
        <Alert tone="warning" title="This area is for patients">You are signed in as a member of our team. Team tools are being added in the next release.</Alert>
        <Button className="mt-4" variant="secondary" onClick={logout}>Sign out</Button>
      </Container>
    );
  }

  return (
    <div className="min-h-dvh bg-ink-50 pb-20 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white">
        <Container className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-ink-900"><span aria-hidden="true" className="inline-flex size-7 items-center justify-center rounded-md bg-brand-700 text-white">+</span><span className="hidden sm:inline">{SITE_NAME}</span></Link>
          <nav aria-label="Portal" className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => <NavLink key={n.href} {...n} />)}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden max-w-40 truncate text-ink-600 sm:inline">{user.fullName}</span>
            <Button variant="secondary" className="min-h-9 px-3 py-1.5" onClick={logout}>Sign out</Button>
          </div>
        </Container>
      </header>

      {!user.emailVerified && <VerifyBanner />}

      <main id="main"><Container className="py-6 sm:py-8">{children}</Container></main>

      <nav aria-label="Portal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-ink-200 bg-white lg:hidden">
        {NAV.map((n) => <TabLink key={n.href} {...n} />)}
      </nav>
    </div>
  );
}

const active = (path: string, href: string) => path === href || (href !== '/patient/dashboard' && path.startsWith(href));

function NavLink({ href, label }: { href: string; label: string }) {
  const on = active(usePathname(), href);
  return <Link href={href} aria-current={on ? 'page' : undefined} className={cx('rounded-lg px-3 py-2 text-sm font-medium', on ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-50')}>{label}</Link>;
}

function TabLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  const on = active(usePathname(), href);
  return (
    <Link href={href} aria-current={on ? 'page' : undefined} className={cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium', on ? 'text-brand-800' : 'text-ink-600')}>
      <span aria-hidden="true" className="text-lg leading-none">{icon}</span>{label}
    </Link>
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
        <Gate>{children}</Gate>
      </QueryClientProvider>
    </AuthProvider>
  );
}
