import { Injectable } from '@nestjs/common';
import * as argon2 from '@node-rs/argon2'; // prebuilt binaries: works on Vercel/Lambda without compiling; hashes are standard Argon2id PHC strings
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { conflict, forbidden, tooMany, unauthorized } from '../common/http/errors';
import { ReqCtx } from '../common/http/request-context';
import { PrismaService, Tx } from '../common/prisma.service';
import { getEnv } from '../config/env';
import { MailService } from '../mail/mail.service';
import { AuthUser } from '../rbac/auth-user';
import { CaptchaService } from './captcha.service';
import { RegisterDto } from './auth.schemas';

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const; // algorithm defaults to Argon2id
const MAX_FAILURES = 5;
const CAPTCHA_AFTER_FAILURES = 3;
const REUSE_GRACE_MS = 10_000;
const EMAIL_TOKEN_TTL_MS = 24 * 3600_000;
const RESET_TOKEN_TTL_MS = 30 * 60_000;

export interface Session {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly captcha: CaptchaService,
  ) {}

  hashPassword(password: string) {
    return argon2.hash(password, ARGON);
  }

  // ───────────── registration & email verification ─────────────

  async register(dto: RegisterDto, ctx: ReqCtx) {
    await this.captcha.assert(dto.captchaToken, ctx.ip);

    // Same response whether or not the email/phone is taken, so accounts cannot be enumerated.
    const existing = await this.prisma.user.findFirst({ where: { OR: [{ email: dto.email }, { phone: dto.phone }] }, select: { id: true } });
    if (existing) return;

    const patientRole = await this.prisma.role.findUnique({ where: { name: 'PATIENT' } });
    if (!patientRole) throw new Error('PATIENT role missing: run the seed');

    const passwordHash = await this.hashPassword(dto.password);
    const token = this.crypto.randomToken();

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: dto.email,
          phone: dto.phone,
          fullName: dto.fullName,
          passwordHash,
          roles: { create: { roleId: patientRole.id } },
          patientProfile: {
            create: {
              dateOfBirth: dto.dateOfBirth,
              gender: dto.gender,
              countryId: dto.countryId,
              city: dto.city,
              address: dto.address,
              emergencyContactName: dto.emergencyContactName,
              emergencyContactPhone: dto.emergencyContactPhone,
            },
          },
        },
      });
      await tx.verificationToken.create({
        data: { userId: u.id, type: 'EMAIL_VERIFY', tokenHash: this.crypto.hashToken(token), expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS) },
      });
      await this.audit.log({ actorId: u.id, actorRole: 'PATIENT', action: 'auth.register', resourceType: 'User', resourceId: u.id, ...ctx }, tx);
      return u;
    });

    await this.sendVerificationMail(user.email, user.fullName, token);
  }

  private sendVerificationMail(to: string, name: string, token: string) {
    const link = `${getEnv().APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
    return this.mail.send({
      to,
      subject: 'Confirm your email address',
      text: `Hello ${name},\n\nPlease confirm your email address to start using your patient account:\n${link}\n\nThis link is valid for 24 hours. If you did not create an account, you can ignore this email.`,
    });
  }

  async verifyEmail(token: string, ctx: ReqCtx) {
    const rec = await this.prisma.verificationToken.findUnique({ where: { tokenHash: this.crypto.hashToken(token) } });
    if (!rec || rec.type !== 'EMAIL_VERIFY' || rec.consumedAt || rec.expiresAt < new Date()) {
      throw conflict('This confirmation link is invalid or has expired. Please request a new one.', 'INVALID_TOKEN');
    }
    await this.prisma.$transaction(async (tx) => {
      // Atomic single-use claim
      const claimed = await tx.verificationToken.updateMany({ where: { id: rec.id, consumedAt: null }, data: { consumedAt: new Date() } });
      if (claimed.count !== 1) throw conflict('This confirmation link is invalid or has expired.', 'INVALID_TOKEN');
      await tx.user.update({ where: { id: rec.userId }, data: { emailVerifiedAt: new Date(), status: 'ACTIVE' } });
      await this.audit.log({ actorId: rec.userId, action: 'auth.email_verified', resourceType: 'User', resourceId: rec.userId, ...ctx }, tx);
    });
  }

  async resendVerification(user: AuthUser) {
    if (user.emailVerified) return;
    const token = this.crypto.randomToken();
    await this.prisma.verificationToken.create({
      data: { userId: user.id, type: 'EMAIL_VERIFY', tokenHash: this.crypto.hashToken(token), expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS) },
    });
    await this.sendVerificationMail(user.email, user.fullName, token);
  }

  // ───────────── login / sessions ─────────────

  async login(email: string, password: string, captchaToken: string | undefined, ctx: ReqCtx) {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { roles: { include: { role: true } } } });

    if (!user || user.deletedAt) {
      // keep timing similar to a real verification
      this.dummyHash ??= this.hashPassword('not-a-real-password');
      await argon2.verify(await this.dummyHash, password).catch(() => false);
      await this.audit.log({ action: 'auth.login_failed', resourceType: 'User', metadata: { reason: 'unknown_account' }, ...ctx });
      throw unauthorized('Incorrect email or password.', 'INVALID_CREDENTIALS');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.log({ actorId: user.id, action: 'auth.login_failed', resourceType: 'User', resourceId: user.id, metadata: { reason: 'locked' }, ...ctx });
      throw tooMany('Too many failed attempts. Please try again in a few minutes.');
    }
    if (user.failedLoginCount >= CAPTCHA_AFTER_FAILURES) await this.captcha.assert(captchaToken, ctx.ip);

    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const failures = user.failedLoginCount + 1;
      const lockMinutes = failures >= MAX_FAILURES ? Math.min(15 * 2 ** (failures - MAX_FAILURES), 24 * 60) : 0;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: failures, lockedUntil: lockMinutes ? new Date(Date.now() + lockMinutes * 60_000) : null },
      });
      await this.audit.log({ actorId: user.id, action: 'auth.login_failed', resourceType: 'User', resourceId: user.id, metadata: { failures }, ...ctx });
      throw unauthorized('Incorrect email or password.', 'INVALID_CREDENTIALS');
    }

    if (!['ACTIVE', 'PENDING_VERIFICATION'].includes(user.status)) {
      throw forbidden('This account is not active. Please contact support.', 'ACCOUNT_DISABLED');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const session = await this.issueSession(user.id, user.sessionVersion, ctx);
    const roles = user.roles.map((r) => r.role.name);
    await this.audit.log({ actorId: user.id, actorRole: roles[0], action: 'auth.login', resourceType: 'User', resourceId: user.id, ...ctx });
    return {
      session,
      user: { id: user.id, email: user.email, fullName: user.fullName, roles, emailVerified: !!user.emailVerifiedAt },
    };
  }

  private signAccess(userId: string, sv: number) {
    const ttl = getEnv().ACCESS_TOKEN_TTL_SECONDS;
    return { token: jwt.sign({ sub: userId, sv }, getEnv().JWT_SECRET, { algorithm: 'HS256', expiresIn: ttl }), ttl };
  }

  private async issueSession(userId: string, sv: number, ctx: ReqCtx, familyId: string = randomUUID(), tx?: Tx): Promise<Session & { recordId: string }> {
    const db = tx ?? this.prisma;
    const refreshToken = this.crypto.randomToken(48);
    const refreshExpiresAt = new Date(Date.now() + getEnv().REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const rec = await db.refreshToken.create({
      data: { userId, familyId, tokenHash: this.crypto.hashToken(refreshToken), expiresAt: refreshExpiresAt, ip: ctx.ip, userAgent: ctx.userAgent },
    });
    const { token, ttl } = this.signAccess(userId, sv);
    return { accessToken: token, expiresIn: ttl, refreshToken, refreshExpiresAt, recordId: rec.id };
  }

  /** Refresh-token rotation with reuse detection (a replayed token revokes its whole family). */
  async refresh(rawToken: string | undefined, ctx: ReqCtx): Promise<Session> {
    const expired = () => unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    if (!rawToken) throw expired();

    const rec = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.crypto.hashToken(rawToken) }, include: { user: true } });
    if (!rec) throw expired();

    if (rec.revokedAt) {
      const withinGrace = rec.replacedById && Date.now() - rec.revokedAt.getTime() < REUSE_GRACE_MS;
      if (!withinGrace) {
        await this.prisma.refreshToken.updateMany({ where: { familyId: rec.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        await this.audit.log({ actorId: rec.userId, action: 'auth.token_reuse', resourceType: 'User', resourceId: rec.userId, ...ctx });
      }
      throw expired();
    }
    const u = rec.user;
    if (rec.expiresAt < new Date() || u.deletedAt || !['ACTIVE', 'PENDING_VERIFICATION'].includes(u.status)) throw expired();

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({ where: { id: rec.id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (claimed.count !== 1) throw expired();
      const next = await this.issueSession(u.id, u.sessionVersion, ctx, rec.familyId, tx);
      await tx.refreshToken.update({ where: { id: rec.id }, data: { replacedById: next.recordId } });
      const { recordId: _r, ...session } = next;
      return session;
    });
  }

  async logout(rawToken: string | undefined, ctx: ReqCtx) {
    if (!rawToken) return;
    const rec = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.crypto.hashToken(rawToken) } });
    if (!rec) return;
    await this.prisma.refreshToken.updateMany({ where: { familyId: rec.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actorId: rec.userId, action: 'auth.logout', resourceType: 'User', resourceId: rec.userId, ...ctx });
  }

  // ───────────── passwords ─────────────

  private async setPassword(tx: Tx, userId: string, newPassword: string) {
    const passwordHash = await this.hashPassword(newPassword);
    const user = await tx.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: new Date(), sessionVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null },
    });
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return user;
  }

  async changePassword(user: AuthUser, currentPassword: string, newPassword: string, ctx: ReqCtx): Promise<Session> {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await argon2.verify(row.passwordHash, currentPassword).catch(() => false))) {
      throw unauthorized('Your current password is incorrect.', 'INVALID_CREDENTIALS');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await this.setPassword(tx, user.id, newPassword);
      await this.audit.log({ actorId: user.id, actorRole: user.roles[0], action: 'auth.password_change', resourceType: 'User', resourceId: user.id, ...ctx }, tx);
      const { recordId: _r, ...session } = await this.issueSession(user.id, updated.sessionVersion, ctx, randomUUID(), tx);
      return session;
    });
  }

  async forgotPassword(email: string, captchaToken: string | undefined, ctx: ReqCtx) {
    await this.captcha.assert(captchaToken, ctx.ip);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt || !['ACTIVE', 'PENDING_VERIFICATION'].includes(user.status)) return; // generic response either way
    const token = this.crypto.randomToken();
    await this.prisma.verificationToken.create({
      data: { userId: user.id, type: 'PASSWORD_RESET', tokenHash: this.crypto.hashToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });
    const link = `${getEnv().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.send({
      to: user.email,
      subject: 'Reset your password',
      text: `Hello ${user.fullName},\n\nUse this link to choose a new password (valid for 30 minutes):\n${link}\n\nIf you did not ask for this, you can ignore this email — your password will not change.`,
    });
  }

  async resetPassword(token: string, newPassword: string, ctx: ReqCtx) {
    const rec = await this.prisma.verificationToken.findUnique({ where: { tokenHash: this.crypto.hashToken(token) } });
    if (!rec || rec.type !== 'PASSWORD_RESET' || rec.consumedAt || rec.expiresAt < new Date()) {
      throw conflict('This reset link is invalid or has expired. Please request a new one.', 'INVALID_TOKEN');
    }
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.verificationToken.updateMany({ where: { id: rec.id, consumedAt: null }, data: { consumedAt: new Date() } });
      if (claimed.count !== 1) throw conflict('This reset link is invalid or has expired.', 'INVALID_TOKEN');
      await this.setPassword(tx, rec.userId, newPassword);
      await tx.user.updateMany({ where: { id: rec.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date(), status: 'ACTIVE' } });
      await this.audit.log({ actorId: rec.userId, action: 'auth.password_reset', resourceType: 'User', resourceId: rec.userId, ...ctx }, tx);
    });
  }
}
