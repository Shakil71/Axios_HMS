'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { applyApiError, errMsg } from '@/components/forms';
import { Alert, Button, Card, Field, Input, Select, Skeleton, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import { GENDERS } from '@/lib/labels';
import type { PatientProfile } from '@/lib/types';

const phone = z.string().trim().optional().refine((v) => !v || /^\+?[0-9]{8,15}$/.test(v), 'Enter a phone number with country code.');
const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(100),
  dateOfBirth: z.string().optional(),
  gender: z.string(),
  city: z.string().trim().max(100).optional(),
  address: z.string().trim().max(300).optional(),
  emergencyContactName: z.string().trim().max(100).optional(),
  emergencyContactPhone: phone,
  emergencyContactRelation: z.string().trim().max(50).optional(),
  passportNumber: z.string().trim().optional().refine((v) => !v || /^[A-Za-z0-9]{6,12}$/.test(v), 'Enter the passport number exactly as printed.'),
  passportExpiry: z.string().optional(),
  nidNumber: z.string().trim().optional().refine((v) => !v || /^[0-9]{10,17}$/.test(v), 'Enter your NID number (10, 13 or 17 digits).'),
  bloodGroup: z.string().optional(),
  allergies: z.string().trim().max(1000).optional(),
  chronicConditions: z.string().trim().max(1000).optional(),
  preferredLanguage: z.string().trim().max(50).optional(),
  notifyEmail: z.boolean(),
  notifySms: z.boolean(),
  notifyWhatsapp: z.boolean(),
});
type Values = z.infer<typeof schema>;

const toValues = (p: PatientProfile): Values => ({
  fullName: p.fullName, dateOfBirth: p.dateOfBirth?.slice(0, 10) ?? '', gender: p.gender, city: p.city ?? '', address: p.address ?? '',
  emergencyContactName: p.emergencyContactName ?? '', emergencyContactPhone: p.emergencyContactPhone ?? '', emergencyContactRelation: p.emergencyContactRelation ?? '',
  passportNumber: '', passportExpiry: p.passportExpiry?.slice(0, 10) ?? '', nidNumber: '', bloodGroup: p.bloodGroup ?? '',
  allergies: p.allergies ?? '', chronicConditions: p.chronicConditions ?? '', preferredLanguage: p.preferredLanguage ?? '',
  notifyEmail: p.notifyEmail, notifySms: p.notifySms, notifyWhatsapp: p.notifyWhatsapp,
});

const nul = (v?: string) => (v ? v : null);

