import type { Tone } from './labels';

/** Plain, staff-facing labels and colours for every status shown in the dashboards. */
type Entry = { label: string; tone: Tone };
const map = (o: Record<string, [string, Tone]>): Record<string, Entry> => Object.fromEntries(Object.entries(o).map(([k, [label, tone]]) => [k, { label, tone }]));

export const CASE_STATUS = map({
  NEW: ['New', 'info'], DOCUMENT_COLLECTION: ['Collecting documents', 'info'], MEDICAL_REVIEW: ['Medical review', 'warning'], DOCTOR_REVIEW: ['Doctor review', 'warning'],
  HOSPITAL_SELECTION: ['Hospital selection', 'info'], QUOTATION: ['Quotation', 'info'], APPOINTMENT: ['Appointment', 'info'], VISA_PROCESSING: ['Visa processing', 'warning'],
  TRAVEL_PLANNING: ['Travel planning', 'info'], TREATMENT_IN_PROGRESS: ['In treatment', 'success'], DISCHARGE: ['Discharge', 'success'], RETURNING: ['Returning', 'info'],
  FOLLOW_UP: ['Follow-up', 'success'], COMPLETED: ['Completed', 'success'], CANCELLED: ['Cancelled', 'neutral'],
});
export const CASE_STATUS_ORDER_LIST = Object.keys(CASE_STATUS);
export const PRIORITY = map({ LOW: ['Low', 'neutral'], NORMAL: ['Normal', 'neutral'], HIGH: ['High', 'warning'], URGENT: ['Urgent', 'danger'] });
export const DOC_STATUS = map({ UPLOADED: ['Uploaded', 'info'], UNDER_REVIEW: ['Under review', 'warning'], VERIFIED: ['Verified', 'success'], REJECTED: ['Rejected', 'danger'], EXPIRED: ['Expired', 'danger'] });
export const APPT_STATUS = map({ REQUESTED: ['Requested', 'warning'], CONFIRMED: ['Confirmed', 'success'], RESCHEDULED: ['Rescheduled', 'info'], COMPLETED: ['Completed', 'neutral'], CANCELLED: ['Cancelled', 'neutral'], NO_SHOW: ['Missed', 'danger'] });
export const VISA_STATUS = map({
  DOCUMENT_COLLECTION: ['Collecting documents', 'info'], SUBMITTED: ['Submitted', 'info'], UNDER_PROCESSING: ['Processing', 'warning'], ADDITIONAL_DOCUMENT_REQUIRED: ['Needs document', 'danger'],
  APPROVED: ['Approved', 'success'], REJECTED: ['Rejected', 'danger'], COMPLETED: ['Completed', 'success'],
});
export const VISA_ITEM = map({ MISSING: ['Missing', 'danger'], SUBMITTED: ['Submitted', 'warning'], VERIFIED: ['Verified', 'success'], REJECTED: ['Rejected', 'danger'] });
export const INVOICE_STATUS = map({ PENDING: ['Unpaid', 'warning'], PARTIAL: ['Part paid', 'info'], PAID: ['Paid', 'success'], REFUNDED: ['Refunded', 'neutral'], CANCELLED: ['Cancelled', 'neutral'] });
export const USER_STATUS = map({ ACTIVE: ['Active', 'success'], PENDING_VERIFICATION: ['Unverified', 'warning'], SUSPENDED: ['Suspended', 'danger'], DISABLED: ['Disabled', 'neutral'] });

export const APPT_TYPE: Record<string, string> = { ONLINE_CONSULTATION: 'Online consultation', HOSPITAL_CONSULTATION: 'Hospital consultation', FOLLOW_UP: 'Follow-up', DIAGNOSTIC: 'Diagnostic', SURGERY: 'Surgery', SECOND_OPINION: 'Second opinion' };
export const METHOD: Record<string, string> = { VIDEO: 'Video', IN_PERSON: 'In person', PHONE: 'Phone' };
export const STAFF_ROLE_ON_CASE: Record<string, string> = { MEDICAL_COORDINATOR: 'Medical coordinator', CASE_MANAGER: 'Case manager', VISA_OFFICER: 'Visa officer', TRAVEL_COORDINATOR: 'Travel coordinator', FINANCE: 'Finance' };
export const DOC_CATEGORY: Record<string, string> = {
  NID: 'NID card', PASSPORT: 'Passport', VISA: 'Visa', PASSPORT_PHOTO: 'Passport photo', MEDICAL_REPORT: 'Medical report', PRESCRIPTION: 'Prescription', DIAGNOSTIC_REPORT: 'Diagnostic report',
  CT_SCAN: 'CT scan', MRI: 'MRI scan', XRAY: 'X-ray', BLOOD_TEST: 'Blood test', PREVIOUS_TREATMENT_RECORD: 'Previous treatment', DOCTOR_REFERRAL: 'Doctor referral',
  INSURANCE: 'Insurance', FLIGHT: 'Flight document', HOTEL: 'Hotel document', OTHER: 'Other',
};

export const entry = (m: Record<string, Entry>, key: string | null | undefined): Entry => (key ? m[key] : undefined) ?? { label: key ?? '—', tone: 'neutral' };

export const money = (amount: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
export const compactMoney = (amount: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(amount);

export const relTime = (d: string | Date) => {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  const abs = Math.abs(s);
  const [n, unit] = abs < 60 ? [abs, 'second'] : abs < 3600 ? [Math.round(abs / 60), 'minute'] : abs < 86400 ? [Math.round(abs / 3600), 'hour'] : [Math.round(abs / 86400), 'day'];
  const txt = `${n} ${unit}${n === 1 ? '' : 's'}`;
  return abs < 45 ? 'just now' : s >= 0 ? `${txt} ago` : `in ${txt}`;
};
export const fmtWhen = (d: string | Date) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
export const fmtDay = (d: string | Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(d));
