'use client';

/**
 * Browser API client. The short-lived access token lives ONLY in memory (never localStorage);
 * the refresh token is an httpOnly cookie the browser sends to /api/v1/auth. A 401 triggers one
 * shared refresh attempt, then a single retry.
 */

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: { field: string; message: string }[] = [],
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<(signedIn: boolean) => void>();

export const getAccessToken = () => accessToken;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const onSessionChange = (fn: (signedIn: boolean) => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const notify = (signedIn: boolean) => listeners.forEach((l) => l(signedIn));

async function parse(res: Response) {
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? 'Something went wrong. Please try again.', e?.details ?? []);
  }
  return json;
}

/** Single-flight refresh so parallel 401s do not trip refresh-token reuse detection. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'hms-web' } });
      if (!res.ok) {
        accessToken = null;
        return false;
      }
      accessToken = (await res.json()).data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

interface Init {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

/** Returns `{ data, meta }`; throws ApiError on failure. */
export async function api<T = unknown, M = Record<string, unknown>>(path: string, init: Init = {}): Promise<{ data: T; meta: M }> {
  const { method = 'GET', body, auth = true, signal } = init;
  const run = () =>
    fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await run();
  if (res.status === 401 && auth) {
    if (await refreshSession()) res = await run();
    else notify(false);
  }
  return (await parse(res)) as { data: T; meta: M };
}

/** Direct-to-storage upload with progress (the API only issues a signed URL; bytes never pass through it). */
export function uploadToStorage(
  upload: { url: string; method: string; headers: Record<string, string> },
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.url);
    for (const [k, v] of Object.entries(upload.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, 'UPLOAD_FAILED', 'The upload did not finish. Please try again.')));
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'We could not reach the server. Check your connection and try again.'));
    xhr.onabort = () => reject(new ApiError(0, 'ABORTED', 'Upload cancelled.'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(file);
  });
}

export async function logoutRequest() {
  try {
    await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'hms-web' } });
  } finally {
    accessToken = null;
    notify(false);
  }
}
