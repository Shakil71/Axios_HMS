'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { applyApiError, clean, errMsg } from '@/components/forms';
import { Alert, Button, Card, Field, Input, Select, Skeleton, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { RELATIONSHIPS } from '@/lib/labels';
import type { Country, FamilyMember, HospitalCard, TreatmentCard } from '@/lib/types';

const schema = z
  .object({
    familyMemberId: z.string().optional(),
    treatmentId: z.string().optional(),
    preferredCountryId: z.string().optional(),
    preferredHospitalId: z.string().optional(),
    symptoms: z.string().trim().min(5, 'Please describe your symptoms or the reason for treatment.').max(4000),
    medicalHistory: z.string().trim().max(4000).optional(),
    currentDiagnosis: z.string().trim().max(2000).optional(),
    previousTreatment: z.string().trim().max(4000).optional(),
    currentMedications: z.string().trim().max(2000).optional(),
    emergencyInformation: z.string().trim().max(2000).optional(),
    preferredTravelDate: z.string().optional(),
    budgetMin: z.string().optional(),
    budgetMax: z.string().optional(),
    budgetCurrency: z.string().optional(),
  })
  .refine((v) => !v.budgetMin || !v.budgetMax || Number(v.budgetMin) <= Number(v.budgetMax), { path: ['budgetMax'], message: 'The maximum must be at least the minimum.' });
type Values = z.infer<typeof schema>;

function NewCaseForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const sp = useSearchParams();
  const { state } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const lookups = useQuery({
    queryKey: ['case-lookups'],
    queryFn: async () => {
      const [t, c, h, f] = await Promise.all([
        api<TreatmentCard[]>('/treatments?pageSize=60', { auth: false }),
        api<Country[]>('/countries?pageSize=60', { auth: false }),
        api<HospitalCard[]>('/hospitals?pageSize=60', { auth: false }),
        api<FamilyMember[]>('/patients/me/family-members'),
      ]);
      return { treatments: t.data, countries: c.data, hospitals: h.data, family: f.data };
    },
  });

  const { register, handleSubmit, setError, watch, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { treatmentId: sp.get('treatment') ?? '', preferredCountryId: sp.get('country') ?? '', preferredHospitalId: sp.get('hospital') ?? '', familyMemberId: sp.get('member') ?? '', budgetCurrency: 'USD' },
  });
  const country = watch('preferredCountryId');

  if (lookups.isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64" /></div>;
  const L = lookups.data ?? { treatments: [], countries: [], hospitals: [], family: [] };
  const hospitals = L.hospitals.filter((h) => !country || h.country.id === country);
  const unverified = state.status === 'authenticated' && !state.user.emailVerified;

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const body = clean({
      ...v,
      budgetMin: v.budgetMin ? Number(v.budgetMin) : undefined,
      budgetMax: v.budgetMax ? Number(v.budgetMax) : undefined,
      budgetCurrency: v.budgetMin || v.budgetMax ? v.budgetCurrency : undefined,
    });
    try {
      const { data } = await api<{ id: string }>('/cases', { method: 'POST', body });
      await qc.invalidateQueries({ queryKey: ['cases'] });
      router.push(`/patient/cases/${data.id}?new=1`);
    } catch (e) {
      setFormError(applyApiError(e, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Start your treatment journey</h1>
        <p className="text-ink-600">Tell us a little about the condition. You can add reports and details later.</p>
      </div>
      {unverified && <Alert tone="warning" title="Please confirm your email first">You can fill this in, but we can only create the case after your email address is confirmed.</Alert>}
      {formError && <Alert tone="danger">{formError}</Alert>}

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Who needs treatment?</h2>
        <Field label="Patient" htmlFor="familyMemberId" hint={L.family.length ? undefined : 'You can add family members from the Family page.'}>
          <Select id="familyMemberId" {...register('familyMemberId')}>
            <option value="">Myself</option>
            {L.family.map((m) => <option key={m.id} value={m.id}>{m.fullName} ({RELATIONSHIPS.find((r) => r[0] === m.relationship)?.[1] ?? m.relationship})</option>)}
          </Select>
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">What is the problem?</h2>
        <Field label="Symptoms or reason for treatment" htmlFor="symptoms" required error={errMsg(errors, 'symptoms')}>
          <Textarea id="symptoms" invalid={!!errors.symptoms} {...register('symptoms')} />
        </Field>
        <Field label="Current diagnosis (if you know it)" htmlFor="currentDiagnosis" error={errMsg(errors, 'currentDiagnosis')}><Textarea id="currentDiagnosis" className="min-h-20" {...register('currentDiagnosis')} /></Field>
        <Field label="Medical history" htmlFor="medicalHistory" error={errMsg(errors, 'medicalHistory')}><Textarea id="medicalHistory" className="min-h-20" {...register('medicalHistory')} /></Field>
        <Field label="Previous treatment" htmlFor="previousTreatment" error={errMsg(errors, 'previousTreatment')}><Textarea id="previousTreatment" className="min-h-20" {...register('previousTreatment')} /></Field>
        <Field label="Medicines you take now" htmlFor="currentMedications" error={errMsg(errors, 'currentMedications')}><Textarea id="currentMedications" className="min-h-20" {...register('currentMedications')} /></Field>
        <Field label="Anything urgent we should know?" htmlFor="emergencyInformation" error={errMsg(errors, 'emergencyInformation')}><Textarea id="emergencyInformation" className="min-h-20" {...register('emergencyInformation')} /></Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Your preferences (optional)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Treatment" htmlFor="treatmentId"><Select id="treatmentId" {...register('treatmentId')}><option value="">Not sure yet</option>{L.treatments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Preferred country" htmlFor="preferredCountryId"><Select id="preferredCountryId" {...register('preferredCountryId')}><option value="">No preference</option>{L.countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Preferred hospital" htmlFor="preferredHospitalId"><Select id="preferredHospitalId" {...register('preferredHospitalId')}><option value="">No preference</option>{hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select></Field>
          <Field label="Preferred travel date" htmlFor="preferredTravelDate"><Input id="preferredTravelDate" type="date" {...register('preferredTravelDate')} /></Field>
        </div>
        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-1 text-sm font-medium">Budget range</legend>
          <Field label="From" htmlFor="budgetMin" error={errMsg(errors, 'budgetMin')}><Input id="budgetMin" type="number" min={0} inputMode="numeric" {...register('budgetMin')} /></Field>
          <Field label="To" htmlFor="budgetMax" error={errMsg(errors, 'budgetMax')}><Input id="budgetMax" type="number" min={0} inputMode="numeric" invalid={!!errors.budgetMax} {...register('budgetMax')} /></Field>
          <Field label="Currency" htmlFor="budgetCurrency"><Select id="budgetCurrency" {...register('budgetCurrency')}><option value="USD">USD</option><option value="BDT">BDT</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="INR">INR</option></Select></Field>
        </fieldset>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating your case…' : 'Create my case'}</Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}

export default function NewCasePage() {
  return <Suspense><NewCaseForm /></Suspense>;
}
