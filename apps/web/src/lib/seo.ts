import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from './config';

export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;

const trim = (s: string | null | undefined, n = 158) => {
  if (!s) return undefined;
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** Per-page metadata: title, description, canonical, OpenGraph and Twitter card. */
export function pageMeta(o: { title: string; description?: string | null; path: string; noindex?: boolean }): Metadata {
  const description = trim(o.description);
  const url = absoluteUrl(o.path);
  return {
    title: o.title,
    description,
    alternates: { canonical: url },
    openGraph: { title: o.title, description, url, siteName: SITE_NAME, type: 'website', locale: 'en_BD' },
    twitter: { card: 'summary', title: o.title, description },
    ...(o.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
