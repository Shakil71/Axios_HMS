import { HttpException, HttpStatus } from '@nestjs/common';

export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly details?: unknown[],
  ) {
    super({ code, message, details }, status);
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST') => new AppError(HttpStatus.BAD_REQUEST, code, message);
export const unauthorized = (message = 'Please sign in to continue.', code = 'UNAUTHORIZED') =>
  new AppError(HttpStatus.UNAUTHORIZED, code, message);
export const forbidden = (message = 'You do not have access to this.', code = 'FORBIDDEN') =>
  new AppError(HttpStatus.FORBIDDEN, code, message);
export const notFound = (message = 'We could not find what you were looking for.', code = 'NOT_FOUND') =>
  new AppError(HttpStatus.NOT_FOUND, code, message);
export const conflict = (message: string, code = 'CONFLICT') => new AppError(HttpStatus.CONFLICT, code, message);
export const tooMany = (message = 'Too many attempts. Please try again later.') =>
  new AppError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', message);
