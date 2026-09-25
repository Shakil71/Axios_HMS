import { PrismaClient } from '@prisma/client';
import { seedDirectory } from './seed-directory';
import { DEMO_PASSWORD_DEFAULT, seedOperations } from './seed-operations';

export { DEMO_ACCOUNTS, DEMO_PASSWORD_DEFAULT } from './seed-operations';

/**
 * The whole demo world: sample directory + accounts for every role + a realistic operational history.
 * Idempotent: does nothing once the demo admin exists.
 */
export async function seedDemoWorld(prisma: PrismaClient, opts: { password?: string; putObject?: (key: string, bytes: Buffer) => void } = {}) {
  if ((await prisma.user.count({ where: { email: 'admin@demo.hms.test' } })) > 0) return;
  const password = opts.password ?? process.env.DEMO_PASSWORD ?? DEMO_PASSWORD_DEFAULT;
  const refs = await seedDirectory(prisma);
  await seedOperations(prisma, refs, { password, putObject: opts.putObject });
}
