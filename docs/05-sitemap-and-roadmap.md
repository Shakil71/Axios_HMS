# 05 — UI Sitemap & Delivery Roadmap

## Sitemap

**Public (static/ISR, SEO)** — `/` · `/about` · `/services` · `/countries`, `/countries/[slug]` · `/hospitals`, `/hospitals/[slug]` · `/doctors`, `/doctors/[slug]` · `/treatments`, `/treatments/[slug]` · `/packages` · `/visa-assistance` · `/travel-assistance` · `/contact` · `/faq` · `/blog`, `/blog/[slug]` · `/sitemap.xml` · `/robots.txt`

**Auth** — `/register` · `/login` · `/verify-email` · `/forgot-password` · `/reset-password`

**Patient portal (`/patient`, private, mobile-first)** — `dashboard` · `profile` · `family` · `documents` (camera/gallery/PDF upload) · `cases`, `cases/new`, `cases/[id]` (Treatment Journey timeline) · `appointments` · `visa` · `travel` · `payments` · `messages` · `notifications`

**Admin/Staff (`/admin`, code-split, permission-gated menu)** — `dashboard` · `patients` · `cases` · `doctors` · `hospitals` · `treatments` · `countries` · `appointments` · `documents` (verification queue) · `visa` · `travel` · `payments` · `staff` (+ roles/permissions) · `messages` · `notifications` · `cms` · `reports` · `audit-logs` · `settings`

Error states: 403, 404, 500, offline/network, session-expired, upload-failed, permission-denied.

Patient-facing wording rule: plain language ("Upload your medical reports", "Treatment Journey", "Waiting for our team to review"). Statuses map to friendly labels in one shared dictionary.

## Roadmap (per your recommended phasing)

**Phase 0 — Foundations (done in this step)**: docs 01–05, monorepo skeleton, validated Prisma schema, audit-immutability SQL, `.env.example`, dev docker-compose.

**Phase 1 — Core**: NestJS bootstrap (config, logging, error/response envelope, health) → Auth (register/verify/login/refresh/reset) → RBAC + ScopeService → Directory (countries/hospitals/doctors/treatments + public read APIs) → Patient profile & family → Cases + timeline → Secure documents (presign/complete/download, audit, AV hook) → Next.js public site + auth + patient portal. Security/authorization tests written alongside each module.

**Phase 2**: Admin panel, staff & custom roles UI, appointments, visa, travel, notification service (in-app + email).

**Phase 3**: Payments, messaging (Socket.IO), reports, CMS, audit viewer, analytics, AI-assistant seam.

## Phase 1 acceptance (security gates)
- [ ] Patient cannot read another patient's case/document/profile (tests)
- [ ] Staff without sensitivity permission cannot download; unassigned staff cannot download
- [ ] Permission revoked ⇒ next request denied
- [ ] Unauthorized/expired signed URL fails
- [ ] Refresh-token reuse revokes the family
- [ ] No NID/passport number, token or PII in logs/URLs/localStorage
- [ ] Lighthouse ≥ 90 on public pages (Performance/Accessibility/Best Practices/SEO)
