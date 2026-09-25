import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, ROLE_DEFAULTS, ROLE_NAMES } from './permissions';

/**
 * Idempotently syncs the permission catalog and SYSTEM roles.
 * System roles are reset to defaults; custom roles (isSystem = false) are never touched.
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
    const role = await prisma.role.upsert({
      where: { name },
      update: { description: def.description, isSystem: true },
      create: { name, description: def.description, isSystem: true },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: def.permissions.map((k) => ({ roleId: role.id, permissionId: idByKey.get(k)! })),
      skipDuplicates: true,
    });
  }
}
