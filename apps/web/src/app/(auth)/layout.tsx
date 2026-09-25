import Link from 'next/link';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { Logo } from '@/components/ui';
import { SITE_NAME } from '@/lib/config';

export const metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <main id="main" className="flex min-h-dvh flex-col items-center bg-ink-50 px-4 py-10">
        <Link href="/" className="mb-6 flex items-center gap-2 font-bold text-ink-900">
          <Logo />
          {SITE_NAME}
        </Link>
        <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-6 shadow-card sm:p-8">{children}</div>
      </main>
    </AuthProvider>
  );
}
