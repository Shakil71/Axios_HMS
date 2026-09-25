import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { apiGet, apiIsLive } from '@/lib/api-server';
import { sampleModeEnabled } from '@/lib/sample-data';

export const revalidate = 300;

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const [settings, live] = await Promise.all([apiGet<Record<string, string>>('/settings/public'), apiIsLive()]);
  return (
    <>
      <SiteHeader />
      {!live && sampleModeEnabled() && (
        <div role="status" className="border-b border-amber-200 bg-amber-50 text-amber-900">
          <div className="mx-auto max-w-6xl px-4 py-2 text-center text-sm sm:px-6 lg:px-8">
            <strong>Sample data:</strong> our live directory is not connected yet, so the doctors, hospitals and countries below are fictional examples.
          </div>
        </div>
      )}
      <main id="main">{children}</main>
      <SiteFooter settings={settings ?? {}} />
    </>
  );
}
