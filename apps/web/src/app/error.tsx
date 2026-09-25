'use client';

import { Button, Container } from '@/components/ui';

/** Friendly 500 state: never shows error details, stack traces or internals. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container className="py-20 text-center">
      <p className="text-sm font-semibold text-red-700">Something went wrong</p>
      <h1 className="mt-2 text-3xl font-bold">We could not load this page</h1>
      <p className="mx-auto mt-3 max-w-md text-ink-600">This is a problem on our side. Please try again. If it keeps happening, contact us.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <a href="/" className="inline-flex min-h-11 items-center rounded-lg border border-ink-300 px-4 text-sm font-semibold">Go to the home page</a>
      </div>
    </Container>
  );
}
