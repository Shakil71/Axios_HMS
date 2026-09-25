import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface ReqCtx {
  ip: string | null;
  userAgent: string | null;
}

export const ctxOf = (req: Request): ReqCtx => ({
  ip: req.ip ?? null,
  userAgent: (req.headers['user-agent'] as string | undefined)?.slice(0, 300) ?? null,
});

export const Ctx = createParamDecorator((_d: unknown, ctx: ExecutionContext): ReqCtx =>
  ctxOf(ctx.switchToHttp().getRequest<Request>()),
);
