'use client';

import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, api } from './api-client';

export interface Meta { page: number; pageSize: number; total: number }

/** GET a list endpoint: returns `{ items, meta }` from the standard envelope. Keeps the previous page while the next loads. */
export function useList<T>(key: QueryKey, path: string | null, opts: { refetchMs?: number } = {}) {
  return useQuery({
    queryKey: [...key, path],
    queryFn: async () => {
      const r = await api<T[], Meta>(path!);
      return { items: r.data, meta: r.meta };
    },
    enabled: path !== null,
    placeholderData: (prev) => prev,
    refetchInterval: opts.refetchMs,
  });
}

/** GET a single resource (or any object). */
export function useGet<T>(key: QueryKey, path: string | null, opts: { refetchMs?: number } = {}) {
  return useQuery({ queryKey: [...key, path], queryFn: async () => (await api<T>(path!)).data, enabled: path !== null, refetchInterval: opts.refetchMs });
}

/** Mutation that invalidates the given query-key prefixes on success. */
export function useAction<V, R = unknown>(fn: (v: V) => Promise<R>, opts: { invalidate?: QueryKey[]; onSuccess?: (r: R) => void; onError?: (e: unknown) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      for (const k of opts.invalidate ?? []) await qc.invalidateQueries({ queryKey: k });
      opts.onSuccess?.(r);
    },
    onError: (e) => opts.onError?.(e),
  });
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/** Debounced value for search boxes. */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export const qstr = (p: Record<string, string | number | boolean | undefined | null>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '' && v !== false) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
};
