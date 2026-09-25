import { z } from 'zod';

const opt = <T extends z.ZodType>(s: T) => s.nullish();
const text = (max: number) => z.string().trim().max(max);
const phone = z.string().trim().regex(/^\+?[0-9]{8,15}$/, 'Enter a phone number with country code.');
const passportNumber = z.string().trim().regex(/^[A-Za-z0-9]{6,12}$/, 'Enter the passport number exactly as printed.');
const nidNumber = z.string().trim().regex(/^[0-9]{10,17}$/, 'Enter your NID number (10, 13 or 17 digits).');
const gender = z.enum(['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']);

export const updateProfileSchema = z
  .object({
    fullName: text(100).min(2),
    dateOfBirth: opt(z.coerce.date().max(new Date(), 'Date of birth cannot be in the future.')),
    gender,
    countryId: opt(z.uuid()),
    city: opt(text(100)),
    address: opt(text(300)),
    emergencyContactName: opt(text(100)),
    emergencyContactPhone: opt(phone),
    emergencyContactRelation: opt(text(50)),
    passportNumber: opt(passportNumber),
    passportExpiry: opt(z.coerce.date()),
    nidNumber: opt(nidNumber),
    bloodGroup: opt(z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])),
    allergies: opt(text(1000)),
    chronicConditions: opt(text(1000)),
    preferredLanguage: opt(text(50)),
    notifyEmail: z.boolean(),
    notifySms: z.boolean(),
    notifyWhatsapp: z.boolean(),
  })
  .partial()
  .strict();

const familyBase = {
  fullName: text(100).min(2),
  relationship: z.enum(['SPOUSE', 'FATHER', 'MOTHER', 'SON', 'DAUGHTER', 'BROTHER', 'SISTER', 'GRANDPARENT', 'RELATIVE', 'OTHER']),
  dateOfBirth: opt(z.coerce.date().max(new Date(), 'Date of birth cannot be in the future.')),
  gender,
  phone: opt(phone),
  passportNumber: opt(passportNumber),
  passportExpiry: opt(z.coerce.date()),
  nidNumber: opt(nidNumber),
  medicalNotes: opt(text(2000)),
};

export const createFamilyMemberSchema = z.object(familyBase).partial({ dateOfBirth: true, gender: true, phone: true, passportNumber: true, passportExpiry: true, nidNumber: true, medicalNotes: true }).strict();
export const updateFamilyMemberSchema = z.object(familyBase).partial().strict();

export const listPatientsQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(100).optional(),
});
