import type { ReactNode } from 'react';
import { PortalShell } from '@/components/portal-shell';

export const metadata = { title: 'My portal', robots: { index: false, follow: false } };

export default function PatientLayout({ children }: { children: ReactNode }) {
  return <PortalShell>{children}</PortalShell>;
}
