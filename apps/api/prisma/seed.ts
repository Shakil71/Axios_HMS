/**
 * Idempotent seed.
 *  - Always: permission catalog + system roles.
 *  - SEED_SUPERADMIN_EMAIL + SEED_SUPERADMIN_PASSWORD: creates the first SUPER_ADMIN.
 *  - SEED_DEMO=true: the whole demo world (sample directory, accounts for every role, cases, appointments, visas,
 *    invoices...). Everything is fictional and labelled. Documents are only created in demo mode (they need file storage).
 *    Refused in production unless SEED_ALLOW_DEMO_IN_PRODUCTION=true.
 * Optional: SEED_DEMO_PASSWORD (min 12 chars; default is the public demo password).
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from '@node-rs/argon2';
import { seedDemoWorld } from '../src/demo/demo';
import { syncRbac } from '../src/rbac/rbac-seed';

const prisma = new PrismaClient();

async function main() {
  await syncRbac(prisma);
  console.log('RBAC catalog and system roles synced.');

  const email = process.env.SEED_SUPERADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 12) throw new Error('SEED_SUPERADMIN_PASSWORD must be at least 12 characters');
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } });
    await prisma.user.upsert({
      where: { email }, update: {},
      create: { email, fullName: 'Super Admin', phone: '+8801000000000', passwordHash: await argon2.hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }), status: 'ACTIVE', emailVerifiedAt: new Date(), roles: { create: { roleId: role.id } } },
    });
    console.log(`SUPER_ADMIN ensured: ${email}`);
  }

  if (process.env.SEED_DEMO === 'true') {
    if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_DEMO_IN_PRODUCTION !== 'true') throw new Error('Refusing to seed demo data in production');
    const demoPassword = process.env.SEED_DEMO_PASSWORD;
    if (demoPassword && demoPassword.length < 12) throw new Error('SEED_DEMO_PASSWORD must be at least 12 characters');
    await seedDemoWorld(prisma, { password: demoPassword });
    console.log('Demo world seeded. Sign in as admin@ / coordinator@ / doctor@ / patient@demo.hms.test (see README).');
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
