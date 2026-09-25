import { DocumentCategory, DocumentSensitivity, DocumentStatus } from '@prisma/client';
import { Sensitivity } from '../rbac/permissions';

/**
 * Category → sensitivity class. Sensitivity decides which staff permission is needed
 * (documents.<action>.<sensitivity>), so Finance/Travel/Visa never get medical reports by accident.
 * OTHER is treated as MEDICAL: unknown uploads default to the most protected common class.
 */
export const SENSITIVITY_BY_CATEGORY: Record<DocumentCategory, DocumentSensitivity> = {
  NID: 'IDENTITY', PASSPORT: 'IDENTITY', PASSPORT_PHOTO: 'IDENTITY',
  MEDICAL_REPORT: 'MEDICAL', PRESCRIPTION: 'MEDICAL', DIAGNOSTIC_REPORT: 'MEDICAL', CT_SCAN: 'MEDICAL', MRI: 'MEDICAL',
  XRAY: 'MEDICAL', BLOOD_TEST: 'MEDICAL', PREVIOUS_TREATMENT_RECORD: 'MEDICAL', DOCTOR_REFERRAL: 'MEDICAL', OTHER: 'MEDICAL',
  VISA: 'TRAVEL', FLIGHT: 'TRAVEL', HOTEL: 'TRAVEL',
  INSURANCE: 'FINANCIAL',
};

export const toSensitivityKey = (s: DocumentSensitivity) => s.toLowerCase() as Sensitivity;

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  NID: 'NID card', PASSPORT: 'passport', VISA: 'visa', PASSPORT_PHOTO: 'passport photo', MEDICAL_REPORT: 'medical report',
  PRESCRIPTION: 'prescription', DIAGNOSTIC_REPORT: 'diagnostic report', CT_SCAN: 'CT scan', MRI: 'MRI scan', XRAY: 'X-ray',
  BLOOD_TEST: 'blood test report', PREVIOUS_TREATMENT_RECORD: 'previous treatment record', DOCTOR_REFERRAL: 'doctor referral',
  INSURANCE: 'insurance document', FLIGHT: 'flight document', HOTEL: 'hotel document', OTHER: 'document',
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  UPLOADED: 'Uploaded',
  UNDER_REVIEW: 'Waiting for our team to review',
  VERIFIED: 'Verified',
  REJECTED: 'Please upload a new copy',
  EXPIRED: 'Expired',
};

const BASE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const SCAN_TYPES = [...BASE_TYPES, 'application/zip', 'application/dicom'];

export const allowedMimeTypes = (category: DocumentCategory) =>
  category === 'CT_SCAN' || category === 'MRI' || category === 'XRAY' ? SCAN_TYPES : BASE_TYPES;

/** Detects a file's real type from its leading bytes; declared Content-Type is never trusted. */
export function detectMime(buf: Buffer): string | null {
  if (buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.length >= 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  }
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'application/zip';
  if (buf.length >= 132 && buf.subarray(128, 132).toString('latin1') === 'DICM') return 'application/dicom';
  return null;
}

/** heif/heic are the same container family for our purposes. */
export const mimeMatches = (declared: string, detected: string) =>
  declared === detected || (detected === 'image/heic' && declared === 'image/heif');

export function sanitizeFileName(name: string) {
  const cleaned = name
    .replace(/[\\/\u0000-\u001f\u007f"<>|:*?]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return (cleaned || 'document').slice(-150);
}
