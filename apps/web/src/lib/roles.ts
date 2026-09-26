import type { Me } from './types';

export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

/** Where each kind of user lands after signing in. */
export function homeFor(roles: string[]): string {
  if (roles.some((r) => ADMIN_ROLES.includes(r))) return '/admin';
  if (roles.includes('DOCTOR')) return '/doctor';
  if (roles.includes('PATIENT') || roles.length === 0) return '/patient/dashboard';
  return '/staff';
}

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super admin', ADMIN: 'Admin', MEDICAL_COORDINATOR: 'Medical coordinator', CASE_MANAGER: 'Case manager', VISA_OFFICER: 'Visa officer',
  TRAVEL_COORDINATOR: 'Travel coordinator', FINANCE: 'Finance', DOCTOR: 'Doctor', PATIENT: 'Patient',
};
export const roleLabel = (r: string) => ROLE_LABELS[r] ?? r.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export const can = (me: Pick<Me, 'permissions'>, ...keys: string[]) => keys.every((k) => me.permissions.includes(k));
export const canAny = (me: Pick<Me, 'permissions'>, ...keys: string[]) => keys.some((k) => me.permissions.includes(k));
