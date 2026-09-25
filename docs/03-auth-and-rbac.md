# 03 — Authentication & RBAC

## Authentication

| Item | Design |
|---|---|
| Password | Argon2id (memory 19 MiB, t=2, p=1 minimum); policy: ≥ 10 chars, no top-common-passwords list, not equal to email/name |
| Access token | JWT (HS256 → RS256/EdDSA when a key service exists), **15 min**, claims `sub, roles, sv`. Kept in memory only |
| Refresh token | Opaque 256-bit random, **httpOnly + Secure + SameSite=Lax cookie**, path `/api/v1/auth`, 14 days. Only its SHA-256 is stored (`RefreshToken.tokenHash`) |
| Rotation | Every refresh issues a new token in the same `familyId` and revokes the old one. Presenting an already-revoked token ⇒ **revoke whole family** + audit `auth.token_reuse` |
| Session revocation | `User.sessionVersion` bump (password change, role change, suspension) invalidates outstanding access tokens via `sv` check |
| CSRF | Refresh/logout are cookie-authenticated ⇒ SameSite + `Origin` header check + custom header `X-Requested-With`. Other calls use the Bearer token (not ambient) |
| Login throttling | 5 failures / 15 min per account+IP → `lockedUntil` with exponential back-off; generic error messages; constant-time compare; CAPTCHA (Turnstile) after 3 failures and on register/forgot-password |
| Email verification | Single-use hashed token, 24 h; patients cannot create cases until verified |
| Password reset | Single-use hashed token, 30 min; resets bump `sv` and revoke all refresh families |
| Mobile verification | Optional OTP via `PHONE_OTP` token type when an SMS provider is configured |
| Nothing sensitive client-side | No tokens/PII in `localStorage`; no PII in URLs; short-lived signed URLs only |

## Authorization model

Three layers, all mandatory, all enforced **server-side**:

1. **Role → permission** (`@RequirePermissions`). Permissions are DB rows; `SUPER_ADMIN` can create custom roles and edit `RolePermission`. Cache invalidates immediately on change.
2. **Scope** — many permissions come in two flavours:
   * `*.view` = only records the caller is **assigned to** (`CaseAssignment` with `unassignedAt IS NULL`, or `Doctor` linked to the case)
   * `*.view.all` = any record (given to ADMIN / SUPER_ADMIN; granted to others deliberately)
3. **Object-level check** in the service for every single-resource access:
   ```
   authorize(user, action, resource):
     PATIENT  → resource.patientId == user.patientProfileId  (else 404)
     STAFF    → has permission(action[.all])  AND  (has .all OR assigned to resource.case)
     documents→ additionally needs  documents.<action>.<sensitivity>
   ```
   Denials return **404** for patients (no existence leak) and 403 for staff, and are audit-logged (`DENIED`).

## Permission keys

`patients.{view,create,edit,delete}` · `cases.{view,create,edit,assign,close}` · `documents.{view,upload,verify,download,delete}.{identity|medical|travel|financial|general}` · `visa.{view,edit,approve}` · `travel.{view,edit}` · `appointments.{view,create,edit}` · `payments.{view,create,refund}` · `directory.{manage}` (countries, hospitals, doctors, treatments) · `cms.manage` · `messages.{view,send}` · `staff.manage` · `roles.manage` · `reports.view` · `audit.view` · `settings.manage`. Any `view/edit` key may have the `.all` variant.

## Role × permission matrix (seed defaults — editable by SUPER_ADMIN)

Legend: ● full · ◐ assigned cases only · ○ none

| Capability | SUPER_ADMIN | ADMIN | MEDICAL_COORD. | CASE_MANAGER | VISA_OFFICER | TRAVEL_COORD. | FINANCE | DOCTOR | PATIENT |
|---|---|---|---|---|---|---|---|---|---|
| Patients view/edit | ● | ● | ◐ | ◐ | ◐ (view) | ◐ (view) | ◐ (view name/contact) | ◐ (view) | own |
| Cases view/edit | ● | ● | ◐ | ◐ | ◐ (view) | ◐ (view) | ◐ (view) | ◐ (view) | own |
| Cases assign / close | ● | ● | ○ | ◐ | ○ | ○ | ○ | ○ | ○ |
| Documents — **medical** view/verify | ● | ● | ◐ | ◐ | ○ | ○ | ○ | ◐ (view) | own |
| Documents — **identity** (NID/passport) view/verify | ● | ● | ○ | ◐ | ◐ | ◐ | ○ | ○ | own |
| Documents — **travel** (visa/flight/hotel) | ● | ● | ○ | ◐ | ◐ | ◐ | ○ | ○ | own |
| Documents — **financial** | ● | ● | ○ | ○ | ○ | ○ | ◐ | ○ | own |
| Documents delete | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | own (unverified only) |
| Appointments | ● | ● | ◐ | ◐ | ○ | ○ | ○ | ◐ (view/confirm) | own |
| Visa view/edit | ● | ● | ○ | ◐ (view) | ◐ | ○ | ○ | ○ | own (view) |
| Visa approve | ● | ● | ○ | ○ | ◐ | ○ | ○ | ○ | ○ |
| Travel | ● | ● | ○ | ◐ (view) | ○ | ◐ | ○ | ○ | own (view) |
| Payments view/create | ● | ● | ○ | ○ | ○ | ○ | ● | ○ | own (view) |
| Payments refund | ● | ○ | ○ | ○ | ○ | ○ | ● | ○ | ○ |
| Messages | ● | ● | ◐ | ◐ | ◐ | ◐ | ○ | ◐ | own |
| Directory / CMS manage | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Staff / roles manage | ● | staff only | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Reports | ● | ● | ○ | ◐ (own workload) | ○ | ○ | ● (finance) | ○ | ○ |
| Audit logs view | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Settings | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

Notes: FINANCE sees a patient name/contact and invoice lines only — never medical reports or identity documents. Internal notes (`Visibility.INTERNAL`) are filtered out of every patient-facing query at the repository layer, not in the UI.

## Audit events

`auth.login · auth.login_failed · auth.logout · auth.password_change · auth.token_reuse · patient.update · patient.view (staff) · case.create/update/status/assign · document.upload/replace/verify/reject/delete/download · rbac.role_change · rbac.permission_change · payment.create/update/refund · visa.update/approve`.
Each row: actor, role, action, resource type/id, IP, user-agent, timestamp, before/after (sensitive fields masked). Table is append-only (DB trigger + revoked privileges).
