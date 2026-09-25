import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.controller';
import { passwordSchema } from '../auth/auth.schemas';
import { AuthService } from '../auth/auth.service';
import { AppError, conflict, forbidden, notFound } from '../common/http/errors';
import { Ctx, ReqCtx } from '../common/http/request-context';
import { Paginated, ZodPipe, pageParams } from '../common/http/response';
import { PrismaService } from '../common/prisma.service';
import { AuthUser, CurrentUser, RequirePermissions, can, primaryRole } from '../rbac/auth-user';
import { ALL_PERMISSIONS } from '../rbac/permissions';
import { StatsService } from './stats.service';

const text = (n: number) => z.string().trim().max(n);
const invalid = (field: string, message: string) => new AppError(422, 'VALIDATION_FAILED', message, [{ field, message }]);

const usersQuery = z.object({
  page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: text(100).optional(), role: text(60).optional(), status: z.enum(['ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED', 'DISABLED']).optional(), kind: z.enum(['staff', 'patients', 'all']).default('staff'),
});
const createUser = z
  .object({
    fullName: text(100).min(2), email: z.email().max(254).transform((e) => e.trim().toLowerCase()), phone: z.string().trim().regex(/^\+?[0-9]{8,15}$/, 'Enter a phone number with country code.').optional(),
    roles: z.array(text(60)).min(1).max(5), password: passwordSchema, doctorId: z.uuid().optional(),
  })
  .strict();
