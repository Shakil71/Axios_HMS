import type { ReactNode } from 'react';
import { StaffArea, ConsoleProviders } from '@/components/console/providers';

export const metadata = { title: 'Staff workspace', robots: { index: false, follow: false } };

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <ConsoleProviders>
      <StaffArea>{children}</StaffArea>
    </ConsoleProviders>
  );
}
