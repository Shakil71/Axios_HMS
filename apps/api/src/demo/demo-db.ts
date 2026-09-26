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

/** On Vercel the WebAssembly runtime is copied to dist/pglite-assets at build time (see scripts/copy-pglite-assets.cjs). */
function bundledAssets(): ConstructorParameters<typeof PGlite>[0] | undefined {
  const dir = path.resolve(__dirname, '../../pglite-assets');
  const wasm = path.join(dir, 'pglite.wasm');
  const data = path.join(dir, 'pglite.data');
  if (!existsSync(wasm) || !existsSync(data)) return undefined;
  const wa = (globalThis as unknown as { WebAssembly: { Module: new (bytes: Buffer) => object } }).WebAssembly;
  return { wasmModule: new wa.Module(readFileSync(wasm)) as never, fsBundle: new Blob([readFileSync(data)]) };
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
    const assets = bundledAssets();
    const db = assets ? new PGlite(assets) : new PGlite();
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
