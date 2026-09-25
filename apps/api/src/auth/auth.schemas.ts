import { z } from 'zod';

const COMMON_PASSWORDS = new Set([
  'password123', 'password1234', '1234567890', 'qwertyuiop', 'iloveyou123', 'welcome1234',
  'admin12345', 'letmein1234', 'bangladesh1', 'bangladesh123', 'passw0rd123',
]);

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(128, 'Use at most 128 characters.')
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), 'This password is too common.')
  .refine((p) => new Set(p).size >= 5, 'Use a more varied password.');

export const emailSchema = z.email('Enter a valid email address.').max(254).transform((e) => e.trim().toLowerCase());

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{8,15}$/, 'Enter your mobile number with country code, e.g. +8801XXXXXXXXX');

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    dateOfBirth: z.coerce.date().max(new Date(), 'Date of birth cannot be in the future.').optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']).optional(),
    countryId: z.uuid().optional(),
    city: z.string().trim().max(100).optional(),
    address: z.string().trim().max(300).optional(),
    emergencyContactName: z.string().trim().max(100).optional(),
    emergencyContactPhone: phoneSchema.optional(),
    captchaToken: z.string().optional(),
  })
  .refine((v) => !passwordContainsIdentity(v.password, v.email), { path: ['password'], message: 'Do not use your email in your password.' });

function passwordContainsIdentity(password: string, email: string) {
  const local = email.split('@')[0];
  return local.length >= 4 && password.toLowerCase().includes(local);
}

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  captchaToken: z.string().optional(),
});

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const forgotPasswordSchema = z.object({ email: emailSchema, captchaToken: z.string().optional() });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });

export type RegisterDto = z.infer<typeof registerSchema>;
