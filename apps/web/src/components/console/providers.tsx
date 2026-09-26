'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { can, canAny } from '@/lib/roles';
import type { Me } from '@/lib/types';
import { ConsoleShell, type NavItem } from './shell';

export function ConsoleProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <AuthProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </AuthProvider>
  );
}

/** Convenience: the signed-in user (only valid inside ConsoleShell, which guarantees authentication). */
export function useMe(): Me {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('useMe must be used inside an authenticated area');
  return state.user;
}

export function usePermissions() {
  const me = useMe();
  return { me, can: (...k: string[]) => can(me, ...k), canAny: (...k: string[]) => canAny(me, ...k) };
}

// ─── navigation per area ───
export function AdminArea({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const me = state.status === 'authenticated' ? state.user : undefined;
  const p = (...k: string[]) => !!me && k.every((x) => me.permissions.includes(x));
  const nav: NavItem[] = [
    { href: '/admin', label: 'Overview', icon: 'home' },
    { href: '/admin/cases', label: 'Cases', icon: 'folder', group: 'Operations' },
    { href: '/admin/patients', label: 'Patients', icon: 'users', group: 'Operations', show: p('patients.view') },
    { href: '/admin/documents', label: 'Documents', icon: 'file', group: 'Operations' },
    { href: '/admin/appointments', label: 'Appointments', icon: 'calendar', group: 'Operations' },
    { href: '/admin/visa', label: 'Visa', icon: 'stamp', group: 'Operations', show: p('visa.view') },
    { href: '/admin/travel', label: 'Travel', icon: 'plane', group: 'Operations', show: p('travel.view') },
    { href: '/admin/payments', label: 'Payments', icon: 'card', group: 'Operations', show: p('payments.view') },
    { href: '/admin/directory', label: 'Directory', icon: 'building', group: 'Content', show: p('directory.manage') },
    { href: '/admin/staff', label: 'Staff', icon: 'user', group: 'Administration', show: p('staff.manage') },
    { href: '/admin/roles', label: 'Roles & access', icon: 'key', group: 'Administration', show: p('staff.manage') },
    { href: '/admin/reports', label: 'Reports', icon: 'chart', group: 'Administration', show: p('reports.view') },
    { href: '/admin/audit', label: 'Audit log', icon: 'shield', group: 'Administration', show: p('audit.view') },
    { href: '/admin/settings', label: 'Settings', icon: 'gear', group: 'Administration', show: p('settings.manage') },
    { href: '/admin/notifications', label: 'Notifications', icon: 'bell', group: 'Account' },
  ];
  return <ConsoleShell area="admin" title="Admin" nav={nav} allow={(r) => r.includes('ADMIN') || r.includes('SUPER_ADMIN')}>{children}</ConsoleShell>;
}

export function StaffArea({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const me = state.status === 'authenticated' ? state.user : undefined;
  const p = (...k: string[]) => !!me && k.every((x) => me.permissions.includes(x));
  const nav: NavItem[] = [
    { href: '/staff', label: 'My workspace', icon: 'home' },
    { href: '/staff/cases', label: 'My cases', icon: 'folder', group: 'Work' },
    { href: '/staff/documents', label: 'Documents', icon: 'file', group: 'Work' },
    { href: '/staff/appointments', label: 'Appointments', icon: 'calendar', group: 'Work', show: p('appointments.view') },
    { href: '/staff/visa', label: 'Visa', icon: 'stamp', group: 'Work', show: p('visa.view') },
    { href: '/staff/travel', label: 'Travel', icon: 'plane', group: 'Work', show: p('travel.view') },
    { href: '/staff/payments', label: 'Payments', icon: 'card', group: 'Work', show: p('payments.view') },
    { href: '/staff/patients', label: 'Patients', icon: 'users', group: 'People', show: p('patients.view') },
    { href: '/staff/notifications', label: 'Notifications', icon: 'bell', group: 'Account' },
  ];
  return <ConsoleShell area="staff" title="Staff workspace" nav={nav} allow={(r) => r.some((x) => !['PATIENT', 'ADMIN', 'SUPER_ADMIN', 'DOCTOR'].includes(x))}>{children}</ConsoleShell>;
}

export function DoctorArea({ children }: { children: ReactNode }) {
  const nav: NavItem[] = [
    { href: '/doctor', label: 'Today', icon: 'home' },
    { href: '/doctor/schedule', label: 'My schedule', icon: 'calendar', group: 'Practice' },
    { href: '/doctor/patients', label: 'My patients', icon: 'users', group: 'Practice' },
    { href: '/doctor/documents', label: 'Patient documents', icon: 'file', group: 'Practice' },
    { href: '/doctor/hours', label: 'Consultation hours', icon: 'clock', group: 'Practice' },
    { href: '/doctor/notifications', label: 'Notifications', icon: 'bell', group: 'Account' },
  ];
  return <ConsoleShell area="doctor" title="Doctor" nav={nav} allow={(r) => r.includes('DOCTOR')}>{children}</ConsoleShell>;
}
