import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../common/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}

const SENSITIVE_KEY = /password|token|secret|nid|passport|hash|authorization|cookie/i;

/** Deep-masks sensitive keys so audit snapshots never contain secrets or identity numbers. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1)]),
    );
  }
  return value;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass `tx` to write the audit row in the same transaction as the change it describes. */
  async log(entry: AuditEntry, tx?: Tx) {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        before: entry.before === undefined ? Prisma.DbNull : (redact(entry.before) as Prisma.InputJsonValue),
        after: entry.after === undefined ? Prisma.DbNull : (redact(entry.after) as Prisma.InputJsonValue),
        metadata: entry.metadata === undefined ? Prisma.DbNull : (redact(entry.metadata) as Prisma.InputJsonValue),
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
