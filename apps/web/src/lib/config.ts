/**
 * Server-side base URL of the API. Browser code always uses the relative /api path (proxied by next.config.ts).
 * On Vercel it defaults to the companion API project; override with API_INTERNAL_URL.
 */
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? (process.env.VERCEL ? 'https://axios-hms-api.vercel.app' : 'http://localhost:4000');

/** Public origin of this site (canonical URLs, sitemap, OpenGraph). On Vercel it follows the production domain automatically. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')
).replace(/\/$/, '');

/** Brand name shown across the site. Set NEXT_PUBLIC_SITE_NAME to the company's registered name. */
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Overseas Medical Care';
