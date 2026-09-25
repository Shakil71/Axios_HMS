import * as argon2 from '@node-rs/argon2';
import { CasePriority, CaseStatus, DocumentCategory, PrismaClient, VisaStatus } from '@prisma/client';
import { createCipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { STATUS_LABELS } from '../cases/cases.schemas';
import { SENSITIVITY_BY_CATEGORY } from '../documents/documents.constants';
import { DirectoryRefs } from './seed-directory';

export const DEMO_PASSWORD_DEFAULT = 'Demo-Access-2026';

export interface DemoAccount { key: string; email: string; fullName: string; role: string; label: string; home: string }

/** Public on purpose: shown on the sign-in page of the DEMO environment only. */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { key: 'superadmin', email: 'superadmin@demo.hms.test', fullName: 'Sara Chowdhury', role: 'SUPER_ADMIN', label: 'Super admin', home: '/admin' },
  { key: 'admin', email: 'admin@demo.hms.test', fullName: 'Imran Hasan', role: 'ADMIN', label: 'Admin', home: '/admin' },
  { key: 'coordinator', email: 'coordinator@demo.hms.test', fullName: 'Nusrat Jahan', role: 'MEDICAL_COORDINATOR', label: 'Medical coordinator', home: '/staff' },
  { key: 'coordinator2', email: 'coordinator2@demo.hms.test', fullName: 'Tahmid Karim', role: 'MEDICAL_COORDINATOR', label: 'Medical coordinator (2)', home: '/staff' },
  { key: 'casemanager', email: 'casemanager@demo.hms.test', fullName: 'Rafiq Islam', role: 'CASE_MANAGER', label: 'Case manager', home: '/staff' },
  { key: 'visa', email: 'visa@demo.hms.test', fullName: 'Mehnaz Alam', role: 'VISA_OFFICER', label: 'Visa officer', home: '/staff' },
  { key: 'travel', email: 'travel@demo.hms.test', fullName: 'Sohel Rana', role: 'TRAVEL_COORDINATOR', label: 'Travel coordinator', home: '/staff' },
  { key: 'finance', email: 'finance@demo.hms.test', fullName: 'Farzana Haque', role: 'FINANCE', label: 'Finance officer', home: '/staff' },
  { key: 'doctor', email: 'doctor@demo.hms.test', fullName: 'Rohan Iyer', role: 'DOCTOR', label: 'Doctor (cardiology)', home: '/doctor' },
  { key: 'doctor2', email: 'doctor2@demo.hms.test', fullName: 'Ananya Sen', role: 'DOCTOR', label: 'Doctor (fertility)', home: '/doctor' },
  { key: 'doctor3', email: 'doctor3@demo.hms.test', fullName: 'Farid Rahman', role: 'DOCTOR', label: 'Doctor (neurosurgery)', home: '/doctor' },
  { key: 'patient', email: 'patient@demo.hms.test', fullName: 'Demo Patient', role: 'PATIENT', label: 'Patient', home: '/patient/dashboard' },
];

const PATIENTS = [
  { key: 'rahim', fullName: 'Rahim Uddin', city: 'Dhaka', gender: 'MALE' as const, born: 1968 },
  { key: 'nasrin', fullName: 'Nasrin Akter', city: 'Chattogram', gender: 'FEMALE' as const, born: 1991 },
  { key: 'karim', fullName: 'Karim Hossain', city: 'Sylhet', gender: 'MALE' as const, born: 1959 },
  { key: 'shirin', fullName: 'Shirin Sultana', city: 'Rajshahi', gender: 'FEMALE' as const, born: 1974 },
  { key: 'tanvir', fullName: 'Tanvir Ahmed', city: 'Khulna', gender: 'MALE' as const, born: 1982 },
  { key: 'farhana', fullName: 'Farhana Yasmin', city: 'Dhaka', gender: 'FEMALE' as const, born: 1966 },
  { key: 'mizan', fullName: 'Mizanur Rahman', city: 'Cumilla', gender: 'MALE' as const, born: 1955 },
  { key: 'sabina', fullName: 'Sabina Khatun', city: 'Dhaka', gender: 'FEMALE' as const, born: 1993 },
];

const DAY = 86_400_000;
const ago = (d: number, hour = 10) => { const t = new Date(Date.now() - d * DAY); t.setHours(hour, 0, 0, 0); return t; };
const ahead = (d: number, hour = 10) => ago(-d, hour);

/** A small but valid one-page PDF so "View" and "Download" open a real file in the demo. */
export function demoPdf(title: string, lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, '\\$&');
  const text = ['BT', '/F1 20 Tf', '72 740 Td', `(${esc(title)}) Tj`, '/F1 11 Tf', ...lines.flatMap((l) => ['0 -22 Td', `(${esc(l)}) Tj`]), 'ET'].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

