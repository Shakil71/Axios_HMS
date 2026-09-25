'use client';

import { ApiError, api, uploadToStorage } from './api-client';
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, fmtBytes } from './labels';
import type { DocumentDto } from './types';

const EXT_TYPES: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', zip: 'application/zip', dcm: 'application/dicom' };

/** Some phones report an empty MIME type for HEIC photos; fall back to the extension. */
export const mimeOf = (f: File) => f.type || EXT_TYPES[f.name.split('.').pop()?.toLowerCase() ?? ''] || 'application/octet-stream';

export function validateFile(f: File, allowScanArchives = false): string | null {
  const allowed = allowScanArchives ? [...ALLOWED_UPLOAD_TYPES, 'application/zip', 'application/dicom'] : ALLOWED_UPLOAD_TYPES;
  if (!allowed.includes(mimeOf(f))) return 'This file type is not accepted. Please choose a PDF, JPG, PNG or HEIC file.';
  if (f.size === 0) return 'This file is empty.';
  if (f.size > MAX_UPLOAD_BYTES) return `This file is too large (${fmtBytes(f.size)}). The maximum is ${fmtBytes(MAX_UPLOAD_BYTES)}.`;
  return null;
}

interface Target {
  file: File;
  category?: string;
  caseId?: string;
  familyMemberId?: string;
  /** Set to upload a new version of an existing document. */
  documentId?: string;
}

/** request signed URL → send bytes straight to storage (with progress) → ask the API to verify and publish. */
export async function startUpload(t: Target, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<DocumentDto> {
  const meta = { fileName: t.file.name, mimeType: mimeOf(t.file), sizeBytes: t.file.size };
  const req = t.documentId
    ? await api<{ documentId: string; versionNo: number; upload: { url: string; method: string; headers: Record<string, string> } }>(`/documents/${t.documentId}/versions`, { method: 'POST', body: meta })
    : await api<{ documentId: string; versionNo: number; upload: { url: string; method: string; headers: Record<string, string> } }>('/documents/uploads', {
        method: 'POST',
        body: { ...meta, category: t.category, caseId: t.caseId, familyMemberId: t.familyMemberId },
      });
  await uploadToStorage(req.data.upload, t.file, onProgress, signal);
  const done = await api<DocumentDto>(`/documents/${req.data.documentId}/complete`, { method: 'POST', body: { versionNo: req.data.versionNo } });
  return done.data;
}

export const uploadErrorMessage = (e: unknown) => (e instanceof ApiError ? e.message : 'The upload failed. Please try again.');
