import { Analytics } from '@vercel/analytics/next';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SITE_NAME, SITE_URL } from '@/lib/config';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — Trusted medical treatment abroad`, template: `%s | ${SITE_NAME}` },
  description:
    'Patients from Bangladesh can get help with doctors, hospitals, appointments, visa documents and travel coordination for treatment abroad.',
  applicationName: SITE_NAME,
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#145f71' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-pop">
          Skip to content
        </a>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
