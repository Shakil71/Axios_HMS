import type { MetadataRoute } from 'next';
import { API_INTERNAL_URL } from '@/lib/config';
import { absoluteUrl } from '@/lib/seo';

export const revalidate = 3600;

async function slugs(path: string): Promise<{ slug: string }[]> {
  const out: { slug: string }[] = [];
  for (let page = 1; page <= 20; page++) {
    try {
      const res = await fetch(`${API_INTERNAL_URL}/api/v1${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=60`, { next: { revalidate: 3600 } });
      if (!res.ok) break;
      const json = (await res.json()) as { data: { slug: string }[]; meta: { total: number; pageSize: number } };
      out.push(...json.data);
      if (page * json.meta.pageSize >= json.meta.total) break;
    } catch {
      break;
    }
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [countries, hospitals, doctors, treatments] = await Promise.all([slugs('/countries'), slugs('/hospitals'), slugs('/doctors'), slugs('/treatments')]);
  const now = new Date();
  const fixed = ['/', '/about', '/services', '/countries', '/hospitals', '/doctors', '/treatments', '/visa-assistance', '/faq', '/contact'];
  return [
    ...fixed.map((p) => ({ url: absoluteUrl(p), lastModified: now, changeFrequency: 'weekly' as const, priority: p === '/' ? 1 : 0.7 })),
    ...countries.map((c) => ({ url: absoluteUrl(`/countries/${c.slug}`), lastModified: now, priority: 0.6 })),
    ...hospitals.map((c) => ({ url: absoluteUrl(`/hospitals/${c.slug}`), lastModified: now, priority: 0.6 })),
    ...doctors.map((c) => ({ url: absoluteUrl(`/doctors/${c.slug}`), lastModified: now, priority: 0.6 })),
    ...treatments.map((c) => ({ url: absoluteUrl(`/treatments/${c.slug}`), lastModified: now, priority: 0.6 })),
  ];
}
