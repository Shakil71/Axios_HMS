/* Vercel build for the API: generate client → compile → (if a database is configured) migrate + sync roles/permissions. */
const { spawnSync } = require('child_process');
const env = { ...process.env };

const run = (cmd, args, extraEnv = {}) => {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...env, ...extraEnv } });
  if (r.status !== 0) {
    console.error(`\nBuild step failed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
};

run('npx', ['prisma', 'generate']);
run('npm', ['run', 'build']);
run('node', ['scripts/copy-pglite-assets.cjs']);
// Demo mode boots from this snapshot. Not fatal if it fails: the API then seeds itself at start-up instead.
spawnSync('node', ['scripts/build-demo-snapshot.cjs'], { stdio: 'inherit', env });

// Migrations need a direct (non-pooled) connection; poolers such as PgBouncer break advisory locks.
const runtimeUrl = env.DATABASE_URL || env.POSTGRES_PRISMA_URL || env.POSTGRES_URL;
const migrateUrl = env.MIGRATE_DATABASE_URL || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL_UNPOOLED || runtimeUrl;

if (!migrateUrl) {
  console.warn('\n[deploy] No database configured (DATABASE_URL / POSTGRES_URL). Skipping migrations and role setup.');
  console.warn('[deploy] Add a Postgres database to this Vercel project and redeploy.');
} else {
  const dbEnv = { DATABASE_URL: migrateUrl };
  run('npx', ['prisma', 'migrate', 'deploy'], dbEnv);
  // Idempotent: permission catalog + system roles (registration needs the PATIENT role). Demo data only if SEED_DEMO=true.
  run('npx', ['tsx', 'prisma/seed.ts'], dbEnv);
}
console.log('\n[deploy] API build finished.');
