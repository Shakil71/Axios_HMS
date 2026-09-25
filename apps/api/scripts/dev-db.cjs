/* Local dev Postgres without Docker: persistent embedded Postgres on :54320.  Usage: npm run dev:db -w @hms/api */
const fs = require('fs');
const path = require('path');
const EmbeddedPostgres = require('embedded-postgres').default;

const dir = path.join(__dirname, '..', '.dev-pg');
const port = 54320;

(async () => {
  const fresh = !fs.existsSync(path.join(dir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: true, onLog: () => {}, onError: (e) => console.error(String(e)) });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase('hms_dev');
  console.log(`dev postgres ready: postgresql://postgres:postgres@localhost:${port}/hms_dev`);
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  setInterval(() => {}, 1 << 30);
})().catch((e) => { console.error(e); process.exit(1); });
