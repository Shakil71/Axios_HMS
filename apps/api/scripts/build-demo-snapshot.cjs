/* Seeds the demo world once, at build time, and writes a snapshot next to the compiled API (dist/pglite-assets).
   Every serverless instance then boots from the same data instead of seeding its own copy with different ids.
   Requires `npm run build` and scripts/copy-pglite-assets.cjs first. */
process.env.DEMO_MODE = 'true';
process.env.DEMO_SNAPSHOT_BUILD = '1';
process.env.NODE_ENV ||= 'production';

const fs = require('fs');
const path = require('path');
require('../dist/src/config/vercel-env');
const { PrismaClient } = require('@prisma/client');
const { demoDatabase } = require('../dist/src/demo/demo-db');
const { seedDemoWorld } = require('../dist/src/demo/demo');
const { syncRbac } = require('../dist/src/rbac/rbac-seed');

(async () => {
  const started = Date.now();
  const demo = demoDatabase();
  await demo.ready;
  const prisma = new PrismaClient({ adapter: demo.adapter });
  const objects = new Map();
  await syncRbac(prisma);
  await seedDemoWorld(prisma, { putObject: (key, bytes) => objects.set(key, bytes) });
  await prisma.$disconnect();

  const dump = Buffer.from(await (await demo.db.dumpDataDir('gzip')).arrayBuffer());
  const dir = path.join(__dirname, '..', 'dist', 'pglite-assets');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'demo-db.tgz'), dump);
  fs.writeFileSync(path.join(dir, 'demo-objects.json'), JSON.stringify(Object.fromEntries([...objects].map(([k, v]) => [k, Buffer.from(v).toString('base64')]))));
  fs.writeFileSync(path.join(dir, 'demo-meta.json'), JSON.stringify({ builtAt: Date.now() }));
  console.log(`[deploy] Demo snapshot written: ${objects.size} files, ${(dump.length / 1e6).toFixed(1)} MB, ${Date.now() - started} ms`);
  process.exit(0);
})().catch((e) => {
  console.error('[deploy] Demo snapshot failed:', e);
  process.exit(1);
});