function encryptField(plain: string): string | null {
  const b64 = process.env.FIELD_ENCRYPTION_KEY;
  if (!b64 || Buffer.from(b64, 'base64').length !== 32) return null;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', Buffer.from(b64, 'base64'), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [process.env.FIELD_ENCRYPTION_KEY_ID ?? 'v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

type DocState = 'UPLOADED' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED';
interface Appt { day: number; type: 'ONLINE_CONSULTATION' | 'HOSPITAL_CONSULTATION' | 'FOLLOW_UP' | 'DIAGNOSTIC' | 'SURGERY' | 'SECOND_OPINION'; method: 'VIDEO' | 'IN_PERSON' | 'PHONE'; status: 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'RESCHEDULED'; note?: string }
interface Scenario {
  patient: string; treatment: string; country: string; status: CaseStatus; priority?: CasePriority; age: number; doctor?: string;
  team?: Partial<Record<'mc' | 'cm' | 'visa' | 'travel' | 'fin', string>>; symptoms: string; docs?: [DocumentCategory, DocState][]; appts?: Appt[];
  visa?: VisaStatus; travel?: 'planned' | 'booked' | 'done'; invoices?: { items: [string, number][]; paid: number; due?: number; discount?: number }[]; notes?: [string, 'INTERNAL' | 'PATIENT_VISIBLE'][];
}

const SCENARIOS: Scenario[] = [
  { patient: 'patient', treatment: 'Coronary Artery Bypass (CABG)', country: 'India', status: 'TREATMENT_IN_PROGRESS', priority: 'HIGH', age: 78, doctor: 'dr-rohan-iyer',
    team: { mc: 'coordinator', cm: 'casemanager', visa: 'visa', travel: 'travel', fin: 'finance' }, symptoms: 'Chest pain when climbing stairs; two arteries narrowed on angiogram.',
    docs: [['PASSPORT', 'VERIFIED'], ['MEDICAL_REPORT', 'VERIFIED'], ['DIAGNOSTIC_REPORT', 'VERIFIED'], ['VISA', 'VERIFIED'], ['INSURANCE', 'VERIFIED']],
    appts: [{ day: -20, type: 'ONLINE_CONSULTATION', method: 'VIDEO', status: 'COMPLETED' }, { day: -6, type: 'HOSPITAL_CONSULTATION', method: 'IN_PERSON', status: 'COMPLETED' }, { day: 4, type: 'FOLLOW_UP', method: 'IN_PERSON', status: 'CONFIRMED', note: 'Bring your discharge summary.' }],
    visa: 'COMPLETED', travel: 'booked', invoices: [{ items: [['Treatment estimate (deposit)', 9000], ['Hospital coordination fee', 600], ['Hotel and transfers', 900]], paid: 6000, due: 12 }, { items: [['Service fee', 450]], paid: 450 }],
    notes: [['Patient is anxious about the surgery date; call the family before the pre-op visit.', 'INTERNAL'], ['Your pre-operative tests are complete. Surgery is planned for next week.', 'PATIENT_VISIBLE']] },
  { patient: 'patient', treatment: 'Spine Surgery', country: 'Malaysia', status: 'NEW', priority: 'HIGH', age: 2, symptoms: 'Lower back pain spreading to the left leg for three months.', docs: [['MRI', 'UPLOADED']] },
  { patient: 'rahim', treatment: 'Angioplasty & Stenting', country: 'India', status: 'APPOINTMENT', priority: 'HIGH', age: 30, doctor: 'dr-rohan-iyer', team: { mc: 'coordinator', cm: 'casemanager' },
    symptoms: 'Shortness of breath and chest tightness on exertion.', docs: [['PASSPORT', 'VERIFIED'], ['MEDICAL_REPORT', 'VERIFIED'], ['DIAGNOSTIC_REPORT', 'UNDER_REVIEW']],
    appts: [{ day: 2, type: 'ONLINE_CONSULTATION', method: 'VIDEO', status: 'CONFIRMED' }, { day: 6, type: 'SECOND_OPINION', method: 'VIDEO', status: 'REQUESTED' }], invoices: [{ items: [['Consultation coordination', 150]], paid: 0, due: 5 }] },
  { patient: 'rahim', treatment: 'Knee Replacement', country: 'Singapore', status: 'COMPLETED', age: 96, doctor: 'dr-daniel-weber', team: { mc: 'coordinator2', cm: 'casemanager', visa: 'visa', travel: 'travel', fin: 'finance' },
    symptoms: 'Severe right knee arthritis limiting walking.', docs: [['PASSPORT', 'VERIFIED'], ['XRAY', 'VERIFIED'], ['VISA', 'VERIFIED']], appts: [{ day: -60, type: 'ONLINE_CONSULTATION', method: 'VIDEO', status: 'COMPLETED' }, { day: -40, type: 'SURGERY', method: 'IN_PERSON', status: 'COMPLETED' }],
    visa: 'COMPLETED', travel: 'done', invoices: [{ items: [['Treatment package', 7800], ['Travel arrangements', 700]], paid: 8500 }] },
  { patient: 'nasrin', treatment: 'IVF Consultation', country: 'India', status: 'VISA_PROCESSING', age: 45, doctor: 'dr-ananya-sen', team: { mc: 'coordinator2', cm: 'casemanager', visa: 'visa', fin: 'finance' },
    symptoms: 'Trying to conceive for four years; looking for fertility assessment options.', docs: [['PASSPORT', 'VERIFIED'], ['MEDICAL_REPORT', 'VERIFIED'], ['PASSPORT_PHOTO', 'VERIFIED'], ['INSURANCE', 'UPLOADED']],
    appts: [{ day: -18, type: 'ONLINE_CONSULTATION', method: 'VIDEO', status: 'COMPLETED' }, { day: 12, type: 'HOSPITAL_CONSULTATION', method: 'IN_PERSON', status: 'CONFIRMED' }], visa: 'UNDER_PROCESSING',
    invoices: [{ items: [['Fertility assessment package', 3500]], paid: 1500, due: -4 }] },
  { patient: 'nasrin', treatment: 'Cancer Treatment Planning', country: 'Thailand', status: 'CANCELLED', age: 52, team: { mc: 'coordinator' }, symptoms: 'Second opinion requested; later decided to continue treatment locally.', docs: [['MEDICAL_REPORT', 'VERIFIED']] },
  { patient: 'karim', treatment: 'Spine Surgery', country: 'Malaysia', status: 'TRAVEL_PLANNING', priority: 'HIGH', age: 60, doctor: 'dr-farid-rahman', team: { mc: 'coordinator', cm: 'casemanager', visa: 'visa', travel: 'travel', fin: 'finance' },
    symptoms: 'Herniated disc with numbness in the right foot.', docs: [['PASSPORT', 'VERIFIED'], ['MRI', 'VERIFIED'], ['MEDICAL_REPORT', 'VERIFIED'], ['VISA', 'VERIFIED']],
    appts: [{ day: -30, type: 'ONLINE_CONSULTATION', method: 'VIDEO', status: 'COMPLETED' }, { day: -10, type: 'SECOND_OPINION', method: 'VIDEO', status: 'COMPLETED' }, { day: 11, type: 'HOSPITAL_CONSULTATION', method: 'IN_PERSON', status: 'CONFIRMED' }],
    visa: 'APPROVED', travel: 'booked', invoices: [{ items: [['Surgery deposit', 6500], ['Travel and stay', 1500]], paid: 4000, due: -3 }] },
  { patient: 'karim', treatment: 'Coronary Artery Bypass (CABG)', country: 'India', status: 'FOLLOW_UP', age: 84, doctor: 'dr-rohan-iyer', team: { mc: 'coordinator', cm: 'casemanager', travel: 'travel', fin: 'finance' },
    symptoms: 'Follow-up after bypass surgery.', docs: [['MEDICAL_REPORT', 'VERIFIED'], ['DIAGNOSTIC_REPORT', 'VERIFIED']], appts: [{ day: -35, type: 'SURGERY', method: 'IN_PERSON', status: 'COMPLETED' }, { day: 6, type: 'FOLLOW_UP', method: 'VIDEO', status: 'CONFIRMED' }],
    visa: 'COMPLETED', travel: 'done', invoices: [{ items: [['Treatment package', 10400]], paid: 10400 }] },
  { patient: 'shirin', treatment: 'Kidney Transplant Evaluation', country: 'Turkey', status: 'MEDICAL_REVIEW', priority: 'URGENT', age: 9, team: { mc: 'coordinator2', cm: 'casemanager' },
    symptoms: 'Kidney function has dropped sharply; on dialysis three times a week.', docs: [['BLOOD_TEST', 'UPLOADED'], ['MEDICAL_REPORT', 'UNDER_REVIEW'], ['PASSPORT', 'UPLOADED'], ['NID', 'REJECTED']],
    notes: [['Request the latest dialysis notes and the donor evaluation status.', 'INTERNAL'], ['Please upload a clearer photo of your NID card.', 'PATIENT_VISIBLE']] },
  { patient: 'shirin', treatment: 'Kidney Transplant Evaluation', country: 'Turkey', status: 'NEW', priority: 'URGENT', age: 0, symptoms: 'Adding a family member as potential donor.' },
  { patient: 'tanvir', treatment: 'Cataract Surgery', country: 'Singapore', status: 'DOCUMENT_COLLECTION', age: 6, team: { mc: 'coordinator' }, symptoms: 'Blurred vision in both eyes, worse at night.', docs: [['PASSPORT', 'UPLOADED'], ['PRESCRIPTION', 'UPLOADED']] },
  { patient: 'tanvir', treatment: 'Spine Surgery', country: 'Malaysia', status: 'DISCHARGE', age: 70, doctor: 'dr-farid-rahman', team: { mc: 'coordinator', cm: 'casemanager', visa: 'visa', travel: 'travel', fin: 'finance' },
    symptoms: 'Spinal stenosis surgery completed; preparing to return home.', docs: [['PASSPORT', 'VERIFIED'], ['MRI', 'VERIFIED'], ['VISA', 'VERIFIED']], appts: [{ day: -25, type: 'SURGERY', method: 'IN_PERSON', status: 'COMPLETED' }, { day: 3, type: 'FOLLOW_UP', method: 'IN_PERSON', status: 'CONFIRMED' }],
    visa: 'COMPLETED', travel: 'booked', invoices: [{ items: [['Treatment package', 9200]], paid: 7000, due: 8 }] },
  { patient: 'farhana', treatment: 'Cancer Treatment Planning', country: 'Thailand', status: 'DOCTOR_REVIEW', priority: 'HIGH', age: 14, doctor: 'dr-marcus-lindqvist', team: { mc: 'coordinator2', cm: 'casemanager' },
    symptoms: 'Recently diagnosed; seeking treatment plan and second opinion.', docs: [['MEDICAL_REPORT', 'VERIFIED'], ['CT_SCAN', 'VERIFIED'], ['BLOOD_TEST', 'VERIFIED'], ['PASSPORT', 'VERIFIED']],
    appts: [{ day: 5, type: 'SECOND_OPINION', method: 'VIDEO', status: 'REQUESTED' }] },
  { patient: 'farhana', treatment: 'Cataract Surgery', country: 'Turkey', status: 'NEW', age: 1, symptoms: 'Family member needs eye assessment.' },
  { patient: 'mizan', treatment: 'Knee Replacement', country: 'Singapore', status: 'HOSPITAL_SELECTION', age: 21, doctor: 'dr-daniel-weber', team: { mc: 'coordinator', cm: 'casemanager' },
    symptoms: 'Both knees painful; wants a single trip for surgery.', docs: [['PASSPORT', 'VERIFIED'], ['XRAY', 'VERIFIED'], ['MEDICAL_REPORT', 'VERIFIED']] },
  { patient: 'sabina', treatment: 'IVF Consultation', country: 'India', status: 'QUOTATION', age: 26, doctor: 'dr-ananya-sen', team: { mc: 'coordinator2', cm: 'casemanager', fin: 'finance' },
    symptoms: 'Wants a cost estimate and timeline for IVF.', docs: [['PASSPORT', 'VERIFIED'], ['MEDICAL_REPORT', 'VERIFIED']], appts: [{ day: -9, type: 'ONLINE_CONSULTATION', method: 'VIDEO', status: 'COMPLETED' }],
    invoices: [{ items: [['IVF cycle estimate', 2800]], paid: 0, due: 7 }] },
  { patient: 'sabina', treatment: 'IVF Consultation', country: 'India', status: 'COMPLETED', age: 120, doctor: 'dr-ananya-sen', team: { mc: 'coordinator2', cm: 'casemanager', fin: 'finance' },
    symptoms: 'Completed consultation cycle last quarter.', docs: [['MEDICAL_REPORT', 'VERIFIED']], appts: [{ day: -95, type: 'ONLINE_CONSULTATION', method: 'VIDEO', status: 'COMPLETED' }], invoices: [{ items: [['Consultation package', 900]], paid: 900 }] },
];

const CASE_FLOW: CaseStatus[] = ['NEW', 'DOCUMENT_COLLECTION', 'MEDICAL_REVIEW', 'DOCTOR_REVIEW', 'HOSPITAL_SELECTION', 'QUOTATION', 'APPOINTMENT', 'VISA_PROCESSING', 'TRAVEL_PLANNING', 'TREATMENT_IN_PROGRESS', 'DISCHARGE', 'RETURNING', 'FOLLOW_UP', 'COMPLETED'];
const REQUIREMENT_STATE: Record<string, 'MISSING' | 'SUBMITTED' | 'VERIFIED'> = { DOCUMENT_COLLECTION: 'MISSING', SUBMITTED: 'SUBMITTED', UNDER_PROCESSING: 'VERIFIED', ADDITIONAL_DOCUMENT_REQUIRED: 'SUBMITTED', APPROVED: 'VERIFIED', REJECTED: 'VERIFIED', COMPLETED: 'VERIFIED' };

export interface OperationsOptions { password: string; putObject?: (key: string, bytes: Buffer) => void }

/** Demo staff/doctor/patient accounts and a realistic operational history around them. */
export async function seedOperations(prisma: PrismaClient, refs: DirectoryRefs, opts: OperationsOptions) {
  if ((await prisma.user.count({ where: { email: 'admin@demo.hms.test' } })) > 0) return; // already seeded
  const passwordHash = await argon2.hash(opts.password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.name, r.id]));

  // ── accounts ──
  const users: Record<string, { id: string; fullName: string }> = {};
  let n = 0;
  for (const a of DEMO_ACCOUNTS) {
    const u = await prisma.user.create({
      data: {
        email: a.email, fullName: a.fullName, phone: `+8801700${String(100000 + ++n)}`, passwordHash, status: 'ACTIVE', emailVerifiedAt: ago(120), createdAt: ago(130 - n * 2), lastLoginAt: ago(n % 3),
        roles: { create: { roleId: roles.get(a.role)! } },
        ...(a.role === 'PATIENT' ? { patientProfile: { create: { city: 'Dhaka', gender: 'MALE', dateOfBirth: new Date('1980-03-14'), address: 'House 12, Road 5, Dhanmondi, Dhaka', emergencyContactName: 'Demo Relative', emergencyContactPhone: '+8801711000000', emergencyContactRelation: 'Sibling', passportNumberEnc: encryptField('BX1234567'), passportExpiry: new Date('2031-06-30'), nidNumberEnc: encryptField('1990123456789'), bloodGroup: 'B+' } } } : {}),
      },
    });
    users[a.key] = { id: u.id, fullName: a.fullName };
  }
  // link doctor accounts to the sample doctor profiles
  const doctorBySlug: Record<string, string> = {};
  for (const d of await prisma.doctor.findMany({ select: { id: true, slug: true } })) doctorBySlug[d.slug] = d.id;
  await prisma.doctor.update({ where: { id: doctorBySlug['dr-rohan-iyer'] }, data: { userId: users.doctor.id } });
  await prisma.doctor.update({ where: { id: doctorBySlug['dr-ananya-sen'] }, data: { userId: users.doctor2.id } });
  await prisma.doctor.update({ where: { id: doctorBySlug['dr-farid-rahman'] }, data: { userId: users.doctor3.id } });

  await prisma.doctor.updateMany({ where: { isDemo: true }, data: { verifiedById: users.admin.id, verifiedAt: new Date() } });
  const profileOf: Record<string, string> = { patient: (await prisma.patientProfile.findFirstOrThrow({ where: { userId: users.patient.id } })).id };
  const patientUser: Record<string, string> = { patient: users.patient.id };
  for (const [i, p] of PATIENTS.entries()) {
    const u = await prisma.user.create({
      data: {
        email: `${p.key}@demo.hms.test`, fullName: p.fullName, phone: `+8801800${String(100000 + i)}`, passwordHash, status: 'ACTIVE', emailVerifiedAt: ago(100 - i * 9), createdAt: ago(100 - i * 11),
        roles: { create: { roleId: roles.get('PATIENT')! } },
        patientProfile: { create: { city: p.city, gender: p.gender, dateOfBirth: new Date(`${p.born}-05-20`), createdAt: ago(100 - i * 11), emergencyContactName: 'Family contact', emergencyContactPhone: '+8801711999999' } },
      },
      include: { patientProfile: true },
    });
    profileOf[p.key] = u.patientProfile!.id;
    patientUser[p.key] = u.id;
    users[p.key] = { id: u.id, fullName: p.fullName };
  }

  const treatments = await prisma.treatment.findMany({ select: { id: true, name: true } });
  const treatmentId = (name: string) => treatments.find((t) => t.name === name)!.id;
  const visaRequirements = await prisma.visaRequirement.findMany({ orderBy: { sortOrder: 'asc' } });

  // ── cases ──
  let invoiceSeq = 0;
  for (const sc of SCENARIOS) {
    const created = ago(sc.age, 9);
    const [{ n: seq }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('case_number_seq') AS n`;
    const idx = CASE_FLOW.indexOf(sc.status === 'CANCELLED' ? 'MEDICAL_REVIEW' : sc.status);
    const team = sc.team ?? {};
    const teamIds = Object.values(team).map((k) => users[k!].id);
    const c = await prisma.medicalCase.create({
      data: {
        caseNumber: `MC-${new Date().getFullYear()}-${seq.toString().padStart(6, '0')}`, patientId: profileOf[sc.patient], treatmentId: treatmentId(sc.treatment),
        preferredCountryId: refs.countries[sc.country].id, preferredHospitalId: refs.hospitals[sc.country], selectedHospitalId: idx >= 4 ? refs.hospitals[sc.country] : null,
        selectedDoctorId: sc.doctor && idx >= 3 ? doctorBySlug[sc.doctor] : null, symptoms: sc.symptoms, priority: sc.priority ?? 'NORMAL', status: sc.status,
        preferredTravelDate: ahead(30 + (sc.age % 20)), budgetMin: 3000, budgetMax: 15000, budgetCurrency: 'USD', createdAt: created, updatedAt: ago(Math.max(0, Math.floor(sc.age / 6))),
        closedAt: sc.status === 'COMPLETED' ? ago(Math.max(1, Math.floor(sc.age * 0.15))) : sc.status === 'CANCELLED' ? ago(Math.max(1, sc.age - 8)) : null,
        assignments: { create: Object.entries(team).map(([slot, key]) => ({ staffId: users[key!].id, role: ({ mc: 'MEDICAL_COORDINATOR', cm: 'CASE_MANAGER', visa: 'VISA_OFFICER', travel: 'TRAVEL_COORDINATOR', fin: 'FINANCE' } as const)[slot as 'mc'], assignedAt: new Date(created.getTime() + DAY) })) },
      },
    });
    // selected doctor may have no assignment; make sure doctor-linked cases stay visible to the doctor account
    void teamIds;

    // timeline
    const actor = users[team.cm ?? team.mc ?? 'admin'].id;
    const span = Math.max(sc.age * 0.85, 0);
    const events: { type: 'CASE_CREATED' | 'STATUS_CHANGED' | 'COORDINATOR_ASSIGNED' | 'NOTE'; title: string; at: Date; toStatus?: CaseStatus; internal?: boolean; description?: string }[] = [{ type: 'CASE_CREATED', title: 'Your case was created', at: created, toStatus: 'NEW' }];
    if (Object.keys(team).length) events.push({ type: 'COORDINATOR_ASSIGNED', title: 'A medical coordinator was assigned to your case', at: new Date(created.getTime() + DAY), description: users[team.mc ?? team.cm!].fullName });
    for (let i = 1; i <= idx; i++) events.push({ type: 'STATUS_CHANGED', title: STATUS_LABELS[CASE_FLOW[i]], at: new Date(created.getTime() + (span * DAY * i) / Math.max(idx, 1)), toStatus: CASE_FLOW[i] });
    if (sc.status === 'CANCELLED') events.push({ type: 'STATUS_CHANGED', title: STATUS_LABELS.CANCELLED, at: ago(Math.max(1, sc.age - 8)), toStatus: 'CANCELLED', description: 'Cancelled by you.' });
    for (const e of events) await prisma.caseTimeline.create({ data: { caseId: c.id, type: e.type, title: e.title, description: e.description, visibility: 'PATIENT_VISIBLE', actorId: e.type === 'CASE_CREATED' ? patientUser[sc.patient] : actor, toStatus: e.toStatus, occurredAt: e.at, createdAt: e.at } });
    for (const [body, visibility] of sc.notes ?? []) {
      await prisma.caseNote.create({ data: { caseId: c.id, authorId: actor, body, visibility, createdAt: ago(Math.max(1, Math.floor(sc.age / 4))) } });
      await prisma.caseTimeline.create({ data: { caseId: c.id, type: 'NOTE', title: visibility === 'INTERNAL' ? 'Internal note added' : 'Update from our team', description: visibility === 'INTERNAL' ? null : body, visibility: visibility === 'INTERNAL' ? 'INTERNAL' : 'PATIENT_VISIBLE', actorId: actor, occurredAt: ago(Math.max(1, Math.floor(sc.age / 4))) } });
    }

    // documents (real PDFs so the demo can open them)
    if (opts.putObject) {
      for (const [k, [category, state]] of (sc.docs ?? []).entries()) {
        const bytes = demoPdf(`DEMO ${category.replace(/_/g, ' ')}`, ['This is a fictional document for the demo environment.', `Case ${c.caseNumber}`, 'No real patient data.']);
        const docId = randomUUID();
        const key = `docs/${docId}/1-${randomUUID()}`;
        opts.putObject(key, bytes);
        const uploadedAt = new Date(created.getTime() + (k + 1) * 0.3 * DAY);
        const verifier = users[team.mc ?? team.cm ?? 'admin'].id;
        await prisma.document.create({
          data: {
            id: docId, patientId: profileOf[sc.patient], caseId: c.id, category, sensitivity: SENSITIVITY_BY_CATEGORY[category], status: state, currentVersion: 1, createdAt: uploadedAt,
            rejectionReason: state === 'REJECTED' ? 'The photo is too dark to read. Please upload a clearer copy.' : null, verifiedAt: state === 'VERIFIED' ? new Date(uploadedAt.getTime() + 0.5 * DAY) : null, verifiedById: state === 'VERIFIED' ? verifier : null,
            expiresAt: category === 'PASSPORT' ? new Date('2031-06-30') : null,
            versions: { create: { versionNo: 1, storageKey: key, originalFileName: `${category.toLowerCase()}-${k + 1}.pdf`, mimeType: 'application/pdf', sizeBytes: BigInt(bytes.length), sha256: createHash('sha256').update(bytes).digest('hex'), scanStatus: 'SKIPPED', uploadedById: patientUser[sc.patient], completedAt: uploadedAt, createdAt: uploadedAt } },
          },
        });
      }
    }

    // appointments
    for (const a of sc.appts ?? []) {
      const doctorId = sc.doctor ? doctorBySlug[sc.doctor] : null;
      const at = a.day >= 0 ? ahead(a.day, 11 + (a.day % 4)) : ago(-a.day, 11);
      await prisma.appointment.create({
        data: {
          caseId: c.id, patientId: profileOf[sc.patient], doctorId, hospitalId: refs.hospitals[sc.country], scheduledAt: at, durationMinutes: 30, timezone: 'Asia/Kolkata', type: a.type, method: a.method, status: a.status,
          notes: a.note, internalNotes: a.status === 'COMPLETED' ? 'Consultation completed; summary added to the case.' : null, meetingUrl: a.method === 'VIDEO' && a.status !== 'COMPLETED' ? 'https://meet.example.test/demo-consultation' : null,
          createdById: users[team.mc ?? 'coordinator'].id, createdAt: new Date(at.getTime() - 5 * DAY),
        },
      });
    }

    // visa
    if (sc.visa) {
      const req = visaRequirements.filter((r) => r.countryId === refs.countries[sc.country].id);
      const state = REQUIREMENT_STATE[sc.visa] ?? 'MISSING';
      await prisma.visaCase.create({
        data: {
          caseId: c.id, patientId: profileOf[sc.patient], countryId: refs.countries[sc.country].id, status: sc.visa, officerId: users.visa.id, referenceNumber: sc.visa === 'DOCUMENT_COLLECTION' ? null : `VA-${String(c.caseNumber).slice(-6)}`,
          applicationDate: sc.visa === 'DOCUMENT_COLLECTION' ? null : ago(Math.max(3, sc.age / 3)), decisionDate: ['APPROVED', 'COMPLETED', 'REJECTED'].includes(sc.visa) ? ago(Math.max(1, sc.age / 5)) : null,
          expectedProcessingInfo: 'Usually 5 to 10 working days after submission.', patientRemarks: sc.visa === 'UNDER_PROCESSING' ? 'Your application is with the embassy. We will tell you as soon as there is news.' : sc.visa === 'APPROVED' ? 'Your visa was approved. Please collect your passport.' : null,
          internalRemarks: 'Invitation letter received from the hospital.', createdAt: ago(Math.max(4, sc.age / 2)),
          documents: { create: req.map((r, i) => ({ requirementId: r.id, status: state === 'MISSING' && i < 1 ? 'SUBMITTED' : state, remarks: state === 'MISSING' && i > 1 ? 'Please upload this document.' : null })) },
        },
      });
    }

    // travel
    if (sc.travel) {
      const base = sc.travel === 'done' ? -30 : sc.travel === 'booked' ? 9 : 25;
      const plan = await prisma.travelPlan.create({
        data: {
          caseId: c.id, travelerCount: 2, localCoordinatorName: 'Priya Nair (local coordinator)', localCoordinatorPhone: '+91 90000 00000', emergencyContactName: 'Hospital international desk', emergencyContactPhone: '+91 44 0000 0000',
          notes: 'One family member travels with the patient. Wheelchair assistance requested at the airport.',
        },
      });
      await prisma.flight.createMany({ data: [
        { travelPlanId: plan.id, direction: 'OUTBOUND', airline: 'Demo Airways', flightNumber: 'DA 412', departureAirport: 'Dhaka (DAC)', arrivalAirport: 'Chennai (MAA)', departureAt: base >= 0 ? ahead(base, 8) : ago(-base, 8), arrivalAt: base >= 0 ? ahead(base, 11) : ago(-base, 11), bookingReference: 'DEMO1A' },
        { travelPlanId: plan.id, direction: 'RETURN', airline: 'Demo Airways', flightNumber: 'DA 413', departureAirport: 'Chennai (MAA)', arrivalAirport: 'Dhaka (DAC)', departureAt: base + 21 >= 0 ? ahead(base + 21, 14) : ago(-(base + 21), 14), arrivalAt: base + 21 >= 0 ? ahead(base + 21, 17) : ago(-(base + 21), 17), bookingReference: 'DEMO1B' },
      ] });
      await prisma.hotel.create({ data: { travelPlanId: plan.id, name: 'Demo Residency near the hospital', address: '12 Sample Street, near the hospital', phone: '+91 44 0000 1111', checkInDate: base >= 0 ? ahead(base) : ago(-base), checkOutDate: base + 21 >= 0 ? ahead(base + 21) : ago(-(base + 21)), bookingReference: 'HTL-DEMO-77', roomInfo: 'Twin room, ground floor' } });
      await prisma.transport.createMany({ data: [
        { travelPlanId: plan.id, type: 'AIRPORT_PICKUP', pickupLocation: 'Chennai airport arrivals', dropLocation: 'Hotel', scheduledAt: base >= 0 ? ahead(base, 12) : ago(-base, 12), driverName: 'Selvam', driverPhone: '+91 90000 11111', vehicleInfo: 'White sedan, TN 09 DEMO 0001' },
        { travelPlanId: plan.id, type: 'AIRPORT_DROP', pickupLocation: 'Hotel', dropLocation: 'Chennai airport departures', scheduledAt: base + 21 >= 0 ? ahead(base + 21, 10) : ago(-(base + 21), 10), driverName: 'Selvam', driverPhone: '+91 90000 11111' },
      ] });
    }

    // invoices & payments
    for (const inv of sc.invoices ?? []) {
      const [{ n: iseq }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('invoice_number_seq') AS n`;
      const subtotal = inv.items.reduce((s, [, amt]) => s + amt, 0);
      const issued = ago(Math.max(2, sc.age / 2));
      const status = inv.paid <= 0 ? 'PENDING' : inv.paid >= subtotal ? 'PAID' : 'PARTIAL';
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-${new Date().getFullYear()}-${iseq.toString().padStart(6, '0')}`, caseId: c.id, patientId: profileOf[sc.patient], currency: 'USD', subtotal, total: subtotal, status, issuedAt: issued,
          dueDate: inv.due === undefined ? null : inv.due >= 0 ? ahead(inv.due) : ago(-inv.due), createdById: users.finance.id, createdAt: issued,
          items: { create: inv.items.map(([description, amount]) => ({ description, quantity: 1, unitPrice: amount, amount })) },
        },
      });
      invoiceSeq++;
      if (inv.paid > 0) {
        const parts = inv.paid >= subtotal ? [inv.paid] : [Math.round(inv.paid * 0.6), inv.paid - Math.round(inv.paid * 0.6)];
        for (const [i, amt] of parts.entries()) {
          await prisma.payment.create({ data: { invoiceId: invoice.id, amount: amt, currency: 'USD', method: (['BANK_TRANSFER', 'MOBILE_BANKING', 'CARD'] as const)[(invoiceSeq + i) % 3], provider: 'manual', transactionId: `TXN-${randomUUID().slice(0, 8).toUpperCase()}`, status: 'SUCCEEDED', paidAt: new Date(issued.getTime() + (i + 1) * 3 * DAY), receiptNumber: `RCT-${invoice.invoiceNumber.slice(4)}-${i + 1}`, recordedById: users.finance.id, createdAt: new Date(issued.getTime() + (i + 1) * 3 * DAY) } });
        }
      }
    }
  }

  // ── notifications ──
  const note = (userKey: string, type: 'DOCUMENT_VERIFIED' | 'APPOINTMENT_CONFIRMED' | 'CASE_STATUS_CHANGED' | 'PAYMENT_RECEIVED' | 'DOCUMENT_UPLOADED' | 'NEW_MESSAGE' | 'MISSING_DOCUMENT' | 'VISA_STATUS_CHANGED' | 'SYSTEM', title: string, body: string | null, dayAgo: number, read: boolean) =>
    prisma.notification.create({ data: { userId: users[userKey].id, type, title, body, createdAt: ago(dayAgo, 15), readAt: read ? ago(dayAgo, 16) : null, deliveries: { create: [{ channel: 'IN_APP', status: 'SENT', provider: 'in-app', sentAt: ago(dayAgo, 15) }] } } });
  await Promise.all([
    note('patient', 'APPOINTMENT_CONFIRMED', 'Appointment confirmed', 'Your follow-up consultation is confirmed.', 0, false),
    note('patient', 'PAYMENT_RECEIVED', 'Payment received', 'USD 450 · receipt shown in your payments page', 2, false),
    note('patient', 'DOCUMENT_VERIFIED', 'Passport verified', null, 5, true),
    note('patient', 'CASE_STATUS_CHANGED', 'Your treatment is in progress', 'Your care team will keep you updated.', 9, true),
    note('patient', 'VISA_STATUS_CHANGED', 'Your visa process is complete', null, 40, true),
    note('coordinator', 'DOCUMENT_UPLOADED', 'Blood test report uploaded', 'Waiting for review', 0, false),
    note('coordinator', 'SYSTEM', 'A case was assigned to you', 'You are the medical coordinator for this case.', 1, false),
    note('coordinator', 'DOCUMENT_UPLOADED', 'Passport uploaded', 'Waiting for review', 3, true),
    note('casemanager', 'SYSTEM', 'A case was assigned to you', 'You are the case manager for this case.', 2, false),
    note('visa', 'VISA_STATUS_CHANGED', 'A visa application needs attention', 'Additional document requested', 1, false),
    note('finance', 'PAYMENT_RECEIVED', 'Payment recorded', 'USD 450', 2, true),
    note('doctor', 'SYSTEM', 'New appointment on your schedule', 'A follow-up was confirmed.', 0, false),
    note('doctor', 'SYSTEM', 'A patient shared reports with you', 'Diagnostic report ready to review.', 2, false),
    note('admin', 'SYSTEM', 'Weekly summary is ready', 'Open Reports to review this week.', 1, false),
  ]);

  // ── audit trail ──
  const actors = ['admin', 'coordinator', 'coordinator2', 'casemanager', 'visa', 'travel', 'finance', 'doctor', 'patient', 'rahim', 'karim'];
  const actions: [string, string][] = [['auth.login', 'User'], ['case.view', 'MedicalCase'], ['case.status', 'MedicalCase'], ['document.download', 'Document'], ['document.upload', 'Document'], ['document.verify', 'Document'], ['appointment.create', 'Appointment'], ['visa.update', 'VisaCase'], ['payment.create', 'Invoice'], ['patient.view', 'PatientProfile'], ['travel.update', 'TravelPlan'], ['case.note', 'MedicalCase']];
  let x = 7;
  const rnd = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const roleOf = (k: string) => DEMO_ACCOUNTS.find((a) => a.key === k)?.role ?? 'PATIENT';
  await prisma.auditLog.createMany({
    data: Array.from({ length: 140 }, () => {
      const k = actors[Math.floor(rnd() * actors.length)];
      const [action, resourceType] = k === 'patient' || k === 'rahim' || k === 'karim' ? (rnd() > 0.5 ? actions[0] : actions[4]) : actions[Math.floor(rnd() * actions.length)];
      const at = new Date(Date.now() - rnd() * 30 * DAY);
      return { actorId: users[k].id, actorRole: roleOf(k), action, resourceType, resourceId: randomUUID(), ip: `103.${Math.floor(rnd() * 200)}.${Math.floor(rnd() * 250)}.${Math.floor(rnd() * 250)}`, userAgent: 'Mozilla/5.0 (demo)', createdAt: at };
    }),
  });

  // ── settings ──
  for (const [key, value, isPublic, description] of [
    ['upload.maxMegabytes', '15', false, 'Largest file a patient may upload'], ['retention.documentMonths', '84', false, 'How long documents are kept after a case closes'],
    ['case.autoAssign', 'off', false, 'Automatically assign new cases to the least busy coordinator'], ['notifications.email', 'on', false, 'Send e-mail copies of important notifications'],
  ] as [string, string, boolean, string][]) {
    await prisma.systemSetting.upsert({ where: { key }, update: {}, create: { key, value, isPublic, description } });
  }
}
