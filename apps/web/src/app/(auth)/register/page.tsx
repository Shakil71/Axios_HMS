'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { applyApiError, clean, errMsg } from '@/components/forms';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import { GENDERS } from '@/lib/labels';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(100),
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
  phone: z.string().trim().regex(/^\+?[0-9]{8,15}$/, 'Enter your mobile number with country code, e.g. +8801XXXXXXXXX'),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  city: z.string().trim().max(100).optional(),
  emergencyContactName: z.string().trim().max(100).optional(),
  emergencyContactPhone: z.string().trim().optional().refine((v) => !v || /^\+?[0-9]{8,15}$/.test(v), 'Enter a phone number with country code.'),
  password: z.string().min(10, 'Use at least 10 characters.').max(128),
  agree: z.literal(true, { message: 'Please confirm to continue.' }),
});
type Values = z.infer<typeof schema>;

export default function RegisterPage() {
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ agree: _agree, ...v }) => {
    setFormError(null);
    try {
      await api('/auth/register', { method: 'POST', auth: false, body: clean(v) });
      setDone(v.email);
    } catch (e) {
      setFormError(applyApiError(e, setError));
    }
  });

  if (done) {
    return (
      <>
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="mt-3 text-ink-700">We sent a confirmation link to <strong>{done}</strong>. Open it to activate your account, then sign in.</p>
        <p className="mt-3 text-sm text-ink-600">Did not get it? Check your spam folder, or try again in a few minutes.</p>
        <Link href="/login" className="mt-6 inline-block font-semibold">Go to sign in</Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm text-ink-600">It is free. You will need a mobile number and email address.</p>
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Full name" htmlFor="fullName" required error={errMsg(errors, 'fullName')}>
          <Input id="fullName" autoComplete="name" invalid={!!errors.fullName} {...register('fullName')} />
        </Field>
        <Field label="Email address" htmlFor="email" required error={errMsg(errors, 'email')}>
          <Input id="email" type="email" autoComplete="email" inputMode="email" invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Mobile number" htmlFor="phone" required hint="With country code, e.g. +8801XXXXXXXXX" error={errMsg(errors, 'phone')}>
          <Input id="phone" type="tel" autoComplete="tel" inputMode="tel" invalid={!!errors.phone} {...register('phone')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date of birth" htmlFor="dateOfBirth" error={errMsg(errors, 'dateOfBirth')}>
            <Input id="dateOfBirth" type="date" autoComplete="bday" invalid={!!errors.dateOfBirth} {...register('dateOfBirth')} />
          </Field>
          <Field label="Gender" htmlFor="gender" error={errMsg(errors, 'gender')}>
            <Select id="gender" {...register('gender')}>
              <option value="">Select</option>
              {GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="City" htmlFor="city" error={errMsg(errors, 'city')}><Input id="city" autoComplete="address-level2" {...register('city')} /></Field>
        <fieldset className="grid gap-4 rounded-lg border border-ink-200 p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium text-ink-800">Emergency contact (optional)</legend>
          <Field label="Name" htmlFor="emergencyContactName" error={errMsg(errors, 'emergencyContactName')}><Input id="emergencyContactName" {...register('emergencyContactName')} /></Field>
          <Field label="Phone" htmlFor="emergencyContactPhone" error={errMsg(errors, 'emergencyContactPhone')}><Input id="emergencyContactPhone" type="tel" inputMode="tel" invalid={!!errors.emergencyContactPhone} {...register('emergencyContactPhone')} /></Field>
        </fieldset>
        <Field label="Password" htmlFor="password" required hint="At least 10 characters. A few random words work well." error={errMsg(errors, 'password')}>
          <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
        </Field>
        <div>
          <label className="flex items-start gap-3 text-sm text-ink-700">
            <input type="checkbox" className="mt-1 size-5 rounded border-ink-300" aria-invalid={!!errors.agree} {...register('agree')} />
            <span>I understand that this service helps arrange treatment and paperwork and does not give medical advice.</span>
          </label>
          {errors.agree && <p role="alert" className="mt-1 text-sm text-red-700">{errors.agree.message}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create account'}</Button>
      </form>
      <p className="mt-5 text-sm text-ink-600">Already have an account? <Link href="/login">Sign in</Link></p>
    </>
  );
}
