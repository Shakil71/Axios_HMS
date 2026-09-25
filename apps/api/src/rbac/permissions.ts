/** Permission catalog and default role matrix (see docs/03-auth-and-rbac.md). */

export const SENSITIVITIES = ['identity', 'medical', 'travel', 'financial', 'general'] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

export const DOC_ACTIONS = ['view', 'upload', 'verify', 'download', 'delete'] as const;
export type DocAction = (typeof DOC_ACTIONS)[number];

export const docPerm = (action: DocAction, s: Sensitivity) => `documents.${action}.${s}`;

const documentPermissions = DOC_ACTIONS.flatMap((a) => SENSITIVITIES.map((s) => docPerm(a, s)));

export const ALL_PERMISSIONS: string[] = [
  'patients.view', 'patients.view.all', 'patients.create', 'patients.edit', 'patients.edit.all', 'patients.delete',
  'cases.view', 'cases.view.all', 'cases.create', 'cases.edit', 'cases.edit.all', 'cases.assign', 'cases.close',
  ...documentPermissions,
  'documents.scope.all', // may access documents of any case, not only assigned ones
  'identity.reveal', // may see unmasked NID/passport numbers (always audited)
  'visa.view', 'visa.view.all', 'visa.edit', 'visa.approve',
  'travel.view', 'travel.edit',
  'appointments.view', 'appointments.view.all', 'appointments.create', 'appointments.edit',
  'payments.view', 'payments.create', 'payments.refund',
  'directory.manage', 'cms.manage',
  'messages.view', 'messages.send',
  'staff.manage', 'roles.manage', 'reports.view', 'audit.view', 'settings.manage',
];

const docs = (actions: DocAction[], sens: Sensitivity[]) => actions.flatMap((a) => sens.map((s) => docPerm(a, s)));
const messaging = ['messages.view', 'messages.send'];

export const ROLE_NAMES = [
  'SUPER_ADMIN', 'ADMIN', 'MEDICAL_COORDINATOR', 'CASE_MANAGER', 'VISA_OFFICER',
  'TRAVEL_COORDINATOR', 'FINANCE', 'DOCTOR', 'PATIENT',
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLE_DEFAULTS: Record<RoleName, { description: string; permissions: string[] }> = {
  SUPER_ADMIN: { description: 'Full access, including roles and settings', permissions: ALL_PERMISSIONS },
  ADMIN: {
    description: 'Operations administrator',
    permissions: ALL_PERMISSIONS.filter((p) => !['roles.manage', 'settings.manage', 'payments.refund'].includes(p)),
  },
  MEDICAL_COORDINATOR: {
    description: 'Reviews medical information and coordinates with hospitals',
    permissions: [
      'patients.view', 'cases.view', 'cases.edit',
      ...docs(['view', 'download', 'verify', 'upload'], ['medical', 'general']),
      'appointments.view', 'appointments.create', 'appointments.edit',
      ...messaging,
    ],
  },
  CASE_MANAGER: {
    description: 'Owns the treatment journey of assigned cases',
    permissions: [
      'patients.view', 'cases.view', 'cases.edit', 'cases.assign', 'cases.close',
      ...docs(['view', 'download', 'verify', 'upload'], ['identity', 'medical', 'travel', 'general']),
      'appointments.view', 'appointments.create', 'appointments.edit',
      'visa.view', 'travel.view', ...messaging, 'reports.view',
    ],
  },
  VISA_OFFICER: {
    description: 'Handles visa documentation (no medical reports)',
    permissions: [
      'patients.view', 'cases.view',
      ...docs(['view', 'download', 'verify', 'upload'], ['identity', 'travel', 'general']),
      'visa.view', 'visa.edit', 'visa.approve', ...messaging,
    ],
  },
  TRAVEL_COORDINATOR: {
    description: 'Handles flights, hotels and transport (no medical reports)',
    permissions: [
      'patients.view', 'cases.view',
      ...docs(['view', 'download', 'upload'], ['identity', 'travel', 'general']),
      'travel.view', 'travel.edit', ...messaging,
    ],
  },
  FINANCE: {
    description: 'Invoices and payments (no medical or identity documents)',
    permissions: [
      'patients.view', 'cases.view',
      ...docs(['view', 'download'], ['financial', 'general']),
      'payments.view', 'payments.create', 'payments.refund', 'reports.view',
    ],
  },
  DOCTOR: {
    description: 'Reviews medical documents of cases they are linked to',
    permissions: [
      'patients.view', 'cases.view',
      ...docs(['view', 'download'], ['medical', 'general']),
      'appointments.view', 'appointments.edit', ...messaging,
    ],
  },
  PATIENT: { description: 'Portal user; access is ownership-based, no staff permissions', permissions: [] },
};
