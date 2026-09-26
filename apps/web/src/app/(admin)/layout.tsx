import type { ReactNode } from 'react';
import { AdminArea, ConsoleProviders } from '@/components/console/providers';

export const metadata = { title: 'Admin workspace', robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <ConsoleProviders>
      <AdminArea>{children}</AdminArea>
    </ConsoleProviders>
  );
}
