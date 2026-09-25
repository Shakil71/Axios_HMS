/**
 * Fills in environment defaults when running on Vercel so a push-to-deploy works with the fewest manual settings.
 * Every value can still be overridden in the Vercel dashboard. Secrets are never defaulted.
 * Must be imported before anything reads process.env (Prisma reads DATABASE_URL at client creation).
 */
const env = process.env;

// Vercel Postgres / Neon integrations expose these instead of DATABASE_URL.
env.DATABASE_URL ||= env.POSTGRES_PRISMA_URL || env.POSTGRES_URL || env.DATABASE_URL_UNPOOLED;

if (env.VERCEL) {
  // Origin of the web app: used for the CSRF/Origin check, CORS and links in emails.
  env.APP_URL ||= 'https://axios-hms-web.vercel.app';
}
