import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env';
import { PrismaService } from '../common/prisma.service';
import { forbidden, unauthorized } from '../common/http/errors';
import { AuthUser, IS_PUBLIC, PERMISSIONS_KEY } from './auth-user';

export interface AccessTokenPayload {
  sub: string;
  sv: number;
}

/**
 * Global guard (secure by default; opt out with @Public()).
 * Loads roles/permissions from the database on EVERY request, so a revoked permission,
 * a suspended account or a bumped sessionVersion blocks the very next call.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;

    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();

    let payload: AccessTokenPayload;
    try {
      payload = jwt.verify(header.slice(7), getEnv().JWT_SECRET, { algorithms: ['HS256'] }) as unknown as AccessTokenPayload;
    } catch (e) {
      const expired = e instanceof jwt.TokenExpiredError;
      throw unauthorized(expired ? 'Your session has expired. Please sign in again.' : 'Please sign in to continue.', expired ? 'SESSION_EXPIRED' : 'UNAUTHORIZED');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        patientProfile: { select: { id: true, deletedAt: true } },
      },
    });
    if (!user || user.deletedAt || user.sessionVersion !== payload.sv || !['ACTIVE', 'PENDING_VERIFICATION'].includes(user.status)) {
      throw unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles.map((r) => r.role.name),
      permissions: new Set(user.roles.flatMap((r) => r.role.permissions.map((rp) => rp.permission.key))),
      patientProfileId: user.patientProfile && !user.patientProfile.deletedAt ? user.patientProfile.id : null,
      emailVerified: !!user.emailVerifiedAt,
    };
    req.user = authUser;
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user) throw unauthorized();
    if (!required.every((k) => user.permissions.has(k))) throw forbidden();
    return true;
  }
}
