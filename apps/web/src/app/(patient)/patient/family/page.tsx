'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { applyApiError, errMsg } from '@/components/forms';
import { Alert, Button, Card, EmptyState, Field, Input, Select, Skeleton, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import { GENDERS, RELATIONSHIPS, fmtDate } from '@/lib/labels';
import type { FamilyMember } from '@/lib/types';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter their full name.').max(100),
  relationship: z.string().min(1, 'Choose the relationship.'),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  phone: z.string().trim().optional().refine((v) => !v || /^\+?[0-9]{8,15}$/.test(v), 'Enter a phone number with country code.'),
  passportNumber: z.string().trim().optional().refine((v) => !v || /^[A-Za-z0-9]{6,12}$/.test(v), 'Enter the passport number exactly as printed.'),
  passportExpiry: z.string().optional(),
  nidNumber: z.string().trim().optional().refine((v) => !v || /^[0-9]{10,17}$/.test(v), 'Enter the NID number (10, 13 or 17 digits).'),
  medicalNotes: z.string().trim().max(2000).optional(),
});
type Values = z.infer<typeof schema>;

function MemberForm({ member, onDone, onCancel }: { member?: FamilyMember; onDone: () => void; onCancel: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: member ? { fullName: member.fullName, relationship: member.relationship, dateOfBirth: member.dateOfBirth?.slice(0, 10) ?? '', gender: member.gender, phone: member.phone ?? '', passportExpiry: member.passportExpiry?.slice(0, 10) ?? '', medicalNotes: member.medicalNotes ?? '' } : { gender: 'UNSPECIFIED' },
  });

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const body = {
      fullName: v.fullName, relationship: v.relationship, gender: v.gender || 'UNSPECIFIED',
      dateOfBirth: v.dateOfBirth || null, phone: v.phone || null, passportExpiry: v.passportExpiry || null, medicalNotes: v.medicalNotes || null,
      ...(v.passportNumber ? { passportNumber: v.passportNumber } : {}), ...(v.nidNumber ? { nidNumber: v.nidNumber } : {}),
    };
    try {
      if (member) await api(`/patients/me/family-members/${member.id}`, { method: 'PATCH', body });
      else await api('/patients/me/family-members', { method: 'POST', body });
      onDone();
    } catch (e) {
      setFormError(applyApiError(e, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="fm-name" required error={errMsg(errors, 'fullName')}><Input id="fm-name" invalid={!!errors.fullName} {...register('fullName')} /></Field>
        <Field label="Relationship to you" htmlFor="fm-rel" required error={errMsg(errors, 'relationship')}><Select id="fm-rel" invalid={!!errors.relationship} {...register('relationship')}><option value="">Select</option>{RELATIONSHIPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Date of birth" htmlFor="fm-dob"><Input id="fm-dob" type="date" {...register('dateOfBirth')} /></Field>
        <Field label="Gender" htmlFor="fm-gender"><Select id="fm-gender" {...register('gender')}>{GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Mobile number" htmlFor="fm-phone" error={errMsg(errors, 'phone')}><Input id="fm-phone" type="tel" inputMode="tel" {...register('phone')} /></Field>
        <Field label="Passport number" htmlFor="fm-passport" error={errMsg(errors, 'passportNumber')} hint={member?.passportNumber ? `Saved: ${member.passportNumber}. Enter a new one to replace it.` : undefined}><Input id="fm-passport" autoComplete="off" {...register('passportNumber')} /></Field>
        <Field label="Passport expiry" htmlFor="fm-pexp"><Input id="fm-pexp" type="date" {...register('passportExpiry')} /></Field>
        <Field label="NID number" htmlFor="fm-nid" error={errMsg(errors, 'nidNumber')} hint={member?.nidNumber ? `Saved: ${member.nidNumber}. Enter a new one to replace it.` : undefined}><Input id="fm-nid" inputMode="numeric" autoComplete="off" {...register('nidNumber')} /></Field>
      </div>
      <Field label="Medical notes" htmlFor="fm-notes"><Textarea id="fm-notes" className="min-h-20" {...register('medicalNotes')} /></Field>
      <div className="flex gap-3"><Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : member ? 'Save changes' : 'Add family member'}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}

export default function FamilyPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['family'], queryFn: async () => (await api<FamilyMember[]>('/patients/me/family-members')).data });
  const [editing, setEditing] = useState<FamilyMember | 'new' | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => { setEditing(null); void qc.invalidateQueries({ queryKey: ['family'] }); };

  async function remove(id: string) {
    try { await api(`/patients/me/family-members/${id}`, { method: 'DELETE' }); setConfirm(null); refresh(); }
    catch { setError('We could not remove this person. Please try again.'); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold sm:text-3xl">Family members</h1><p className="text-ink-600">Add family members so you can arrange treatment for them.</p></div>
        {!editing && <Button onClick={() => setEditing('new')}>Add a family member</Button>}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {editing && <Card><h2 className="mb-4 text-lg font-semibold">{editing === 'new' ? 'Add a family member' : `Edit ${editing.fullName}`}</h2><MemberForm member={editing === 'new' ? undefined : editing} onDone={refresh} onCancel={() => setEditing(null)} /></Card>}
      {q.isLoading ? <Skeleton className="h-28" />
        : !q.data?.length ? (!editing && <EmptyState title="No family members yet">If you are arranging treatment for someone else, add them here first.</EmptyState>)
        : (
          <ul className="space-y-3">
            {q.data.map((m) => (
              <li key={m.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{m.fullName}</p>
                      <p className="text-sm text-ink-600">{RELATIONSHIPS.find((r) => r[0] === m.relationship)?.[1] ?? m.relationship}{m.dateOfBirth ? ` · born ${fmtDate(m.dateOfBirth)}` : ''}{m.passportNumber ? ` · passport ${m.passportNumber}` : ''}</p>
                    </div>
                    <Link href={`/patient/cases/new?member=${m.id}`} className="text-sm font-semibold">Start a case for {m.fullName.split(' ')[0]} →</Link>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => setEditing(m)}>Edit</Button>
                    {confirm === m.id ? <span className="flex items-center gap-2 text-sm">Remove {m.fullName}? <Button variant="danger" className="min-h-9 px-3 py-1.5" onClick={() => remove(m.id)}>Yes, remove</Button><Button variant="ghost" className="min-h-9 px-3 py-1.5" onClick={() => setConfirm(null)}>Keep</Button></span>
                      : <Button variant="ghost" className="min-h-9 px-3 py-1.5 text-red-700" onClick={() => setConfirm(m.id)}>Remove</Button>}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
