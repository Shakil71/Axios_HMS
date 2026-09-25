'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { applyApiError, errMsg } from '@/components/forms';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';

const schema = z.object({ email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.') });

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', auth: false, body: v });
      setSent(true);
    } catch (e) {
      setFormError(applyApiError(e, setError));
    }
  });

  return (
    <>
      <h1 className="text-2xl font-bold">Reset your password</h1>
      {sent ? (
        <div className="mt-5"><Alert tone="success" title="Check your email">If an account exists for that address, we have sent a link to choose a new password. It works for 30 minutes.</Alert></div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
          <p className="text-sm text-ink-600">Enter your email address and we will send you a reset link.</p>
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field label="Email address" htmlFor="email" error={errMsg(errors, 'email')}>
            <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
          </Field>
          <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : 'Send reset link'}</Button>
        </form>
      )}
      <Link href="/login" className="mt-6 inline-block text-sm font-semibold">Back to sign in</Link>
    </>
  );
}
