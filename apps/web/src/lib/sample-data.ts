import snapshot from '@/data/sample-directory.json';

/**
 * Built-in SAMPLE directory (fictional, generated from the demo seed). It answers the same public URLs as the API,
 * with the same filters, but is used only when the real API cannot be reached, so the site never renders blank.
 * Set DIRECTORY_FALLBACK=off to disable it (recommended once the real API and database are live).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const S = snapshot as any;

export const sampleModeEnabled = () => process.env.DIRECTORY_FALLBACK !== 'off';

type Result = { data: unknown; meta?: { page: number; pageSize: number; total: number } } | 'not-found' | null;

const includes = (hay: string | null | undefined, needle: string) => (hay ?? '').toLowerCase().includes(needle.toLowerCase());

function paginate(items: any[], q: URLSearchParams, defaultSize = 20): Result {
  const pageSize = Math.min(60, Math.max(1, Number(q.get('pageSize')) || defaultSize));
  const page = Math.max(1, Number(q.get('page')) || 1);
  return { data: items.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: items.length } };
}

const byFeaturedThenName = (nameOf: (x: any) => string) => (a: any, b: any) =>
  Number(!!b.isFeatured) - Number(!!a.isFeatured) || nameOf(a).localeCompare(nameOf(b));

function countries(q: URLSearchParams): Result {
  let items: any[] = S.countryCards;
  if (q.get('featured')) items = items.filter((c) => c.isFeatured);
  if (q.get('q')) items = items.filter((c) => includes(c.name, q.get('q')!));
  return paginate(items, q);
}

function hospitals(q: URLSearchParams): Result {
  let items: any[] = S.hospitals;
  if (q.get('featured')) items = items.filter((h) => h.isFeatured);
  if (q.get('country')) items = items.filter((h) => h.country.slug === q.get('country'));
  if (q.get('city')) items = items.filter((h) => h.city?.slug === q.get('city'));
  if (q.get('specialty')) items = items.filter((h) => h.specialties.some((s: any) => s.specialty.slug === q.get('specialty')));
  if (q.get('treatment')) items = items.filter((h) => h.treatments.some((t: any) => t.treatment.slug === q.get('treatment')));
  if (q.get('accreditation')) items = items.filter((h) => h.accreditations.some((a: any) => a.accreditation.slug === q.get('accreditation')));
  if (q.get('q')) items = items.filter((h) => includes(h.name, q.get('q')!) || includes(h.description, q.get('q')!));
  return paginate([...items].sort(byFeaturedThenName((h) => h.name)), q);
}

function doctors(q: URLSearchParams): Result {
  let items: any[] = S.doctors;
  if (q.get('featured')) items = items.filter((d) => d.isFeatured);
  if (q.get('country')) items = items.filter((d) => d.hospitals.some((h: any) => h.hospital.country.slug === q.get('country')));
  if (q.get('hospital')) items = items.filter((d) => d.hospitals.some((h: any) => h.hospital.slug === q.get('hospital')));
  if (q.get('specialty')) items = items.filter((d) => d.specialties.some((s: any) => s.specialty.slug === q.get('specialty')));
  if (q.get('treatment')) items = items.filter((d) => d.treatments.some((t: any) => t.treatment.slug === q.get('treatment')));
  if (q.get('language')) items = items.filter((d) => d.languages.some((l: any) => l.language.code === q.get('language')));
  if (q.get('minExperience')) items = items.filter((d) => (d.yearsOfExperience ?? 0) >= Number(q.get('minExperience')));
  if (q.get('q')) items = items.filter((d) => includes(d.fullName, q.get('q')!) || includes(d.designation, q.get('q')!));
  return paginate([...items].sort(byFeaturedThenName((d) => d.fullName)), q);
}

function treatments(q: URLSearchParams): Result {
  let items: any[] = S.treatments;
  if (q.get('category')) items = items.filter((t) => t.category.slug === q.get('category'));
  if (q.get('specialty')) items = items.filter((t) => t.specialties.some((s: any) => s.specialty.slug === q.get('specialty')));
  if (q.get('q')) items = items.filter((t) => includes(t.name, q.get('q')!) || includes(t.summary, q.get('q')!));
  return paginate([...items].sort((a, b) => a.name.localeCompare(b.name)), q);
}

const one = (list: any[], slug: string): Result => {
  const found = list.find((x) => x.slug === slug);
  return found ? { data: found } : 'not-found';
};

/** Mirrors the public API routes. Returns null when the path is not something the sample data can answer. */
export function sampleFor(pathWithQuery: string): Result {
  const [path, query = ''] = pathWithQuery.split('?');
  const q = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  const [head, slug] = parts;

  if (parts.length === 1) {
    switch (head) {
      case 'countries': return countries(q);
      case 'hospitals': return hospitals(q);
      case 'doctors': return doctors(q);
      case 'treatments': return treatments(q);
      case 'treatment-categories': return { data: S.categories };
      case 'specialties': return { data: S.specialties };
      case 'languages': return { data: S.languages };
      case 'accreditations': return { data: S.accreditations };
      case 'faqs': return { data: S.faqs };
    }
  }
  if (parts.length === 2 && head === 'countries') return one(S.countries, slug);
  if (parts.length === 2 && head === 'hospitals') return one(S.hospitals, slug);
  if (parts.length === 2 && head === 'doctors') return one(S.doctors, slug);
  if (parts.length === 2 && head === 'treatments') return one(S.treatments, slug);
  if (parts.join('/') === 'settings/public') return { data: S.settings };
  if (parts.join('/') === 'visa/requirements') {
    const v = S.visa[q.get('country') ?? ''];
    return v ? { data: v } : 'not-found';
  }
  return null;
}
