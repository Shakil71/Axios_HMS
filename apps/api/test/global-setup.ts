import { execSync } from 'child_process';
import { rmSync } from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const EmbeddedPostgres = require('embedded-postgres').default;

const PORT = 54330;
const DIR = path.join(__dirname, '..', '.tmp-pg-test');

export default async function globalSetup() {
  rmSync(DIR, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({ databaseDir: DIR, user: 'postgres', password: 'postgres', port: PORT, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('hms_test');
  (globalThis as any).__PG__ = pg;

  const url = `postgresql://postgres:postgres@localhost:${PORT}/hms_test?schema=public`;
  Object.assign(process.env, {
    NODE_ENV: 'test',
    STORAGE_DRIVER: 'memory',
    DATABASE_URL: url,
    JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
    FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    RATE_LIMIT_ENABLED: 'false',
    APP_URL: 'http://localhost:3000',
  });
  execSync('npx prisma migrate deploy', { cwd: path.join(__dirname, '..'), env: process.env, stdio: 'pipe' });
}
