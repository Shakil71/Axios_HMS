# Overseas Medical Treatment Platform

Bangladesh → international medical treatment management platform (patient portal, public directory, secure documents, case management).
Design docs live in [docs/](docs/). **Status: Phase 1 implemented** (see below).

## Layout

```
apps/api   NestJS + Prisma + PostgreSQL (REST /api/v1)
apps/web   Next.js 15 (public site, auth, patient portal)
infra/     docker-compose, nginx
docs/      architecture, API, auth/RBAC, document security, sitemap/roadmap
```

## Run locally (no Docker needed)

```bash
npm install
cp .env.example apps/api/.env          # then fill JWT_SECRET (>=32 chars) and FIELD_ENCRYPTION_KEY (32 bytes base64)
                                       # for local dev also set STORAGE_DRIVER=memory and DATABASE_URL below

npm run dev:db  -w @hms/api            # embedded Postgres on :54320 (postgresql://postgres:postgres@localhost:54320/hms_dev)
npm run prisma:deploy -w @hms/api      # apply migrations
SEED_DEMO=true SEED_DEMO_PASSWORD='choose-a-long-password' npm run prisma:seed -w @hms/api
npm run dev -w @hms/api                # API on :4000
npm run dev -w @hms/web                # web on :3000  (proxies /api to :4000)
```

With Docker: `docker compose -f infra/docker-compose.yml up` gives Postgres/Redis/MinIO (set `S3_SSE=none` for MinIO).
Demo logins after seeding: `patient@`, `coordinator@`, `admin@demo.hms.test` (all sample data is labelled DEMO).

## Deploy (Vercel)

Push to `main` and Vercel redeploys. The API build migrates the database and syncs roles automatically. One-time setup (database, secrets, storage): [docs/06-vercel-deployment.md](docs/06-vercel-deployment.md).

## Tests

```bash
npm test -w @hms/api                   # 78 integration tests against a real embedded Postgres (auth, RBAC, documents, cases, directory)
npm run typecheck -w @hms/api && npm run typecheck -w @hms/web
# browser tests (needs API + `next start` running and demo seed):
npx playwright test -w @hms/web
```

## Phase 1 scope

Done: public website + SEO, authentication (Argon2id, refresh rotation with reuse detection, lockout, email verify, reset), RBAC with
per-sensitivity document permissions and assignment-scoped object-level authorization, directory (countries/hospitals/doctors/treatments,
public read + admin write APIs), patient profile and family members, cases with timeline/notes/assignment/status workflow, secure documents
(signed URLs, magic-byte validation, versions, access log, immutable audit), patient portal UI.

Not yet (Phase 2/3): admin/staff UI, appointments, visa cases, travel, notifications service, payments, messaging, CMS editor, reports, blog,
AI assistant. Public marketing copy (home/about/services) is default text until the CMS exists.
