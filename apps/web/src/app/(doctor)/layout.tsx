import type { ReactNode } from 'react';
import { DoctorArea, ConsoleProviders } from '@/components/console/providers';

export const metadata = { title: 'Doctor workspace', robots: { index: false, follow: false } };

export default function DoctorLayout({ children }: { children: ReactNode }) {
  return (
    <ConsoleProviders>
      <DoctorArea>{children}</DoctorArea>
    </ConsoleProviders>
  );
}
