import { notFound } from 'next/navigation';
import { API_INTERNAL_URL } from './config';
import { sampleFor, sampleModeEnabled } from './sample-data';
import type { Paged } from './types';

interface Options {
  /** Seconds the response may be served from the Next data cache (ISR). */
  revalidate?: number;
}

const EMPTY_PAGE = { data: [], meta: { page: 1, pageSize: 0, total: 0 } };

/** Fetches from the API; `undefined` means the API could not be reached or answered with a server error. */
async function fetchApi(path: string, revalidate: number): Promise<{ status: number; json: any } | undefined> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/api/v1${path}`, { next: { revalidate }, headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (res.status >= 500) return undefined;
    return { status: res.status, json: res.ok ? await res.json() : null };
  } catch {
    return undefined;
  }
}

/**
 * Public-directory fetch for Server Components. Missing records become a 404 page. If the API is unreachable the
 * built-in sample directory answers instead (see sample-data.ts), so pages still render; the layout shows a notice.
 */
export async function apiGet<T>(path: string, { revalidate = 300 }: Options = {}): Promise<T | null> {
  const r = await fetchApi(path, revalidate);
  if (!r) {
    const s = sampleModeEnabled() ? sampleFor(path) : null;
    if (s === 'not-found') notFound();
    return s ? ((s.data as T) ?? null) : null;
  }
  if (r.status === 404) notFound();
  return r.json ? (r.json.data as T) : null;
}

export async function apiList<T>(path: string, options: Options = {}): Promise<Paged<T>> {
  const r = await fetchApi(path, options.revalidate ?? 300);
  if (!r) {
    const s = sampleModeEnabled() ? sampleFor(path) : null;
    return s && s !== 'not-found' ? (s as unknown as Paged<T>) : (EMPTY_PAGE as Paged<T>);
  }
  return r.json ? (r.json as Paged<T>) : (EMPTY_PAGE as Paged<T>);
}

/** True when the real API answers; used to show the "sample data" notice. */
export async function apiIsLive(): Promise<boolean> {
  return (await fetchApi('/health/live', 30)) !== undefined;
}

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
};
