import { notFound } from 'next/navigation';
import { API_INTERNAL_URL } from './config';
import type { Paged } from './types';

interface Options {
  /** Seconds the response may be served from the Next data cache (ISR). */
  revalidate?: number;
}

/**
 * Public-directory fetch for Server Components. Missing records become a 404 page; an unreachable API
 * during a static build yields `null` so the page still renders an empty state and revalidates later.
 */
export async function apiGet<T>(path: string, { revalidate = 300 }: Options = {}): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${API_INTERNAL_URL}/api/v1${path}`, { next: { revalidate }, headers: { Accept: 'application/json' } });
  } catch {
    return null;
  }
  if (res.status === 404) notFound();
  if (!res.ok) return null;
  const json = (await res.json()) as { data: T };
  return json.data;
}

export async function apiList<T>(path: string, options: Options = {}): Promise<Paged<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_INTERNAL_URL}/api/v1${path}`, { next: { revalidate: options.revalidate ?? 300 }, headers: { Accept: 'application/json' } });
  } catch {
    return { data: [], meta: { page: 1, pageSize: 0, total: 0 } };
  }
  if (!res.ok) return { data: [], meta: { page: 1, pageSize: 0, total: 0 } };
  return (await res.json()) as Paged<T>;
}

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
};
