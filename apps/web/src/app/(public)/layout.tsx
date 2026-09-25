import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { apiGet } from '@/lib/api-server';

export const revalidate = 300;

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const settings = (await apiGet<Record<string, string>>('/settings/public')) ?? {};
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter settings={settings} />
    </>
  );
}
