import { Injectable } from '@nestjs/common';
import { getEnv } from '../config/env';
import { badRequest } from '../common/http/errors';

/** Cloudflare Turnstile verification. No-op when CAPTCHA_SECRET_KEY is unset (local/dev). */
@Injectable()
export class CaptchaService {
  get enabled() {
    return !!getEnv().CAPTCHA_SECRET_KEY;
  }

  async assert(token: string | undefined, ip: string | null) {
    const secret = getEnv().CAPTCHA_SECRET_KEY;
    if (!secret) return;
    if (!token) throw badRequest('Please complete the security check.', 'CAPTCHA_REQUIRED');
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    let ok = false;
    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
      ok = ((await res.json()) as { success?: boolean }).success === true;
    } catch {
      ok = false;
    }
    if (!ok) throw badRequest('The security check failed. Please try again.', 'CAPTCHA_FAILED');
  }
}
