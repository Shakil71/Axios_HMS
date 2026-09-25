'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { applyApiError, errMsg } from '@/components/forms';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';

const schema = z.object({ password: z.string().min(10, 'Use at least 10 characters.').max(128) });

function ResetForm() {
  const token = useSearchParams().get('token');
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await api('/auth/reset-password', { method: 'POST', auth: false, body: { token, password: v.password } });
      setDone(true);
    } catch (e) {
      setFormError(applyApiError(e, setError));
    }
  });

  if (!token) return <Alert tone="danger" title="This link is not complete">Please use the link from your email, or request a new one.</Alert>;

  return (
    <>
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      {done ? (
        <div className="mt-5 space-y-4"><Alert tone="success" title="Your password has been changed">For your security you have been signed out everywhere.</Alert><Link href="/login" className="font-semibold">Sign in</Link></div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
          {formError && <Alert tone="danger">{formError} <Link href="/forgot-password">Request a new link</Link></Alert>}
          <Field label="New password" htmlFor="password" hint="At least 10 characters." error={errMsg(errors, 'password')}>
            <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
          </Field>
          <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Change password'}</Button>
        </form>
      )}
    </>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetForm /></Suspense>;
}
