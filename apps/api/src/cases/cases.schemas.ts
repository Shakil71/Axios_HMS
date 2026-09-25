import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).nullish();

const STATUSES = [
  'NEW', 'DOCUMENT_COLLECTION', 'MEDICAL_REVIEW', 'DOCTOR_REVIEW', 'HOSPITAL_SELECTION', 'QUOTATION', 'APPOINTMENT',
  'VISA_PROCESSING', 'TRAVEL_PLANNING', 'TREATMENT_IN_PROGRESS', 'DISCHARGE', 'RETURNING', 'FOLLOW_UP', 'COMPLETED', 'CANCELLED',
] as const;
export const caseStatusSchema = z.enum(STATUSES);
const prioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

const patientFields = {
  familyMemberId: z.uuid().nullish(),
  treatmentId: z.uuid().nullish(),
  preferredCountryId: z.uuid().nullish(),
  preferredHospitalId: z.uuid().nullish(),
  symptoms: optText(4000),
  medicalHistory: optText(4000),
  currentDiagnosis: optText(2000),
  previousTreatment: optText(4000),
  currentMedications: optText(2000),
  emergencyInformation: optText(2000),
  preferredTravelDate: z.coerce.date().nullish(),
  budgetMin: z.coerce.number().nonnegative().max(1e9).nullish(),
  budgetMax: z.coerce.number().nonnegative().max(1e9).nullish(),
  budgetCurrency: z.string().length(3).toUpperCase().nullish(),
};

const budgetOk = (v: { budgetMin?: number | null; budgetMax?: number | null }) =>
  v.budgetMin == null || v.budgetMax == null || v.budgetMin <= v.budgetMax;

export const createCaseSchema = z.object(patientFields).strict().refine(budgetOk, { path: ['budgetMax'], message: 'Maximum budget must be at least the minimum.' });

export const updateCaseSchema = z
  .object({
    ...patientFields,
    // staff-only (ignored/rejected for patients in the service)
    priority: prioritySchema,
    selectedDoctorId: z.uuid().nullable(),
    selectedHospitalId: z.uuid().nullable(),
  })
  .partial()
  .strict()
  .refine(budgetOk, { path: ['budgetMax'], message: 'Maximum budget must be at least the minimum.' });

export const changeStatusSchema = z.object({ status: caseStatusSchema, message: text(1000).optional() }).strict();

export const createNoteSchema = z.object({ body: text(4000).min(1), visibility: z.enum(['INTERNAL', 'PATIENT_VISIBLE']).default('INTERNAL') }).strict();

export const assignSchema = z
  .object({ staffId: z.uuid(), role: z.enum(['MEDICAL_COORDINATOR', 'CASE_MANAGER', 'VISA_OFFICER', 'TRAVEL_COORDINATOR', 'FINANCE']) })
  .strict();

export const listCasesQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: caseStatusSchema.optional(),
  priority: prioritySchema.optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['createdAt', '-createdAt', 'updatedAt', '-updatedAt']).optional(),
});

export const TERMINAL = ['COMPLETED', 'CANCELLED'] as const;
export const PATIENT_CAN_EDIT_UNTIL = ['NEW', 'DOCUMENT_COLLECTION'] as const;
export const PATIENT_CAN_CANCEL = ['NEW', 'DOCUMENT_COLLECTION', 'MEDICAL_REVIEW', 'DOCTOR_REVIEW', 'HOSPITAL_SELECTION', 'QUOTATION', 'APPOINTMENT'] as const;

/** Plain-language labels shown to patients in the "Treatment Journey". */
export const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  NEW: 'We received your request',
  DOCUMENT_COLLECTION: 'We are collecting your documents',
  MEDICAL_REVIEW: 'Our medical team is reviewing your case',
  DOCTOR_REVIEW: 'A doctor is reviewing your information',
  HOSPITAL_SELECTION: 'We are selecting a hospital',
  QUOTATION: 'Your treatment estimate is being prepared',
  APPOINTMENT: 'Your appointment is being arranged',
  VISA_PROCESSING: 'Your visa is being processed',
  TRAVEL_PLANNING: 'Your travel is being planned',
  TREATMENT_IN_PROGRESS: 'Your treatment is in progress',
  DISCHARGE: 'Discharge is being arranged',
  RETURNING: 'Your return journey is being arranged',
  FOLLOW_UP: 'Follow-up care',
  COMPLETED: 'Your case is complete',
  CANCELLED: 'Your case was cancelled',
};