const updateUser = z.object({ fullName: text(100).min(2), status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']), roles: z.array(text(60)).min(1).max(5) }).partial().strict();
const resetPassword = z.object({ password: passwordSchema }).strict();
const createRole = z.object({ name: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{2,39}$/, 'Use capital letters, numbers and underscores.'), description: text(200).optional(), permissions: z.array(z.string()).max(200) }).strict();
const setPermissions = z.object({ permissions: z.array(z.string()).max(200) }).strict();
const auditQuery = z.object({
  page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional(),
  actorId: z.uuid().optional(), action: text(60).optional(), resourceType: text(60).optional(), q: text(100).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(),
});
const settingSchema = z.object({ key: z.string().trim().regex(/^[a-z0-9._-]{3,80}$/, 'Use lowercase letters, numbers, dots, dashes.'), value: text(2000), isPublic: z.boolean().default(false), description: text(200).nullish() }).strict();
const reportQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    readonly stats: StatsService,
  ) {}

  private log(u: AuthUser, ctx: ReqCtx, action: string, type: string, id: string | undefined, extra: { before?: unknown; after?: unknown; metadata?: unknown } = {}, tx?: Prisma.TransactionClient) {
    return this.audit.log({ actorId: u.id, actorRole: primaryRole(u), action, resourceType: type, resourceId: id, ...extra, ...ctx }, tx);
  }

  // ───────── users ─────────

  private userDto(u: { id: string; fullName: string; email: string; phone: string | null; status: string; lastLoginAt: Date | null; createdAt: Date; emailVerifiedAt: Date | null; roles: { role: { name: string } }[]; doctorProfile?: { id: string; slug: string } | null }) {
    return { id: u.id, fullName: u.fullName, email: u.email, phone: u.phone, status: u.status, roles: u.roles.map((r) => r.role.name), lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, emailVerified: !!u.emailVerifiedAt, doctor: u.doctorProfile ?? null };
  }

  async listUsers(q: z.infer<typeof usersQuery>) {
    const { page, pageSize, skip, take } = pageParams(q);
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(q.kind === 'staff' ? { roles: { some: { role: { name: { not: 'PATIENT' } } } } } : q.kind === 'patients' ? { roles: { some: { role: { name: 'PATIENT' } } } } : {}),
      ...(q.role ? { roles: { some: { role: { name: q.role } } } } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ fullName: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, select: { id: true, fullName: true, email: true, phone: true, status: true, lastLoginAt: true, createdAt: true, emailVerifiedAt: true, roles: { select: { role: { select: { name: true } } } }, doctorProfile: { select: { id: true, slug: true } } } }),
      this.prisma.user.count({ where }),
    ]);
    return new Paginated(rows.map((r) => this.userDto(r)), { page, pageSize, total });
  }

  private async resolveRoles(actor: AuthUser, names: string[]) {
    const roles = await this.prisma.role.findMany({ where: { name: { in: names } } });
    if (roles.length !== new Set(names).size) throw invalid('roles', 'One of the roles does not exist.');
    if (roles.some((r) => r.name === 'PATIENT')) throw invalid('roles', 'Patients register themselves; choose a staff role.');
    if (roles.some((r) => r.name === 'SUPER_ADMIN') && !actor.roles.includes('SUPER_ADMIN')) throw forbidden('Only a super admin can grant the super admin role.');
    return roles;
  }

  async createUser(actor: AuthUser, dto: z.infer<typeof createUser>, ctx: ReqCtx) {
    const roles = await this.resolveRoles(actor, dto.roles);
    if (await this.prisma.user.count({ where: { OR: [{ email: dto.email }, ...(dto.phone ? [{ phone: dto.phone }] : [])] } })) throw conflict('A user with this email or phone already exists.', 'ALREADY_EXISTS');
    if (dto.doctorId) {
      const doc = await this.prisma.doctor.findFirst({ where: { id: dto.doctorId, deletedAt: null }, select: { userId: true } });
      if (!doc) throw invalid('doctorId', 'This doctor profile does not exist.');
      if (doc.userId) throw invalid('doctorId', 'This doctor profile already has an account.');
    }
    const passwordHash = await this.auth.hashPassword(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { fullName: dto.fullName, email: dto.email, phone: dto.phone, passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date(), roles: { create: roles.map((r) => ({ roleId: r.id })) } },
        select: { id: true, fullName: true, email: true, phone: true, status: true, lastLoginAt: true, createdAt: true, emailVerifiedAt: true, roles: { select: { role: { select: { name: true } } } } },
      });
      if (dto.doctorId) await tx.doctor.update({ where: { id: dto.doctorId }, data: { userId: u.id } });
      await this.log(actor, ctx, 'staff.create', 'User', u.id, { after: { roles: dto.roles, email: dto.email } }, tx);
      return u;
    });
    return this.userDto(user);
  }

  async updateUser(actor: AuthUser, id: string, dto: z.infer<typeof updateUser>, ctx: ReqCtx) {
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true, status: true, roles: { select: { role: { select: { name: true } } } } } });
    if (!target) throw notFound('We could not find this user.');
    const targetRoles = target.roles.map((r) => r.role.name);
    if (id === actor.id && (dto.status || dto.roles)) throw forbidden('You cannot change your own roles or status.');
    if (targetRoles.includes('SUPER_ADMIN') && !actor.roles.includes('SUPER_ADMIN')) throw forbidden('Only a super admin can change a super admin.');
    if (targetRoles.includes('PATIENT') && dto.roles) throw forbidden('Patient accounts cannot be given staff roles here.');
    const roles = dto.roles ? await this.resolveRoles(actor, dto.roles) : undefined;
    const deactivate = dto.status && dto.status !== 'ACTIVE';

    const user = await this.prisma.$transaction(async (tx) => {
      if (roles) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) });
      }
      const u = await tx.user.update({
        where: { id },
        data: { fullName: dto.fullName, status: dto.status, ...(deactivate ? { sessionVersion: { increment: 1 } } : {}) },
        select: { id: true, fullName: true, email: true, phone: true, status: true, lastLoginAt: true, createdAt: true, emailVerifiedAt: true, roles: { select: { role: { select: { name: true } } } } },
      });
      if (deactivate) await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }); // sign out everywhere
      if (roles) await this.log(actor, ctx, 'rbac.role_change', 'User', id, { before: { roles: targetRoles }, after: { roles: dto.roles } }, tx);
      if (dto.status && dto.status !== target.status) await this.log(actor, ctx, 'staff.status', 'User', id, { before: { status: target.status }, after: { status: dto.status } }, tx);
      return u;
    });
    return this.userDto(user);
  }

  async resetUserPassword(actor: AuthUser, id: string, password: string, ctx: ReqCtx) {
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true, roles: { select: { role: { select: { name: true } } } } } });
    if (!target) throw notFound('We could not find this user.');
    if (target.roles.some((r) => r.role.name === 'SUPER_ADMIN') && !actor.roles.includes('SUPER_ADMIN')) throw forbidden('Only a super admin can change a super admin.');
    const passwordHash = await this.auth.hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, passwordChangedAt: new Date(), sessionVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null } });
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.log(actor, ctx, 'staff.password_reset', 'User', id, {}, tx);
    });
  }

  async staffDirectory() {
    const rows = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE', roles: { some: { role: { name: { not: 'PATIENT' } } } } },
      select: { id: true, fullName: true, roles: { select: { role: { select: { name: true } } } }, caseAssignments: { where: { unassignedAt: null, case: { is: { deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } } } }, select: { id: true } } },
      orderBy: { fullName: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, fullName: r.fullName, roles: r.roles.map((x) => x.role.name), activeCases: r.caseAssignments.length }));
  }

  // ───────── roles & permissions ─────────

  async listRoles() {
    const roles = await this.prisma.role.findMany({ orderBy: [{ isSystem: 'desc' }, { name: 'asc' }], include: { permissions: { select: { permission: { select: { key: true } } } }, _count: { select: { users: true } } } });
    return roles.map((r) => ({ id: r.id, name: r.name, description: r.description, isSystem: r.isSystem, userCount: r._count.users, permissions: r.permissions.map((p) => p.permission.key).sort() }));
  }

  permissionCatalog() {
    const groups = new Map<string, string[]>();
    for (const key of ALL_PERMISSIONS) groups.set(key.split('.')[0], [...(groups.get(key.split('.')[0]) ?? []), key]);
    return [...groups].map(([module, permissions]) => ({ module, permissions }));
  }

  private async permissionIds(keys: string[]) {
    const unique = [...new Set(keys)];
    const bad = unique.filter((k) => !ALL_PERMISSIONS.includes(k));
    if (bad.length) throw invalid('permissions', `Unknown permission: ${bad[0]}`);
    const rows = await this.prisma.permission.findMany({ where: { key: { in: unique } }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async createRole(actor: AuthUser, dto: z.infer<typeof createRole>, ctx: ReqCtx) {
    if (await this.prisma.role.count({ where: { name: dto.name } })) throw conflict('A role with this name already exists.', 'ALREADY_EXISTS');
    const ids = await this.permissionIds(dto.permissions);
    const role = await this.prisma.$transaction(async (tx) => {
      const r = await tx.role.create({ data: { name: dto.name, description: dto.description, isSystem: false, permissions: { create: ids.map((permissionId) => ({ permissionId })) } } });
      await this.log(actor, ctx, 'rbac.role_create', 'Role', r.id, { after: { name: r.name, permissions: dto.permissions } }, tx);
      return r;
    });
    return { id: role.id, name: role.name };
  }

  async setRolePermissions(actor: AuthUser, id: string, keys: string[], ctx: ReqCtx) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { permissions: { select: { permission: { select: { key: true } } } } } });
    if (!role) throw notFound('We could not find this role.');
    if (role.name === 'SUPER_ADMIN') throw forbidden('The super admin role always has every permission.');
    if (role.name === 'PATIENT') throw forbidden('Patients use ownership-based access, not permissions.');
    const ids = await this.permissionIds(keys);
    const before = role.permissions.map((p) => p.permission.key).sort();
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({ data: ids.map((permissionId) => ({ roleId: id, permissionId })) });
      await this.log(actor, ctx, 'rbac.permission_change', 'Role', id, { before: { permissions: before }, after: { permissions: [...new Set(keys)].sort() }, metadata: { role: role.name } }, tx);
    });
  }

  async deleteRole(actor: AuthUser, id: string, ctx: ReqCtx) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw notFound('We could not find this role.');
    if (role.isSystem) throw forbidden('Built-in roles cannot be deleted.');
    if (role._count.users) throw conflict('Remove this role from its users first.', 'ROLE_IN_USE');
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await this.log(actor, ctx, 'rbac.role_delete', 'Role', id, { before: { name: role.name } }, tx);
    });
  }

  // ───────── audit log & settings ─────────

  async auditLogs(q: z.infer<typeof auditQuery>) {
    const { page, pageSize, skip, take } = pageParams(q);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.actorId ? { actorId: q.actorId } : {}), ...(q.resourceType ? { resourceType: q.resourceType } : {}), ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
      ...(q.q ? { OR: [{ action: { contains: q.q, mode: 'insensitive' } }, { actor: { fullName: { contains: q.q, mode: 'insensitive' } } }, { resourceId: { contains: q.q } }] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { actor: { select: { id: true, fullName: true, email: true } } } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return new Paginated(rows.map((r) => ({ id: r.id, action: r.action, resourceType: r.resourceType, resourceId: r.resourceId, actor: r.actor, actorRole: r.actorRole, ip: r.ip, userAgent: r.userAgent, before: r.before, after: r.after, metadata: r.metadata, createdAt: r.createdAt })), { page, pageSize, total });
  }

  settings() {
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' }, select: { id: true, key: true, value: true, isPublic: true, description: true, updatedAt: true } });
  }

  async saveSetting(actor: AuthUser, dto: z.infer<typeof settingSchema>, ctx: ReqCtx) {
    const before = await this.prisma.systemSetting.findUnique({ where: { key: dto.key } });
    const row = await this.prisma.$transaction(async (tx) => {
      const r = await tx.systemSetting.upsert({ where: { key: dto.key }, update: { value: dto.value, isPublic: dto.isPublic, description: dto.description, updatedById: actor.id }, create: { key: dto.key, value: dto.value, isPublic: dto.isPublic, description: dto.description, updatedById: actor.id } });
      await this.log(actor, ctx, 'settings.update', 'SystemSetting', r.id, { before: before ? { value: before.value, isPublic: before.isPublic } : undefined, after: { key: dto.key, value: dto.value, isPublic: dto.isPublic } }, tx);
      return r;
    });
    return { id: row.id, key: row.key, value: row.value, isPublic: row.isPublic };
  }
}

