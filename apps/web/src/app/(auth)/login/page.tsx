'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { applyApiError, errMsg } from '@/components/forms';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { homeFor } from '@/lib/roles';

const schema = z.object({ email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.') });
type Values = z.infer<typeof schema>;

/** Only same-site relative paths are accepted as a post-login destination (prevents open redirects). */
const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') ? n : null);

interface DemoInfo { demo: boolean; demoPassword?: string; demoAccounts?: { key: string; email: string; fullName: string; role: string; label: string }[] }

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { state, login } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, setValue, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });
  const [demo, setDemo] = useState<DemoInfo | null>(null);

  useEffect(() => {
    if (state.status === 'authenticated') router.replace(next ?? homeFor(state.user.roles));
  }, [state.status, state, next, router]);

  useEffect(() => {
    let alive = true;
    api<DemoInfo>('/health/live', { auth: false }).then((r) => alive && r.data.demo && setDemo(r.data)).catch(() => undefined);
    return () => { alive = false; };
  }, []);

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
      {demo?.demoAccounts && (
        <section aria-labelledby="demo-h" className="mt-8 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
          <h2 id="demo-h" className="text-sm font-bold text-brand-900">Demo accounts</h2>
          <p className="mt-1 text-xs text-ink-700">This is a demonstration with made-up data. Pick a role to fill in the form, then press Sign in.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {demo.demoAccounts.map((a) => (
              <li key={a.key}>
                <button type="button" onClick={() => { setValue('email', a.email, { shouldValidate: true }); setValue('password', demo.demoPassword ?? '', { shouldValidate: true }); }} className="w-full min-h-11 rounded-lg border border-ink-200 bg-white px-3 py-2 text-left hover:border-brand-500">
                  <span className="block text-sm font-semibold text-ink-900">{a.label}</span>
                  <span className="block truncate text-xs text-ink-600">{a.fullName}</span>
                </button>
              </li>
            ))}
          </ul>
          {demo.demoPassword && <p className="mt-3 text-xs text-ink-700">Password for every demo account: <code className="rounded bg-white px-1.5 py-0.5 font-mono font-semibold">{demo.demoPassword}</code></p>}
        </section>
      )}
    </>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
