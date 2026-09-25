'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, logoutRequest, onSessionChange, refreshSession, setAccessToken } from './api-client';
import type { Me } from './types';

type State = { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: Me };

interface AuthApi {
  state: State;
  login(email: string, password: string, captchaToken?: string): Promise<void>;
  logout(): Promise<void>;
  reload(): Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const loadMe = useCallback(async () => {
    try {
      const { data } = await api<Me>('/auth/me');
      setState({ status: 'authenticated', user: data });
    } catch {
      setState({ status: 'anonymous' });
    }
  }, []);

  // Restore the session from the httpOnly refresh cookie on first load.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (await refreshSession()) {
        if (alive) await loadMe();
      } else if (alive) setState({ status: 'anonymous' });
    })();
    const off = onSessionChange((signedIn) => !signedIn && setState({ status: 'anonymous' }));
    return () => {
      alive = false;
      off();
    };
  }, [loadMe]);

  const value = useMemo<AuthApi>(
    () => ({
      state,
      async login(email, password, captchaToken) {
        const { data } = await api<{ accessToken: string }>('/auth/login', { method: 'POST', auth: false, body: { email, password, captchaToken } });
        setAccessToken(data.accessToken);
        await loadMe();
      },
      async logout() {
        await logoutRequest();
        setState({ status: 'anonymous' });
      },
      reload: loadMe,
    }),
    [state, loadMe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
