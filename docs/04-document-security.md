# 04 — Document Security Architecture

## Principles
1. Bytes are never in Postgres and never on a public URL. DB holds metadata only (`Document`, `DocumentVersion`).
2. Every read/write of a document passes **authenticate → permission → object-level scope → audit → then** a short-lived signed URL is issued.
3. Storage keys are random (`docs/{uuid}/{versionNo}-{uuid}`), never derived from patient name, NID or file name.

## Upload flow (direct-to-storage, server-controlled)
```
1. Client  → POST /documents/uploads {category, fileName, mimeType, sizeBytes, caseId?, familyMemberId?}
2. API     → authorize (patient owns case/family member OR staff with documents.upload.<sensitivity> + assignment)
             validate: category↔mime allow-list (pdf, jpeg, png, webp, heic; DICOM zip for scans),
             size ≤ UPLOAD_MAX_BYTES, filename sanitised; create Document(UPLOADED)+DocumentVersion(scan=PENDING)
             return presigned PUT (TTL 5 min, Content-Type + Content-Length locked, SSE header required)
3. Client  → PUT bytes to storage (progress via XHR), then POST /documents/:id/complete
4. API     → HEAD object, verify size; stream first bytes to verify magic-number matches declared MIME;
             compute SHA-256; enqueue AV scan job; timeline event + notification to coordinator
5. Worker  → ClamAV (or provider) scan; INFECTED ⇒ quarantine, delete object, notify; CLEAN ⇒ enabled for download
```
Downloads are blocked while `scanStatus = PENDING/INFECTED` for staff (patient may preview own upload).

## Download flow
```
POST /documents/:id/download-url
  → AuthGuard → PermissionsGuard(documents.download.<sensitivity>)
  → ScopeService (patient owns | staff assigned or .all)
  → write DocumentAccessLog(URL_ISSUED, ip, ua) + AuditLog(document.download)
  → presigned GET, TTL 120 s, Content-Disposition set, response-content-type pinned
  → denied attempts logged as DocumentAccessLog(DENIED, reason)
```
URLs are never cached (`Cache-Control: no-store`) and never appear in logs.

## Protection layers
| Layer | Control |
|---|---|
| Transport | TLS 1.2+ everywhere; HSTS |
| At rest | Bucket SSE (SSE-KMS/SSE-S3); optional app-level envelope encryption for IDENTITY docs (`encryptionKeyId` reserved) |
| Sensitive fields | NID/passport **numbers** AES-256-GCM encrypted in DB (`*Enc`), masked (`••••1234`) in every API response except an explicit, audited "reveal" permission |
| Bucket | Block public access; policy denies non-TLS; versioning on; lifecycle retention per `SystemSetting` |
| Access separation | Sensitivity classes (`IDENTITY/MEDICAL/TRAVEL/FINANCIAL/GENERAL`) map to distinct permissions, so Finance ≠ medical reports, Travel ≠ medical reports |
| Malware | AV scan job; `scanStatus` gate |
| Integrity | SHA-256 stored per version; versions immutable (replace = new version, old kept per retention) |
| Logging | Access log table append-only; logs never contain file contents, NID/passport numbers or presigned URLs |
| Deletion | Soft delete; purge job after retention; patient may delete only unverified documents |

## Test obligations (see Phase 1 acceptance)
* Patient A cannot list, fetch metadata or obtain a URL for Patient B's document (404).
* Staff without the sensitivity permission → 403 even when assigned; with permission but not assigned and no `.all` → 403.
* Revoking a permission takes effect on the very next request.
* Expired/tampered signed URL fails; MIME-spoofed upload is rejected at `complete`.
