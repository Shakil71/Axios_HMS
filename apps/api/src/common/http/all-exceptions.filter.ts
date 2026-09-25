import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
};

/** Maps every error to the documented envelope. Never leaks stack traces, SQL or paths. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request & { id?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong on our side. Please try again.';
    let details: unknown[] | undefined;

    if (exception instanceof ZodError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      code = 'VALIDATION_FAILED';
      message = 'Please check the highlighted fields.';
      details = exception.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = STATUS_CODES[status] ?? 'ERROR';
      if (typeof body === 'object' && body !== null) {
        const b = body as { code?: string; message?: string | string[]; details?: unknown[] };
        code = b.code ?? code;
        if (typeof b.message === 'string') message = b.message;
        details = b.details;
      } else if (typeof body === 'string') {
        message = body;
      }
      if (status >= 500) message = 'Something went wrong on our side. Please try again.';
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'CONFLICT';
        message = 'This already exists.';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'We could not find what you were looking for.';
      } else {
        this.logger.error({ err: exception.code, requestId: req.id }, 'database error');
      }
    } else {
      this.logger.error({ err: exception instanceof Error ? exception.message : 'unknown', requestId: req.id }, 'unhandled error');
    }

    res.status(status).json({
      success: false,
      error: { code, message, details: details ?? [], requestId: req.id },
    });
  }
}
