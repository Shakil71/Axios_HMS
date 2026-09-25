import { Body, Controller, Get, Global, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { z } from 'zod';
import { notFound } from '../common/http/errors';
import { Paginated, ZodPipe, pageParams } from '../common/http/response';
import { PrismaService, Tx } from '../common/prisma.service';
import { AuthUser, CurrentUser } from '../rbac/auth-user';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  entityType?: string;
  entityId?: string;
}

/**
 * In-app notifications. Each notification also records one delivery row per channel (IN_APP now); e-mail / SMS / WhatsApp
 * providers plug in later by adding delivery rows and a queue worker, without changing any caller.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotifyInput, tx?: Tx) {
    const db = tx ?? this.prisma;
    await db.notification.create({
      data: {
        userId: input.userId, type: input.type, title: input.title, body: input.body ?? null,
        entityType: input.entityType, entityId: input.entityId,
        deliveries: { create: [{ channel: 'IN_APP', status: 'SENT', provider: 'in-app', sentAt: new Date() }] },
      },
    });
  }

  /** Tell the patient who owns the case. */
  async notifyPatientOfCase(caseId: string, type: NotificationType, title: string, body?: string, tx?: Tx) {
    const db = tx ?? this.prisma;
    const c = await db.medicalCase.findUnique({ where: { id: caseId }, select: { id: true, patient: { select: { userId: true } } } });
    if (c) await this.notify({ userId: c.patient.userId, type, title, body, entityType: 'MedicalCase', entityId: c.id }, tx);
  }

  /** Tell the staff currently assigned to the case (and its selected doctor), except the person who caused the event. */
  async notifyTeamOfCase(caseId: string, type: NotificationType, title: string, body?: string, exceptUserId?: string, tx?: Tx) {
    const db = tx ?? this.prisma;
    const c = await db.medicalCase.findUnique({
      where: { id: caseId },
      select: { id: true, assignments: { where: { unassignedAt: null }, select: { staffId: true } }, selectedDoctor: { select: { userId: true } } },
    });
    if (!c) return;
    const ids = new Set([...c.assignments.map((a) => a.staffId), ...(c.selectedDoctor?.userId ? [c.selectedDoctor.userId] : [])]);
    if (exceptUserId) ids.delete(exceptUserId);
    for (const userId of ids) await this.notify({ userId, type, title, body, entityType: 'MedicalCase', entityId: c.id }, tx);
  }

  async list(user: AuthUser, q: { page?: number; pageSize?: number; unread?: boolean }) {
    const { page, pageSize, skip, take } = pageParams(q);
    const where = { userId: user.id, ...(q.unread ? { readAt: null } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, select: { id: true, type: true, title: true, body: true, entityType: true, entityId: true, readAt: true, createdAt: true } }),
      this.prisma.notification.count({ where }),
    ]);
    return new Paginated(rows, { page, pageSize, total });
  }

  unreadCount(user: AuthUser) {
    return this.prisma.notification.count({ where: { userId: user.id, readAt: null } });
  }

  async markRead(user: AuthUser, id: string) {
    const r = await this.prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    if (r.count === 0 && !(await this.prisma.notification.count({ where: { id, userId: user.id } }))) throw notFound();
  }

  markAllRead(user: AuthUser) {
    return this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  }
}

const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  unread: z.enum(['true']).optional().transform((v) => v === 'true'),
});

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) { return this.svc.list(u, q); }
  @Get('unread-count') async count(@CurrentUser() u: AuthUser) { return { count: await this.svc.unreadCount(u) }; }
  @Post('read-all') @HttpCode(200) async readAll(@CurrentUser() u: AuthUser) { await this.svc.markAllRead(u); return { ok: true }; }
  @Post(':id/read') @HttpCode(200) async read(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) { await this.svc.markRead(u, id); return { ok: true }; }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
