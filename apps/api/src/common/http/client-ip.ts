import type { Request } from 'express';

/**
 * Real client IP. Behind Vercel's edge (and the web app's /api rewrite) `req.ip` can be a shared proxy address,
 * which would make every visitor share one rate-limit bucket. Vercel overwrites these headers at its edge,
 * so they cannot be spoofed by the client when the request arrives through Vercel.
 */
export function clientIp(req: Pick<Request, 'headers' | 'ip'>): string | null {
  if (process.env.VERCEL) {
    const raw = req.headers['x-vercel-forwarded-for'] ?? req.headers['x-forwarded-for'];
    const first = String(Array.isArray(raw) ? raw[0] : raw ?? '').split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? null;
}
