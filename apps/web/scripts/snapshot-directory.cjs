/**
 * Regenerates src/data/sample-directory.json from a running, seeded API (npm run dev:db + seed + API on :4000).
 * The web app serves this snapshot ONLY when the real API is unreachable, and labels it as sample data.
 * Usage:  node apps/web/scripts/snapshot-directory.cjs [http://localhost:4000]
 */
const fs = require('fs');
const path = require('path');
const base = (process.argv[2] || 'http://localhost:4000') + '/api/v1';

const get = async (p) => {
  const res = await fetch(base + p);
  if (!res.ok) throw new Error(`${p} -> ${res.status}`);
  return (await res.json()).data;
};

(async () => {
  const out = { generatedAt: new Date().toISOString() };
  out.categories = await get('/treatment-categories');
  out.specialties = await get('/specialties');
  out.languages = await get('/languages');
  out.accreditations = await get('/accreditations');
  out.faqs = await get('/faqs');
  out.settings = await get('/settings/public');
  const list = (p) => get(p + (p.includes('?') ? '&' : '?') + 'pageSize=60');
  for (const key of ['countries', 'hospitals', 'doctors', 'treatments']) {
    const items = await list('/' + key);
    out[key] = [];
    for (const it of items) out[key].push(await get(`/${key}/${it.slug}`)); // detail objects are supersets of the card objects
    // list-shaped cards for countries include hospitalCount/popularTreatments that details lack: keep both
    if (key === 'countries') out.countryCards = items;
  }
  out.visa = {};
  for (const c of out.countries) out.visa[c.slug] = await get(`/visa/requirements?country=${c.slug}`);
  const file = path.join(__dirname, '..', 'src', 'data', 'sample-directory.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log('wrote', file, `${(fs.statSync(file).size / 1024).toFixed(0)} KB`, {
    countries: out.countries.length, hospitals: out.hospitals.length, doctors: out.doctors.length, treatments: out.treatments.length,
  });
})().catch((e) => { console.error(e.message); process.exit(1); });
