'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { applyApiError, errMsg } from '@/components/forms';
import { Alert, Button, Field, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const schema = z.object({ email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.') });
type Values = z.infer<typeof schema>;

/** Only same-site relative paths are accepted as a post-login destination (prevents open redirects). */
const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') ? n : '/patient/dashboard');

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { state, login } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (state.status === 'authenticated') router.replace(next);
  }, [state.status, next, router]);

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await login(v.email, v.password);
    } catch (e) {
      setFormError(applyApiError(e, setError));
    }
  });

  return (
    <>
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-ink-600">Welcome back. Sign in to see your treatment journey.</p>
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Email address" htmlFor="email" error={errMsg(errors, 'email')}>
          <Input id="email" type="email" autoComplete="email" inputMode="email" invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errMsg(errors, 'password')}>
          <Input id="password" type="password" autoComplete="current-password" invalid={!!errors.password} {...register('password')} />
        </Field>
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</Button>
      </form>
      <div className="mt-5 flex justify-between text-sm">
        <Link href="/forgot-password">Forgot your password?</Link>
        <Link href="/register">Create an account</Link>
      </div>
    </>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
