import { Body, Controller, Get, HttpCode, Module, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { forbidden } from '../common/http/errors';
import { Ctx, ReqCtx } from '../common/http/request-context';
import { ZodPipe } from '../common/http/response';
import { getEnv, isDemo, isProd } from '../config/env';
import { AuthUser, CurrentUser, Public } from '../rbac/auth-user';
import { AuthService, Session } from './auth.service';
import { CaptchaService } from './captcha.service';
import {
  changePasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, verifyEmailSchema,
} from './auth.schemas';

const COOKIE = 'hms_rt';
const COOKIE_PATH = '/api/v1/auth';
// Demo visitors switch between many accounts from one address, so the limit is looser there.
const STRICT = { default: { limit: isDemo() ? 60 : 10, ttl: 60_000 } };

function setRefreshCookie(res: Response, s: Session) {
  res.cookie(COOKIE, s.refreshToken, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: COOKIE_PATH,
    expires: s.refreshExpiresAt,
  });
}

/** Cookie-authenticated endpoints need a custom header (not sendable cross-site) and a matching Origin. */
function assertSameSiteIntent(req: Request) {
  if (req.headers['x-requested-with'] !== 'hms-web') throw forbidden('Request blocked.', 'CSRF');
  const origin = req.headers.origin;
  if (origin && origin !== new URL(getEnv().APP_URL).origin) throw forbidden('Request blocked.', 'CSRF');
}

const sessionBody = (s: Session) => ({ accessToken: s.accessToken, expiresIn: s.expiresIn });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(STRICT)
  @Post('register')
  @HttpCode(201)
  async register(@Body(new ZodPipe(registerSchema)) dto: ReturnType<typeof registerSchema.parse>, @Ctx() ctx: ReqCtx) {
    await this.auth.register(dto, ctx);
    return { message: 'Please check your email to confirm your account.' };
  }

  @Public()
  @Throttle(STRICT)
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body(new ZodPipe(verifyEmailSchema)) dto: { token: string }, @Ctx() ctx: ReqCtx) {
    await this.auth.verifyEmail(dto.token, ctx);
    return { message: 'Your email address is confirmed.' };
  }

  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(200)
  async resend(@CurrentUser() user: AuthUser) {
    await this.auth.resendVerification(user);
    return { message: 'If your email is not yet confirmed, we have sent a new link.' };
  }

  @Public()
  @Throttle(STRICT)
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(loginSchema)) dto: ReturnType<typeof loginSchema.parse>, @Ctx() ctx: ReqCtx, @Res({ passthrough: true }) res: Response) {
    const { session, user } = await this.auth.login(dto.email, dto.password, dto.captchaToken, ctx);
    setRefreshCookie(res, session);
    return { ...sessionBody(session), user };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Ctx() ctx: ReqCtx, @Res({ passthrough: true }) res: Response) {
    assertSameSiteIntent(req);
    const session = await this.auth.refresh(req.cookies?.[COOKIE], ctx);
    setRefreshCookie(res, session);
    return sessionBody(session);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Ctx() ctx: ReqCtx, @Res({ passthrough: true }) res: Response) {
    assertSameSiteIntent(req);
    await this.auth.logout(req.cookies?.[COOKIE], ctx);
    res.clearCookie(COOKIE, { path: COOKIE_PATH });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  async forgot(@Body(new ZodPipe(forgotPasswordSchema)) dto: { email: string; captchaToken?: string }, @Ctx() ctx: ReqCtx) {
    await this.auth.forgotPassword(dto.email, dto.captchaToken, ctx);
    return { message: 'If an account exists for this email, we have sent a reset link.' };
  }

  @Public()
  @Throttle(STRICT)
  @Post('reset-password')
  @HttpCode(200)
  async reset(@Body(new ZodPipe(resetPasswordSchema)) dto: { token: string; password: string }, @Ctx() ctx: ReqCtx) {
    await this.auth.resetPassword(dto.token, dto.password, ctx);
    return { message: 'Your password has been changed. Please sign in.' };
  }

  @Post('change-password')
  @Throttle(STRICT)
  @HttpCode(200)
  async change(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(changePasswordSchema)) dto: { currentPassword: string; newPassword: string },
    @Ctx() ctx: ReqCtx,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.changePassword(user, dto.currentPassword, dto.newPassword, ctx);
    setRefreshCookie(res, session);
    return sessionBody(session);
  }

  /** Permissions are returned only to drive menu visibility; the API re-checks everything. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles,
      permissions: [...user.permissions].sort(),
      patientProfileId: user.patientProfileId,
      emailVerified: user.emailVerified,
    };
  }
}

@Module({ controllers: [AuthController], providers: [AuthService, CaptchaService], exports: [AuthService] })
export class AuthModule {}
