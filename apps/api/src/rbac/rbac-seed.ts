import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, ROLE_DEFAULTS, ROLE_NAMES } from './permissions';

/**
 * Idempotently syncs the permission catalog and SYSTEM roles.
 * System roles get their default permissions on first creation only; custom roles are never touched.
 */
export async function syncRbac(prisma: PrismaClient) {
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: { module: key.split('.')[0] },
      create: { key, module: key.split('.')[0] },
    });
  }
  const permissions = await prisma.permission.findMany();
  const idByKey = new Map(permissions.map((p) => [p.key, p.id]));

  for (const name of ROLE_NAMES) {
    const def = ROLE_DEFAULTS[name];
    const existing = await prisma.role.findUnique({ where: { name } });
    const role = await prisma.role.upsert({
      where: { name },
      update: { isSystem: true },
      create: { name, description: def.description, isSystem: true },
    });
    // Defaults are applied when the role is first created, so later customisation by a SUPER_ADMIN survives every deploy.
    // SUPER_ADMIN is the exception: it always holds the complete catalog, including permissions added in newer releases.
    if (existing && name !== 'SUPER_ADMIN') continue;
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: def.permissions.map((k) => ({ roleId: role.id, permissionId: idByKey.get(k)! })),
      skipDuplicates: true,
    });
  }
}
