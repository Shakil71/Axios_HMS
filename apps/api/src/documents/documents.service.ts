import { Injectable } from '@nestjs/common';
import { Document, DocumentAccessAction, DocumentSensitivity, DocumentVersion, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { AppError, conflict, forbidden, notFound } from '../common/http/errors';
import { ReqCtx } from '../common/http/request-context';
import { Paginated, pageParams } from '../common/http/response';
import { PrismaService } from '../common/prisma.service';
import { getEnv } from '../config/env';
import { TimelineService } from '../cases/timeline.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Storage } from '../storage/storage.service';
import { AuthUser, can, primaryRole } from '../rbac/auth-user';
import { DocAction, SENSITIVITIES, docPerm } from '../rbac/permissions';
import { ScopeService } from '../rbac/scope.service';
import {
  CATEGORY_LABELS, SENSITIVITY_BY_CATEGORY, STATUS_LABELS, allowedMimeTypes, detectMime, mimeMatches, sanitizeFileName, toSensitivityKey,
} from './documents.constants';
import { completeSchema, downloadSchema, listDocumentsQuery, requestUploadSchema, requestVersionSchema, verifySchema } from './documents.schemas';

type DocWithVersion = Document & { versions: DocumentVersion[]; patient: { id: string; user: { fullName: string } }; case: { caseNumber: string } | null };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const currentVersionInclude = {
  versions: { where: { completedAt: { not: null } }, orderBy: { versionNo: 'desc' as const }, take: 1 },
  patient: { select: { id: true, user: { select: { fullName: true } } } },
  case: { select: { caseNumber: true } },
};
const completedOnly: Prisma.DocumentWhereInput = { versions: { some: { completedAt: { not: null } } } };

/**
 * Every document operation runs:  authenticate → permission (per sensitivity) → object-level scope
 * → access log/audit → only then a short-lived signed URL. Denials are logged and, when the caller
 * has no legitimate reach, indistinguishable from "not found".
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly storage: Storage,
    private readonly timeline: TimelineService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── authorization ─────────────

  private async logAccess(user: AuthUser, documentId: string, action: DocumentAccessAction, ctx: ReqCtx, extra: { versionNo?: number; granted?: boolean; denyReason?: string } = {}) {
    await this.prisma.documentAccessLog.create({
      data: { documentId, userId: user.id, action, versionNo: extra.versionNo, granted: extra.granted ?? true, denyReason: extra.denyReason, ip: ctx.ip, userAgent: ctx.userAgent },
    });
  }

  private async deny(user: AuthUser, doc: Document, action: DocAction, reason: string, ctx: ReqCtx, hide: boolean): Promise<never> {
    await this.logAccess(user, doc.id, 'DENIED', ctx, { granted: false, denyReason: `${action}:${reason}` });
    await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'document.access_denied', resourceType: 'Document', resourceId: doc.id, metadata: { attempted: action, reason }, ...ctx });
    throw hide ? notFound('We could not find this document.') : forbidden();
  }

  /** The single gate every document operation passes through. */
  private async authorize(user: AuthUser, documentId: string, action: DocAction, ctx: ReqCtx): Promise<DocWithVersion> {
    const doc = await this.prisma.document.findFirst({ where: { id: documentId, deletedAt: null, ...visibleFor(action) }, include: currentVersionInclude });
    if (!doc) throw notFound('We could not find this document.');

    if (!this.scope.isStaff(user)) {
      if (!user.patientProfileId || doc.patientId !== user.patientProfileId) return this.deny(user, doc, action, 'not_owner', ctx, true);
      if (action === 'verify') return this.deny(user, doc, action, 'patient_cannot_verify', ctx, false);
      return doc;
    }

    const reaches = can(user, 'documents.scope.all') || (await this.scope.staffReachesPatient(user, doc.patientId, doc.caseId));
    if (!reaches) return this.deny(user, doc, action, 'out_of_scope', ctx, true);
    if (!can(user, docPerm(action, toSensitivityKey(doc.sensitivity)))) return this.deny(user, doc, action, `missing_${docPerm(action, toSensitivityKey(doc.sensitivity))}`, ctx, false);
    return doc;
  }

  // ───────────── presentation ─────────────

  private dto(d: DocWithVersion, staff = false) {
    const v = d.versions[0];
    const expired = d.expiresAt && d.expiresAt < new Date() && d.status !== 'REJECTED';
    const status = expired ? 'EXPIRED' : d.status;
    return {
      id: d.id,
      category: d.category,
      categoryLabel: CATEGORY_LABELS[d.category],
      sensitivity: d.sensitivity,
      title: d.title,
      status,
      statusLabel: STATUS_LABELS[status],
      rejectionReason: d.status === 'REJECTED' ? d.rejectionReason : null,
      expiresAt: d.expiresAt,
      caseId: d.caseId,
      familyMemberId: d.familyMemberId,
      currentVersion: d.currentVersion,
      file: v ? { fileName: v.originalFileName, mimeType: v.mimeType, sizeBytes: Number(v.sizeBytes), uploadedAt: v.createdAt, scanStatus: v.scanStatus } : null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      ...(staff ? { patient: { id: d.patient.id, fullName: d.patient.user.fullName }, caseNumber: d.case?.caseNumber ?? null } : {}),
    };
  }

  // ───────────── upload ─────────────

  private validateFile(category: z.infer<typeof requestUploadSchema>['category'], f: { mimeType: string; sizeBytes: number }) {
    const fail = (field: string, message: string) => new AppError(422, 'VALIDATION_FAILED', message, [{ field, message }]);
    if (!allowedMimeTypes(category).includes(f.mimeType)) throw fail('mimeType', 'This file type is not accepted. Please upload a PDF, JPG, PNG or HEIC file.');
    if (f.sizeBytes > getEnv().UPLOAD_MAX_BYTES) throw fail('sizeBytes', `This file is too large. The maximum size is ${Math.floor(getEnv().UPLOAD_MAX_BYTES / 1024 / 1024)} MB.`);
  }

  async requestUpload(user: AuthUser, dto: z.infer<typeof requestUploadSchema>, ctx: ReqCtx) {
    this.validateFile(dto.category, dto);
    const sensitivity = SENSITIVITY_BY_CATEGORY[dto.category];

    let patientId: string;
    let caseId: string | null = dto.caseId ?? null;

    if (!this.scope.isStaff(user)) {
      if (!user.patientProfileId) throw forbidden();
      patientId = user.patientProfileId;
      if (caseId) {
        const c = await this.prisma.medicalCase.findFirst({ where: { id: caseId, patientId, deletedAt: null }, select: { id: true } });
        if (!c) throw notFound('We could not find this treatment case.');
      }
    } else {
      if (!caseId) throw new AppError(422, 'VALIDATION_FAILED', 'Choose the case this document belongs to.', [{ field: 'caseId', message: 'Required for staff uploads.' }]);
      const where = can(user, 'documents.scope.all') ? { id: caseId, deletedAt: null } : { id: caseId, deletedAt: null, ...this.scope.assignedWhere(user) };
      const c = await this.prisma.medicalCase.findFirst({ where, select: { id: true, patientId: true } });
      if (!c) throw notFound('We could not find this treatment case.');
      if (!can(user, docPerm('upload', toSensitivityKey(sensitivity)))) throw forbidden();
      patientId = c.patientId;
    }
    if (dto.familyMemberId) {
      const f = await this.prisma.familyMember.count({ where: { id: dto.familyMemberId, patientId, deletedAt: null } });
      if (!f) throw notFound('We could not find this family member.');
    }

    const documentId = randomUUID();
    const storageKey = `docs/${documentId}/1-${randomUUID()}`;
    await this.prisma.document.create({
      data: {
        id: documentId, patientId, caseId, familyMemberId: dto.familyMemberId, category: dto.category, sensitivity, title: dto.title, expiresAt: dto.expiresAt,
        currentVersion: 0,
        versions: { create: { versionNo: 1, storageKey, originalFileName: sanitizeFileName(dto.fileName), mimeType: dto.mimeType, sizeBytes: BigInt(dto.sizeBytes), sha256: '', uploadedById: user.id } },
      },
    });
    return this.presign(documentId, 1, storageKey, dto.mimeType, dto.sizeBytes);
  }

  async requestVersion(user: AuthUser, documentId: string, dto: z.infer<typeof requestVersionSchema>, ctx: ReqCtx) {
    const doc = await this.authorize(user, documentId, 'upload', ctx);
    this.validateFile(doc.category, dto);
    const last = await this.prisma.documentVersion.aggregate({ where: { documentId }, _max: { versionNo: true } });
    const versionNo = (last._max.versionNo ?? 0) + 1;
    const storageKey = `docs/${documentId}/${versionNo}-${randomUUID()}`;
    await this.prisma.documentVersion.create({
      data: { documentId, versionNo, storageKey, originalFileName: sanitizeFileName(dto.fileName), mimeType: dto.mimeType, sizeBytes: BigInt(dto.sizeBytes), sha256: '', uploadedById: user.id },
    });
    return this.presign(documentId, versionNo, storageKey, dto.mimeType, dto.sizeBytes);
  }

  private async presign(documentId: string, versionNo: number, key: string, mimeType: string, sizeBytes: number) {
    const upload = await this.storage.presignPut(key, { contentType: mimeType, contentLength: sizeBytes, ttlSeconds: getEnv().UPLOAD_URL_TTL_SECONDS });
    return { documentId, versionNo, upload };
  }

  private async discard(documentId: string, versionNo: number, key: string) {
    await this.storage.remove(key).catch(() => undefined);
    await this.prisma.$transaction(async (tx) => {
      await tx.documentVersion.deleteMany({ where: { documentId, versionNo, completedAt: null } });
      const remaining = await tx.documentVersion.count({ where: { documentId } });
      if (remaining === 0) await tx.document.delete({ where: { id: documentId } });
    });
  }

  /** Verifies the uploaded bytes (size, real file type, hash) before the document becomes visible. */
  async complete(user: AuthUser, documentId: string, dto: z.infer<typeof completeSchema>, ctx: ReqCtx) {
    const doc = await this.authorize(user, documentId, 'upload', ctx);
    const version = await this.prisma.documentVersion.findFirst({
      where: { documentId, completedAt: null, ...(dto.versionNo ? { versionNo: dto.versionNo } : {}) },
      orderBy: { versionNo: 'desc' },
    });
    if (!version) throw notFound('There is no pending upload for this document.');
    if (version.uploadedById !== user.id) throw forbidden();

    const bytes = await this.storage.read(version.storageKey);
    const fail = async (code: string, message: string) => {
      await this.discard(documentId, version.versionNo, version.storageKey);
      throw new AppError(422, code, message, [{ field: 'file', message }]);
    };
    if (!bytes) throw new AppError(409, 'UPLOAD_MISSING', 'We have not received your file yet. Please try uploading again.');
    if (BigInt(bytes.length) !== version.sizeBytes) return fail('FILE_SIZE_MISMATCH', 'The uploaded file did not match. Please try again.');
    const detected = detectMime(bytes);
    if (!detected || !mimeMatches(version.mimeType, detected)) return fail('FILE_TYPE_MISMATCH', 'This file does not look like the type you selected. Please upload a PDF, JPG, PNG or HEIC file.');

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const done = await this.prisma.$transaction(async (tx) => {
      await tx.documentVersion.update({ where: { id: version.id }, data: { sha256, completedAt: new Date(), scanStatus: 'SKIPPED' } }); // scanner adapter plugs in here
      const d = await tx.document.update({
        where: { id: documentId },
        data: { currentVersion: version.versionNo, status: 'UPLOADED', rejectionReason: null, verifiedAt: null, verifiedById: null },
        include: currentVersionInclude,
      });
      if (d.caseId) {
        await this.timeline.record({ caseId: d.caseId, type: 'DOCUMENT_UPLOADED', title: `${cap(CATEGORY_LABELS[d.category])} uploaded`, actorId: user.id }, tx);
        await this.notifications.notifyTeamOfCase(d.caseId, 'DOCUMENT_UPLOADED', `${cap(CATEGORY_LABELS[d.category])} uploaded`, 'Waiting for review', user.id, tx);
      }
      await tx.documentAccessLog.create({ data: { documentId, versionNo: version.versionNo, userId: user.id, action: version.versionNo > 1 ? 'REPLACE' : 'UPLOAD', ip: ctx.ip, userAgent: ctx.userAgent } });
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'document.upload', resourceType: 'Document', resourceId: documentId, metadata: { category: d.category, versionNo: version.versionNo, sizeBytes: bytes.length }, ...ctx }, tx);
      return d;
    });
    return { ...this.dto(done), message: 'Your document has been submitted for verification.' };
  }

  // ───────────── read ─────────────

  async get(user: AuthUser, id: string, ctx: ReqCtx) {
    const doc = await this.authorize(user, id, 'view', ctx);
    return this.dto(doc, this.scope.isStaff(user));
  }

  async versions(user: AuthUser, id: string, ctx: ReqCtx) {
    await this.authorize(user, id, 'view', ctx);
    const rows = await this.prisma.documentVersion.findMany({ where: { documentId: id, completedAt: { not: null } }, orderBy: { versionNo: 'desc' } });
    return rows.map((v) => ({ versionNo: v.versionNo, fileName: v.originalFileName, mimeType: v.mimeType, sizeBytes: Number(v.sizeBytes), uploadedAt: v.createdAt, scanStatus: v.scanStatus }));
  }

  /** Staff reach + per-sensitivity permission for `action`; null when the caller may not use this action at all. */
  private staffAccess(user: AuthUser, action: DocAction): Prisma.DocumentWhereInput | null {
    const allowed = SENSITIVITIES.filter((s) => can(user, docPerm(action, s))).map((s) => s.toUpperCase() as DocumentSensitivity);
    if (!allowed.length) return null;
    const reach: Prisma.DocumentWhereInput = can(user, 'documents.scope.all')
      ? {}
      : { OR: [{ caseId: { not: null }, case: { is: { deletedAt: null, ...this.scope.assignedWhere(user) } } }, { caseId: null, patient: { cases: { some: { deletedAt: null, ...this.scope.assignedWhere(user) } } } }] };
    return { AND: [{ sensitivity: { in: allowed } }, reach] };
  }

  /** Documents waiting for this staff member to verify (only categories they may verify, only cases they can reach). */
  async reviewQueue(user: AuthUser, take = 6) {
    const access = this.staffAccess(user, 'verify');
    if (!access) return { total: 0, items: [] as ReturnType<DocumentsService['dto']>[] };
    const where: Prisma.DocumentWhereInput = { AND: [{ deletedAt: null }, completedOnly, access, { status: { in: ['UPLOADED', 'UNDER_REVIEW'] } }] };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({ where, take, orderBy: { createdAt: 'asc' }, include: currentVersionInclude }),
      this.prisma.document.count({ where }),
    ]);
    return { total, items: rows.map((r) => this.dto(r, true)) };
  }

  async list(user: AuthUser, q: z.infer<typeof listDocumentsQuery>) {
    const { page, pageSize, skip, take } = pageParams(q);
    const filters: Prisma.DocumentWhereInput = {
      ...(q.caseId ? { caseId: q.caseId } : {}),
      ...(q.familyMemberId ? { familyMemberId: q.familyMemberId } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.pending ? { status: { in: ['UPLOADED' as const, 'UNDER_REVIEW' as const] } } : {}),
    };
    let access: Prisma.DocumentWhereInput;

    if (!this.scope.isStaff(user)) {
      if (!user.patientProfileId) throw forbidden();
      access = { patientId: user.patientProfileId };
    } else {
      const staffAccess = this.staffAccess(user, 'view');
      if (!staffAccess) throw forbidden();
      access = { AND: [staffAccess, q.patientId ? { patientId: q.patientId } : {}] };
    }
    const where: Prisma.DocumentWhereInput = { AND: [{ deletedAt: null }, completedOnly, access, filters] };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: currentVersionInclude }),
      this.prisma.document.count({ where }),
    ]);
    const staff = this.scope.isStaff(user);
    return new Paginated(rows.map((r) => this.dto(r, staff)), { page, pageSize, total });
  }

  /** Issues a 120-second signed URL after authorization; never returns bytes or a stable link. */
  async downloadUrl(user: AuthUser, id: string, dto: z.infer<typeof downloadSchema>, ctx: ReqCtx) {
    const action: DocAction = dto.purpose === 'view' ? 'view' : 'download';
    const doc = await this.authorize(user, id, action, ctx);
    const version = dto.versionNo
      ? await this.prisma.documentVersion.findFirst({ where: { documentId: id, versionNo: dto.versionNo, completedAt: { not: null } } })
      : doc.versions[0];
    if (!version) throw notFound('We could not find this file.');
    if (version.scanStatus === 'INFECTED') throw conflict('This file was blocked by our security scan.', 'FILE_BLOCKED');
    if (version.scanStatus === 'PENDING' && this.scope.isStaff(user)) throw conflict('This file is still being checked. Please try again shortly.', 'SCAN_PENDING');

    const ttl = getEnv().SIGNED_URL_TTL_SECONDS;
    const url = await this.storage.presignGet(version.storageKey, { ttlSeconds: ttl, fileName: version.originalFileName, contentType: version.mimeType, inline: dto.purpose === 'view' });
    await this.logAccess(user, id, 'URL_ISSUED', ctx, { versionNo: version.versionNo });
    await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'document.download', resourceType: 'Document', resourceId: id, metadata: { versionNo: version.versionNo, purpose: dto.purpose, category: doc.category }, ...ctx });
    return { url, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  // ───────────── verification & deletion ─────────────

  async verify(user: AuthUser, id: string, dto: z.infer<typeof verifySchema>, ctx: ReqCtx) {
    const doc = await this.authorize(user, id, 'verify', ctx);
    const label = CATEGORY_LABELS[doc.category];
    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await tx.document.update({
        where: { id },
        data: {
          status: dto.decision,
          rejectionReason: dto.decision === 'REJECTED' ? dto.reason : null,
          verifiedById: dto.decision === 'VERIFIED' ? user.id : null,
          verifiedAt: dto.decision === 'VERIFIED' ? new Date() : null,
        },
        include: currentVersionInclude,
      });
      if (d.caseId && dto.decision === 'VERIFIED') await this.timeline.record({ caseId: d.caseId, type: 'DOCUMENT_VERIFIED', title: `${cap(label)} verified`, actorId: user.id }, tx);
      if (d.caseId && dto.decision === 'REJECTED') await this.timeline.record({ caseId: d.caseId, type: 'DOCUMENT_REJECTED', title: `Please upload a new ${label}`, description: dto.reason, actorId: user.id }, tx);
      if (d.caseId && dto.decision === 'VERIFIED') await this.notifications.notifyPatientOfCase(d.caseId, 'DOCUMENT_VERIFIED', `${cap(label)} verified`, undefined, tx);
      if (d.caseId && dto.decision === 'REJECTED') await this.notifications.notifyPatientOfCase(d.caseId, 'DOCUMENT_REJECTED', `Please upload a new ${label}`, dto.reason, tx);
      await tx.documentAccessLog.create({ data: { documentId: id, userId: user.id, action: dto.decision === 'REJECTED' ? 'REJECT' : 'VERIFY', ip: ctx.ip, userAgent: ctx.userAgent } });
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'document.verify', resourceType: 'Document', resourceId: id, before: { status: doc.status }, after: { status: dto.decision }, ...ctx }, tx);
      return d;
    });
    return this.dto(updated, true);
  }

  async remove(user: AuthUser, id: string, ctx: ReqCtx) {
    const doc = await this.authorize(user, id, 'delete', ctx);
    if (!this.scope.isStaff(user) && doc.status === 'VERIFIED') {
      throw conflict('Verified documents cannot be deleted. Please contact your coordinator.', 'DOCUMENT_VERIFIED');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id }, data: { deletedAt: new Date() } }); // objects kept until the retention purge
      await tx.documentAccessLog.create({ data: { documentId: id, userId: user.id, action: 'DELETE', ip: ctx.ip, userAgent: ctx.userAgent } });
      await this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action: 'document.delete', resourceType: 'Document', resourceId: id, metadata: { category: doc.category }, ...ctx }, tx);
    });
  }
}

/** Half-finished uploads are reachable only by the upload/complete flow; every other action sees completed documents only. */
function visibleFor(action: DocAction): Prisma.DocumentWhereInput {
  return action === 'upload' ? {} : completedOnly;
}
