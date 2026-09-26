/* Copies PGlite's WebAssembly runtime next to the compiled API so the Vercel function bundle always contains it
   (file tracing cannot see assets that the library resolves at runtime). Used only by demo mode. */
const fs = require('fs');
const path = require('path');

const entry = require.resolve('@electric-sql/pglite');
const src = path.dirname(entry);
const dest = path.join(__dirname, '..', 'dist', 'pglite-assets');

fs.mkdirSync(dest, { recursive: true });
for (const f of ['pglite.wasm', 'pglite.data']) fs.copyFileSync(path.join(src, f), path.join(dest, f));
console.log(`[deploy] Copied PGlite runtime to ${path.relative(process.cwd(), dest)}`);
