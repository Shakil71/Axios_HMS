'use client';

import type { FieldErrors, FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '@/lib/api-client';

/** Maps API 422 details onto form fields; returns a message for anything that is not field-specific. */
export function applyApiError<T extends FieldValues>(e: unknown, setError: UseFormSetError<T>): string | null {
  if (e instanceof ApiError) {
    let mapped = false;
    for (const d of e.details) {
      if (d.field) {
        setError(d.field as Path<T>, { message: d.message });
        mapped = true;
      }
    }
    return mapped && e.code === 'VALIDATION_FAILED' ? null : e.message;
  }
  return 'We could not reach the server. Check your connection and try again.';
}

export const errMsg = <T extends FieldValues>(errors: FieldErrors<T>, name: Path<T>) => {
  const e = (errors as Record<string, { message?: string } | undefined>)[name];
  return e?.message;
};

/** Empty strings from optional inputs become undefined so the API sees "not provided". */
export const clean = <T extends Record<string, unknown>>(v: T) =>
  Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined && x !== null)) as Partial<T>;
