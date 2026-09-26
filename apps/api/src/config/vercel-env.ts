import { createHash } from 'crypto';

/**
 * Fills in environment defaults so a push-to-deploy works with the fewest manual settings.
 * Every value can be overridden in the Vercel dashboard. Real secrets are NEVER defaulted when a real database is configured.
 * Must be imported before anything reads process.env (Prisma reads DATABASE_URL at client creation).
 */
const env = process.env;

// Vercel Postgres / Neon integrations expose these instead of DATABASE_URL.
// (assigning `undefined` to process.env would store the string "undefined", so only assign a real value)
const provided = env.POSTGRES_PRISMA_URL || env.POSTGRES_URL || env.DATABASE_URL_UNPOOLED;
if (!env.DATABASE_URL && provided) env.DATABASE_URL = provided;

if (env.VERCEL) {
  // Origin of the web app: used for the CSRF/Origin check, CORS and links in emails.
  env.APP_URL ||= 'https://axios-hms-web.vercel.app';
}

/**
 * DEMO MODE: no database configured (or DEMO_MODE=true) → the API runs on an in-memory Postgres (PGlite) that is
 * migrated and filled with demo users and data at start-up. Data is not persistent. Secrets are derived (not random) so
 * every serverless instance of the same project accepts the same tokens. As soon as DATABASE_URL is set this switches off.
 */
if (!env.DATABASE_URL || env.DEMO_MODE === 'true') {
  env.DEMO_MODE = 'true';
  env.DATABASE_URL = 'postgresql://demo:demo@localhost:5432/demo'; // placeholder; the PGlite adapter ignores it
  const seed = `${env.VERCEL_PROJECT_ID ?? env.VERCEL_URL ?? 'local-demo'}|hms-demo`;
  env.JWT_SECRET ||= createHash('sha256').update(`jwt|${seed}`).digest('base64url');
  env.FIELD_ENCRYPTION_KEY ||= createHash('sha256').update(`field|${seed}`).digest('base64');
  env.STORAGE_DRIVER ||= 'memory';
} else {
  env.DEMO_MODE = 'false';
}
