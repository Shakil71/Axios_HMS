/** Server-side base URL of the API (internal network in production). Browser code uses relative /api. */
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
/** Brand name shown across the site. Set NEXT_PUBLIC_SITE_NAME to the company's registered name. */
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Overseas Medical Care'
