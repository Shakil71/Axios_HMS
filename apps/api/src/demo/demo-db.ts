import { PGlite } from '@electric-sql/pglite';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { PrismaPGlite } from 'pglite-prisma-adapter';

function migrationsDir() {
  for (const rel of ['../../prisma/migrations', '../../../prisma/migrations', '../../../../prisma/migrations']) {
    const dir = path.resolve(__dirname, rel);
    if (existsSync(dir)) return dir;
  }
  throw new Error('Demo mode: prisma/migrations not found next to the compiled API');
}

export interface DemoDatabase {
  adapter: PrismaPGlite;
  /** Resolves once the schema (all migrations, incl. triggers and sequences) is applied. */
  ready: Promise<void>;
}

let instance: DemoDatabase | undefined;

/** One in-memory Postgres per process. Not persistent: everything is recreated on cold start. */
export function demoDatabase(): DemoDatabase {
  if (!instance) {
    const db = new PGlite();
    const ready = (async () => {
      await db.waitReady;
      const dir = migrationsDir();
      for (const m of readdirSync(dir).filter((f) => /^\d{4}_/.test(f)).sort()) {
        await db.exec(readFileSync(path.join(dir, m, 'migration.sql'), 'utf8'));
      }
    })();
    instance = { adapter: new PrismaPGlite(db), ready };
  }
  return instance;
}
