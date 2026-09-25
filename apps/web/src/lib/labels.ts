export const flagEmoji = (iso: string) =>
  iso.length === 2 ? String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🏳️';

export const initials = (name: string) =>
  name.replace(/^(dr|prof)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d)) : '—';

export const fmtDateTime = (d: string | Date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d));

export const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export const QUALIFICATION_LABELS: Record<string, string> = {
  DEGREE: 'Education', CERTIFICATION: 'Certifications', MEMBERSHIP: 'Memberships', PUBLICATION: 'Publications', AWARD: 'Awards', EXPERTISE: 'Areas of expertise',
};

export const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  ONLINE_CONSULTATION: 'Online consultation', HOSPITAL_CONSULTATION: 'Hospital consultation', FOLLOW_UP: 'Follow-up',
  DIAGNOSTIC: 'Diagnostic', SURGERY: 'Surgery', SECOND_OPINION: 'Second opinion',
};

export const RELATIONSHIPS = [
  ['SPOUSE', 'Spouse'], ['FATHER', 'Father'], ['MOTHER', 'Mother'], ['SON', 'Son'], ['DAUGHTER', 'Daughter'], ['BROTHER', 'Brother'],
  ['SISTER', 'Sister'], ['GRANDPARENT', 'Grandparent'], ['RELATIVE', 'Other relative'], ['OTHER', 'Other'],
] as const;

export const GENDERS = [['MALE', 'Male'], ['FEMALE', 'Female'], ['OTHER', 'Other'], ['UNSPECIFIED', 'Prefer not to say']] as const;

/** The patient-facing "Treatment Journey". Each step is reached once the case status is at or beyond `status`. */
export const JOURNEY_STEPS = [
  { status: 'NEW', label: 'Request received' },
  { status: 'DOCUMENT_COLLECTION', label: 'Documents submitted' },
  { status: 'MEDICAL_REVIEW', label: 'Case review' },
  { status: 'DOCTOR_REVIEW', label: 'Doctor selected' },
  { status: 'HOSPITAL_SELECTION', label: 'Hospital selected' },
  { status: 'QUOTATION', label: 'Estimate ready' },
  { status: 'APPOINTMENT', label: 'Appointment confirmed' },
  { status: 'VISA_PROCESSING', label: 'Visa processing' },
  { status: 'TRAVEL_PLANNING', label: 'Travel planning' },
  { status: 'TREATMENT_IN_PROGRESS', label: 'Treatment' },
  { status: 'DISCHARGE', label: 'Discharge' },
  { status: 'RETURNING', label: 'Return journey' },
  { status: 'FOLLOW_UP', label: 'Follow-up' },
] as const;

export const CASE_STATUS_ORDER = [...JOURNEY_STEPS.map((s) => s.status), 'COMPLETED'] as string[];

export const DOCUMENT_CATEGORIES: { value: string; label: string; hint?: string; scan?: boolean }[] = [
  { value: 'PASSPORT', label: 'Passport', hint: 'The page with your photo and details' },
  { value: 'NID', label: 'NID card' },
  { value: 'PASSPORT_PHOTO', label: 'Passport-size photo' },
  { value: 'MEDICAL_REPORT', label: 'Medical reports' },
  { value: 'PRESCRIPTION', label: 'Prescription' },
  { value: 'DIAGNOSTIC_REPORT', label: 'Diagnostic report' },
  { value: 'BLOOD_TEST', label: 'Blood test report' },
  { value: 'XRAY', label: 'X-ray', scan: true },
  { value: 'CT_SCAN', label: 'CT scan', scan: true },
  { value: 'MRI', label: 'MRI scan', scan: true },
  { value: 'PREVIOUS_TREATMENT_RECORD', label: 'Previous treatment record' },
  { value: 'DOCTOR_REFERRAL', label: 'Doctor referral' },
  { value: 'INSURANCE', label: 'Insurance document' },
  { value: 'VISA', label: 'Visa' },
  { value: 'FLIGHT', label: 'Flight document' },
  { value: 'HOTEL', label: 'Hotel document' },
  { value: 'OTHER', label: 'Other document' },
];

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export const documentTone = (status: string): Tone =>
  status === 'VERIFIED' ? 'success' : status === 'REJECTED' || status === 'EXPIRED' ? 'danger' : status === 'UNDER_REVIEW' ? 'warning' : 'info';

export const caseTone = (status: string): Tone =>
  status === 'COMPLETED' ? 'success' : status === 'CANCELLED' ? 'neutral' : 'info';

export const ALLOWED_UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
