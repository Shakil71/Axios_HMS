# 02 — API Architecture

Base path `/api/v1`. JSON only. All routes authenticated unless marked **public**.

## Conventions

**Success**
```json
{ "success": true, "data": { }, "meta": { "page": 1, "pageSize": 20, "total": 134 } }
```
**Error** (never includes stack traces, SQL, paths)
```json
{ "success": false, "error": { "code": "FORBIDDEN", "message": "You do not have access to this item.", "details": [], "requestId": "…" } }
```

| Status | Use |
|---|---|
| 200/201/204 | ok / created / no content |
| 400 | malformed request; 422 field validation (`details: [{field, message}]`) |
| 401 | not authenticated / token expired (`SESSION_EXPIRED`) |
| 403 | authenticated but not permitted |
| 404 | not found **or** not visible to caller (prevents ID enumeration) |
| 409 | conflict (duplicate, invalid state transition) |
| 429 | rate limited (`Retry-After`) |

Pagination `?page=&pageSize=` (max 100) or cursor `?cursor=` for messages/timeline; sorting `?sort=-createdAt`; filtering by explicit whitelisted query params; search `?q=`.

## Endpoint groups

| Group | Key endpoints |
|---|---|
| `/auth` | `POST register · login · refresh · logout · verify-email · resend-verification · forgot-password · reset-password · change-password`, `GET me` |
| `/patients` | `GET/PATCH /me`, staff: `GET /`, `GET /:id` (permission + scope) |
| `/family-members` | CRUD under `/patients/me/family-members` |
| `/countries` `/cities` `/hospitals` `/doctors` `/treatments` `/specialties` | **public** `GET` (published + verified only); admin `POST/PATCH/DELETE` |
| `/cases` | `POST · GET · GET /:id · PATCH /:id · POST /:id/status · POST /:id/assign · GET /:id/timeline · POST /:id/notes` |
| `/documents` | `POST /uploads` (presign) · `POST /:id/complete` · `GET /:id` (metadata) · `POST /:id/download-url` · `POST /:id/versions` · `PATCH /:id/verify` · `DELETE /:id` |
| `/appointments` | CRUD + `POST /:id/confirm · reschedule · cancel` |
| `/visa` | `GET /requirements?countryId=` (public) · visa case CRUD · checklist |
| `/travel` | travel plan + flights/hotels/transports |
| `/payments` | invoices, payments, receipts (gateway adapter interface) |
| `/messages` | conversations, messages, attachments, read receipts (+ Socket.IO namespace `/chat`) |
| `/notifications` | list, mark read, preferences |
| `/admin` | roles, permissions, staff, dashboard stats, settings, CMS |
| `/reports` | aggregate reports (permission `reports.view`) |
| `/search` | `public` (directory only) and `/admin/search` (authorized) |
| `/health` | `live`, `ready` |

## Request pipeline

1. **Security middleware**: Helmet, CORS allow-list, body-size limits, request-id, pino logger.
2. **Throttler** (Redis-backed): global default, stricter on `/auth/*` (per-IP + per-account), uploads, search.
3. **AuthGuard**: verifies access JWT (`sub`, `roles`, `sv` session version), rejects revoked sessions.
4. **PermissionsGuard**: `@RequirePermissions('cases.view')` checks the role→permission set (cached in Redis, **invalidated immediately on role/permission change** — required by the "revoked permission blocks access" test).
5. **ScopeService (object-level authorization)** invoked *inside services* for every read/write of an individual resource — see [03](03-auth-and-rbac.md). Guards alone are not sufficient.
6. **Validation** (Zod DTO) → **service** (transaction) → **AuditInterceptor** (writes `AuditLog` in the same transaction for mutations; explicit call for sensitive reads).
7. **ResponseInterceptor** wraps envelope; **AllExceptionsFilter** maps errors and strips internals.

## Notification abstraction

```ts
interface NotificationChannelProvider { channel: NotificationChannel; send(msg: OutboundMessage): Promise<ProviderResult> }
```
`NotificationService.notify(userId, type, payload)` writes `Notification` (in-app) + one `NotificationDelivery` per enabled channel and enqueues BullMQ jobs; SMTP is the first provider, SMS/WhatsApp providers are added by registering a class — no caller changes.

## Payment abstraction

`PaymentGateway` interface (`createCheckout`, `verifyWebhook`, `refund`) with a `manual` adapter (staff records offline payments) in Phase 3; gateways register by `provider` key stored on `Payment`.

## AI-ready seam (Phase 3+)

An `assistant` module is reserved but not built. Rules baked into the design: AI output is stored separately from clinical records, labelled `AI_GENERATED`, needs human approval before it is shown to a patient, and the AI has no write access to medical data — it can only propose drafts.