const uuid = () => new ParseUUIDPipe();

@Controller('admin')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  @Get('stats/overview') @RequirePermissions('reports.view') overview() { return this.svc.stats.overview(); }
  @Get('reports/summary') @RequirePermissions('reports.view')
  report(@Query(new ZodPipe(reportQuery)) q: z.infer<typeof reportQuery>) {
    const to = q.to ?? new Date();
    return this.svc.stats.report(q.from ?? new Date(to.getTime() - 90 * 86_400_000), to);
  }

  @Get('users') @RequirePermissions('staff.manage') users(@Query(new ZodPipe(usersQuery)) q: z.infer<typeof usersQuery>) { return this.svc.listUsers(q); }
  @Post('users') @RequirePermissions('staff.manage') createUser(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createUser)) d: z.infer<typeof createUser>, @Ctx() c: ReqCtx) { return this.svc.createUser(u, d, c); }
  @Patch('users/:id') @RequirePermissions('staff.manage') updateUser(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body(new ZodPipe(updateUser)) d: z.infer<typeof updateUser>, @Ctx() c: ReqCtx) { return this.svc.updateUser(u, id, d, c); }
  @Post('users/:id/reset-password') @HttpCode(204) @RequirePermissions('staff.manage')
  async reset(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body(new ZodPipe(resetPassword)) d: { password: string }, @Ctx() c: ReqCtx) { await this.svc.resetUserPassword(u, id, d.password, c); }

  /** Staff picker for case assignment: allowed for anyone who can assign cases or manage staff. */
  @Get('staff-directory')
  directory(@CurrentUser() u: AuthUser) {
    if (!can(u, 'cases.assign') && !can(u, 'staff.manage')) throw forbidden();
    return this.svc.staffDirectory();
  }

  @Get('roles') @RequirePermissions('staff.manage') roles() { return this.svc.listRoles(); }
  @Get('permissions') @RequirePermissions('staff.manage') permissions() { return this.svc.permissionCatalog(); }
  @Post('roles') @RequirePermissions('roles.manage') createRole(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createRole)) d: z.infer<typeof createRole>, @Ctx() c: ReqCtx) { return this.svc.createRole(u, d, c); }
  @Put('roles/:id/permissions') @HttpCode(204) @RequirePermissions('roles.manage')
  async setPerms(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body(new ZodPipe(setPermissions)) d: { permissions: string[] }, @Ctx() c: ReqCtx) { await this.svc.setRolePermissions(u, id, d.permissions, c); }
  @Delete('roles/:id') @HttpCode(204) @RequirePermissions('roles.manage')
  async deleteRole(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Ctx() c: ReqCtx) { await this.svc.deleteRole(u, id, c); }

  @Get('audit-logs') @RequirePermissions('audit.view') audit(@Query(new ZodPipe(auditQuery)) q: z.infer<typeof auditQuery>) { return this.svc.auditLogs(q); }
  @Get('settings') @RequirePermissions('settings.manage') settings() { return this.svc.settings(); }
  @Put('settings') @RequirePermissions('settings.manage') saveSetting(@CurrentUser() u: AuthUser, @Body(new ZodPipe(settingSchema)) d: z.infer<typeof settingSchema>, @Ctx() c: ReqCtx) { return this.svc.saveSetting(u, d, c); }
}

@Module({ imports: [AuthModule], controllers: [AdminController], providers: [AdminService, StatsService], exports: [StatsService] })
export class AdminModule {}
