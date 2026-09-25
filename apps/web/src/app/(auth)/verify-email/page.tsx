'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Alert, Spinner } from '@/components/ui';
import { ApiError, api } from '@/lib/api-client';

function Verify() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'working' | 'ok' | 'error'>(token ? 'working' : 'error');
  const [message, setMessage] = useState('This link is not complete. Please use the link from your email.');
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return; // the token is single-use: never send it twice
    ran.current = true;
    api('/auth/verify-email', { method: 'POST', auth: false, body: { token } })
      .then(() => setState('ok'))
      .catch((e) => {
        setMessage(e instanceof ApiError ? e.message : 'We could not reach the server. Please try again.');
        setState('error');
      });
  }, [token]);

  return (
    <>
      <h1 className="text-2xl font-bold">Confirm your email</h1>
      <div className="mt-5">
        {state === 'working' && <Spinner label="Confirming your email…" />}
        {state === 'ok' && <Alert tone="success" title="Your email is confirmed">You can now sign in and start your treatment case.</Alert>}
        {state === 'error' && <Alert tone="danger" title="We could not confirm your email">{message}</Alert>}
      </div>
      <Link href="/login" className="mt-6 inline-block font-semibold">Go to sign in</Link>
    </>
  );
}

export default function VerifyEmailPage() {
  return <Suspense><Verify /></Suspense>;
}
