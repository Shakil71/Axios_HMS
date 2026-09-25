import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { clientIp } from './client-ip';

export interface ReqCtx {
  ip: string | null;
  userAgent: string | null;
}

export const ctxOf = (req: Request): ReqCtx => ({
  ip: clientIp(req),
  userAgent: (req.headers['user-agent'] as string | undefined)?.slice(0, 300) ?? null,
});

export const Ctx = createParamDecorator((_d: unknown, ctx: ExecutionContext): ReqCtx =>
  ctxOf(ctx.switchToHttp().getRequest<Request>()),
);