export default function ProfilePage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['profile'], queryFn: async () => (await api<PatientProfile>('/patients/me')).data });
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => { if (q.data) reset(toValues(q.data)); }, [q.data, reset]);

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    setSaved(false);
    try {
      await api('/patients/me', {
        method: 'PATCH',
        body: {
          fullName: v.fullName, gender: v.gender, dateOfBirth: nul(v.dateOfBirth), city: nul(v.city), address: nul(v.address),
          emergencyContactName: nul(v.emergencyContactName), emergencyContactPhone: nul(v.emergencyContactPhone), emergencyContactRelation: nul(v.emergencyContactRelation),
          passportExpiry: nul(v.passportExpiry), bloodGroup: nul(v.bloodGroup), allergies: nul(v.allergies), chronicConditions: nul(v.chronicConditions), preferredLanguage: nul(v.preferredLanguage),
          notifyEmail: v.notifyEmail, notifySms: v.notifySms, notifyWhatsapp: v.notifyWhatsapp,
          ...(v.passportNumber ? { passportNumber: v.passportNumber } : {}),
          ...(v.nidNumber ? { nidNumber: v.nidNumber } : {}),
        },
      });
      await qc.invalidateQueries({ queryKey: ['profile'] });
      setSaved(true);
    } catch (e) {
      setFormError(applyApiError(e, setError));
    }
  });

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-64" /></div>;
  if (q.isError || !q.data) return <p role="alert" className="text-red-700">We could not load your profile. Please refresh the page.</p>;
  const p = q.data;

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-3xl space-y-6">
      <div><h1 className="text-2xl font-bold sm:text-3xl">My profile</h1><p className="text-ink-600">Keep your details up to date so we can reach you and prepare your paperwork.</p></div>
      {saved && <Alert tone="success">Your profile has been saved.</Alert>}
      {formError && <Alert tone="danger">{formError}</Alert>}

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Personal information</h2>
        <Field label="Full name (as on your passport)" htmlFor="fullName" required error={errMsg(errors, 'fullName')}><Input id="fullName" autoComplete="name" invalid={!!errors.fullName} {...register('fullName')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date of birth" htmlFor="dateOfBirth" error={errMsg(errors, 'dateOfBirth')}><Input id="dateOfBirth" type="date" {...register('dateOfBirth')} /></Field>
          <Field label="Gender" htmlFor="gender"><Select id="gender" {...register('gender')}>{GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Contact information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email address" htmlFor="email-ro" hint="To change your email, contact us."><Input id="email-ro" value={p.email} readOnly aria-readonly="true" className="bg-ink-50" /></Field>
          <Field label="Mobile number" htmlFor="phone-ro"><Input id="phone-ro" value={p.phone ?? ''} readOnly aria-readonly="true" className="bg-ink-50" /></Field>
        </div>
        <Field label="City" htmlFor="city"><Input id="city" autoComplete="address-level2" {...register('city')} /></Field>
        <Field label="Address" htmlFor="address"><Textarea id="address" className="min-h-20" autoComplete="street-address" {...register('address')} /></Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Emergency contact</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" htmlFor="emergencyContactName"><Input id="emergencyContactName" {...register('emergencyContactName')} /></Field>
          <Field label="Phone" htmlFor="emergencyContactPhone" error={errMsg(errors, 'emergencyContactPhone')}><Input id="emergencyContactPhone" type="tel" inputMode="tel" invalid={!!errors.emergencyContactPhone} {...register('emergencyContactPhone')} /></Field>
          <Field label="Relationship" htmlFor="emergencyContactRelation"><Input id="emergencyContactRelation" {...register('emergencyContactRelation')} /></Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Passport and NID</h2>
        <p className="text-sm text-ink-600">Numbers are stored encrypted and shown only as the last four digits. Upload a copy of each on the Documents page.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Passport number" htmlFor="passportNumber" error={errMsg(errors, 'passportNumber')} hint={p.passportNumber ? `Saved: ${p.passportNumber}. Enter a new number to replace it.` : undefined}><Input id="passportNumber" autoComplete="off" invalid={!!errors.passportNumber} {...register('passportNumber')} /></Field>
          <Field label="Passport expiry date" htmlFor="passportExpiry"><Input id="passportExpiry" type="date" {...register('passportExpiry')} /></Field>
          <Field label="NID number" htmlFor="nidNumber" error={errMsg(errors, 'nidNumber')} hint={p.nidNumber ? `Saved: ${p.nidNumber}. Enter a new number to replace it.` : undefined}><Input id="nidNumber" inputMode="numeric" autoComplete="off" invalid={!!errors.nidNumber} {...register('nidNumber')} /></Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Medical information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Blood group" htmlFor="bloodGroup"><Select id="bloodGroup" {...register('bloodGroup')}><option value="">Not sure</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}</Select></Field>
        </div>
        <Field label="Allergies" htmlFor="allergies"><Textarea id="allergies" className="min-h-20" {...register('allergies')} /></Field>
        <Field label="Long-term conditions" htmlFor="chronicConditions"><Textarea id="chronicConditions" className="min-h-20" {...register('chronicConditions')} /></Field>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Preferences</h2>
        <Field label="Preferred language" htmlFor="preferredLanguage"><Input id="preferredLanguage" {...register('preferredLanguage')} /></Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">How should we contact you?</legend>
          {([['notifyEmail', 'Email'], ['notifySms', 'SMS'], ['notifyWhatsapp', 'WhatsApp']] as const).map(([n, l]) => (
            <label key={n} className="flex items-center gap-3 text-sm"><input type="checkbox" className="size-5 rounded border-ink-300" {...register(n)} />{l}</label>
          ))}
        </fieldset>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</Button>
        <Link href="/patient/family" className="text-sm font-semibold">Manage family members</Link>
      </div>
    </form>
  );
}
