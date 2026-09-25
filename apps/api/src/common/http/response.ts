import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ZodType } from 'zod';
import { PipeTransform } from '@nestjs/common';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export class Paginated<T> {
  constructor(
    public readonly items: T[],
    public readonly meta: PageMeta,
  ) {}
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value) => {
        if (value instanceof Paginated) return { success: true, data: value.items, meta: value.meta };
        return { success: true, data: value ?? null, meta: {} };
      }),
    );
  }
}

/** Validates a body/query with Zod; failures surface as 422 through AllExceptionsFilter. */
export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}

export const pageParams = (q: { page?: number; pageSize?: number }) => {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
};
