# 06 — Deploying on Vercel (push to GitHub → live)

Two Vercel projects are connected to this one GitHub repo. Every push to `main` redeploys whichever app changed.

| Project | Root Directory | What it is |
|---|---|---|
| `axios-hms-web` | `apps/web` | Next.js site + patient portal. Forwards `/api/*` to the API project |
| `axios-hms-api` | `apps/api` | NestJS API as a serverless function (`api/index.js`) |

Both have a `vercel.json` in their folder, so build and install commands live in git and do not need dashboard edits.

## What happens automatically on each push

**API build** (`apps/api/scripts/vercel-build.cjs`): generate Prisma client → compile → if a database is configured, run
`prisma migrate deploy` → sync permissions and system roles (idempotent). If no database is configured it skips this and says so in the log.

**Defaults on Vercel** (all overridable): API `APP_URL` = `https://axios-hms-web.vercel.app`; web `API_INTERNAL_URL` = `https://axios-hms-api.vercel.app`;
web canonical/sitemap URLs follow the production domain.

## One-time setup (secrets cannot live in git)

1. **Database.** In the `axios-hms-api` project: Storage → add a Postgres database (Neon). Vercel injects `POSTGRES_URL` etc.; the API and build script read them
   automatically (pooled URL at runtime, non-pooling URL for migrations). Or set `DATABASE_URL` yourself (and optionally `MIGRATE_DATABASE_URL` for a direct connection).
2. **Secrets.** Run `node scripts/gen-secrets.cjs` and add both values to `axios-hms-api` → Environment Variables:
   `JWT_SECRET`, `FIELD_ENCRYPTION_KEY`. Keep a copy: losing `FIELD_ENCRYPTION_KEY` makes stored NID/passport numbers unreadable.
3. **File storage** (needed only for document uploads). Create an S3-compatible bucket (Cloudflare R2 or AWS S3) and set on the API project:
   `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, and for R2/MinIO also `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE=true`.
   Add a bucket CORS rule allowing `PUT` from your web origin. Keep the bucket private.
4. **First admin / demo data (optional).** Set `SEED_SUPERADMIN_EMAIL` + `SEED_SUPERADMIN_PASSWORD` (12+ chars) to create a SUPER_ADMIN on the next deploy.
   For sample directory data set `SEED_DEMO=true`, `SEED_DEMO_PASSWORD`, `SEED_ALLOW_DEMO_IN_PRODUCTION=true`, deploy once, then remove them.
5. **Email** (verification and password reset): set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`. Without SMTP no email is sent in production.
6. Redeploy `axios-hms-api` once after adding variables. Nothing else is required.

Check it: `https://axios-hms-api.vercel.app/api/v1/health/ready` should return `{"success":true,...}`.
If it returns `NOT_CONFIGURED`, open the API project's Function Logs: the first line names the missing variable.

## Notes and limits

- Use the short production domains (`*.vercel.app` names without the team suffix). Long per-deployment URLs are behind Vercel Deployment Protection.
- Rate limiting counters are in memory per function instance, so limits are approximate on serverless. Move counters to Redis (Upstash) for strict limits.
- Use a pooled `DATABASE_URL` at runtime (add `&connection_limit=1` if you see connection errors).
- If the web app and API later share a custom domain (for example `www.` and `api.`), you can drop the `/api` proxy and call the API directly.
