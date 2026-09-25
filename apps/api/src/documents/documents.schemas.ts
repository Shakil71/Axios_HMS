import { z } from 'zod';

const CATEGORIES = [
  'NID', 'PASSPORT', 'VISA', 'PASSPORT_PHOTO', 'MEDICAL_REPORT', 'PRESCRIPTION', 'DIAGNOSTIC_REPORT', 'CT_SCAN', 'MRI', 'XRAY',
  'BLOOD_TEST', 'PREVIOUS_TREATMENT_RECORD', 'DOCTOR_REFERRAL', 'INSURANCE', 'FLIGHT', 'HOTEL', 'OTHER',
] as const;
export const categorySchema = z.enum(CATEGORIES);

const file = {
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().toLowerCase().max(100),
  sizeBytes: z.number().int().positive(),
};

export const requestUploadSchema = z
  .object({
    category: categorySchema,
    ...file,
    caseId: z.uuid().optional(),
    familyMemberId: z.uuid().optional(),
    title: z.string().trim().max(150).optional(),
    expiresAt: z.coerce.date().optional(),
  })
  .strict();

export const requestVersionSchema = z.object(file).strict();

export const completeSchema = z.object({ versionNo: z.number().int().positive().optional() }).strict();

export const downloadSchema = z
  .object({
    versionNo: z.number().int().positive().optional(),
    purpose: z.enum(['view', 'download']).default('download'),
  })
  .strict();

export const verifySchema = z
  .object({ decision: z.enum(['UNDER_REVIEW', 'VERIFIED', 'REJECTED']), reason: z.string().trim().max(500).optional() })
  .strict()
  .refine((v) => v.decision !== 'REJECTED' || !!v.reason, { path: ['reason'], message: 'Please tell the patient what to fix.' });

export const listDocumentsQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  caseId: z.uuid().optional(),
  patientId: z.uuid().optional(),
  familyMemberId: z.uuid().optional(),
  category: categorySchema.optional(),
  status: z.enum(['UPLOADED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED']).optional(),
});
