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

const assetDir = () => path.resolve(__dirname, '../../pglite-assets');

/** On Vercel the WebAssembly runtime is copied to dist/pglite-assets at build time (see scripts/copy-pglite-assets.cjs). */
function bundledAssets(): NonNullable<ConstructorParameters<typeof PGlite>[0]> {
  const wasm = path.join(assetDir(), 'pglite.wasm');
  const data = path.join(assetDir(), 'pglite.data');
  if (!existsSync(wasm) || !existsSync(data)) return {};
  const wa = (globalThis as unknown as { WebAssembly: { Module: new (bytes: Buffer) => object } }).WebAssembly;
  return { wasmModule: new wa.Module(readFileSync(wasm)) as never, fsBundle: new Blob([readFileSync(data)]) };
}

/**
 * A pre-seeded database written at build time (scripts/build-demo-snapshot.cjs). Every serverless instance boots from the same
 * snapshot, so ids, sessions and links stay valid no matter which instance answers a request.
 */
function snapshot(): { data: Buffer; builtAt: number } | undefined {
  if (process.env.DEMO_SNAPSHOT_BUILD) return undefined;
  const file = path.join(assetDir(), 'demo-db.tgz');
  const meta = path.join(assetDir(), 'demo-meta.json');
  if (!existsSync(file) || !existsSync(meta)) return undefined;
  return { data: readFileSync(file), builtAt: Number(JSON.parse(readFileSync(meta, 'utf8')).builtAt) };
}

/** Demo files (generated PDFs) that belong to the snapshot. */
export function snapshotObjects(): Map<string, Buffer> | undefined {
  const file = path.join(assetDir(), 'demo-objects.json');
  if (!existsSync(file)) return undefined;
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  return new Map(Object.entries(raw).map(([k, v]) => [k, Buffer.from(v, 'base64')]));
}

/** Moves every stored date forward so a snapshot built weeks ago still shows "upcoming" appointments and "recent" activity. */
export async function shiftDates(db: PGlite, ms: number) {
  if (ms < 3_600_000) return;
  const days = Math.floor(ms / 86_400_000);
  const cols = await db.query<{ table_name: string; column_name: string; data_type: string }>(
    `SELECT c.table_name, c.column_name, c.data_type FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.data_type IN ('timestamp without time zone', 'date') AND c.table_name <> '_prisma_migrations'`,
  );
  await db.exec('SET session_replication_role = replica'); // audit tables are append-only; this is a bulk time shift of demo data only
  try {
    for (const c of cols.rows) {
      const shift = c.data_type === 'date' ? `${days}` : `${Math.floor(ms / 1000)} * interval '1 second'`;
      await db.exec(`UPDATE "${c.table_name}" SET "${c.column_name}" = "${c.column_name}" + ${shift} WHERE "${c.column_name}" IS NOT NULL`);
    }
  } finally {
    await db.exec('SET session_replication_role = DEFAULT');
  }
}

export interface DemoDatabase {
  adapter: PrismaPGlite;
  db: PGlite;
  /** True when the schema and data came from a build-time snapshot (no migrations or seeding needed). */
  fromSnapshot: boolean;
  /** Resolves once the schema (all migrations, incl. triggers and sequences) is applied. */
  ready: Promise<void>;
}

let instance: DemoDatabase | undefined;

/** One in-memory Postgres per process. Not persistent: everything is recreated on cold start. */
export function demoDatabase(): DemoDatabase {
  if (!instance) {
    const snap = snapshot();
    const db = new PGlite({ ...bundledAssets(), ...(snap ? { loadDataDir: new Blob([new Uint8Array(snap.data)]) } : {}) });
    const ready = (async () => {
      await db.waitReady;
      if (snap) return shiftDates(db, Date.now() - snap.builtAt);
      const dir = migrationsDir();
      for (const m of readdirSync(dir).filter((f) => /^\d{4}_/.test(f)).sort()) {
        await db.exec(readFileSync(path.join(dir, m, 'migration.sql'), 'utf8'));
      }
    })();
    instance = { adapter: new PrismaPGlite(db), db, fromSnapshot: !!snap, ready };
  }
  return instance;
}
