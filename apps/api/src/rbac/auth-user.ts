import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: Set<string>;
  patientProfileId: string | null;
  emailVerified: boolean;
}

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSIONS_KEY = 'requiredPermissions';
/** All listed permissions are required. Object-level scope is still enforced in services. */
export const RequirePermissions = (...keys: string[]) => SetMetadata(PERMISSIONS_KEY, keys);

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser =>
  ctx.switchToHttp().getRequest().user,
);

export const can = (user: AuthUser, key: string) => user.permissions.has(key);
export const primaryRole = (user: AuthUser) => user.roles[0] ?? null;
