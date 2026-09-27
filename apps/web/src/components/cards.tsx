import Link from 'next/link';
import Image from 'next/image';
import { COUNTRY_IMAGES } from '@/lib/country-images';
import { flagEmoji } from '@/lib/labels';
import type { Country, DoctorCard, HospitalCard, TreatmentCard } from '@/lib/types';
import { Avatar, Badge, Card, DoctorPhoto } from './ui';

export function CountryCardView({ c }: { c: Country }) {
  const photo = COUNTRY_IMAGES[c.slug];
  const hospitals = `${c.hospitalCount} ${c.hospitalCount === 1 ? 'hospital' : 'hospitals'}`;
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-ink-200 bg-white shadow-card transition-shadow hover:shadow-pop">
      {photo ? (
        <div className="relative aspect-[16/10] overflow-hidden bg-ink-100">
          <Image src={photo.src} alt={photo.alt} fill sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-105" style={{ objectPosition: photo.position }} />
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3">
            <h3 className="text-xl font-bold text-white"><Link href={`/countries/${c.slug}`} className="text-white no-underline after:absolute after:inset-0">{c.name}</Link></h3>
            <span className="shrink-0 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-ink-900">{hospitals}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-5 pb-0">
          <span aria-hidden="true" className="text-3xl">{flagEmoji(c.isoCode)}</span>
          <div>
            <h3 className="text-lg font-semibold"><Link href={`/countries/${c.slug}`} className="text-ink-900 after:absolute after:inset-0">{c.name}</Link></h3>
            <p className="text-sm text-ink-600">{hospitals}</p>
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        {c.popularTreatments.length > 0 && (
          <p className="text-sm text-ink-600"><span className="font-medium text-ink-800">Popular: </span>{c.popularTreatments.slice(0, 3).map((t) => t.name).join(', ')}</p>
        )}
        {c.startingConsultationInfo && <p className="mt-2 text-sm text-ink-600">{c.startingConsultationInfo}</p>}
        <p className="mt-auto pt-4 text-sm font-semibold text-brand-700">View hospitals →</p>
      </div>
    </div>
  );
}

export function HospitalCardView({ h }: { h: HospitalCard }) {
  return (
    <Card className="relative flex h-full flex-col transition-shadow hover:shadow-pop">
      <div className="flex items-start gap-3">
        <Avatar name={h.name.replace(/^DEMO\s+/i, '')} size={48} />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-snug"><Link href={`/hospitals/${h.slug}`} className="text-ink-900 after:absolute after:inset-0">{h.name}</Link></h3>
          <p className="text-sm text-ink-600">{[h.city?.name, h.country.name].filter(Boolean).join(', ')}</p>
        </div>
      </div>
      {h.description && <p className="mt-3 line-clamp-3 text-sm text-ink-600">{h.description}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {h.specialties.slice(0, 4).map((s) => <Badge key={s.specialty.id}>{s.specialty.name}</Badge>)}
        {h.accreditations.map((a) => <Badge key={a.accreditation.id} tone="success">{a.accreditation.name}</Badge>)}
      </div>
      <p className="mt-auto pt-4 text-sm font-semibold text-brand-700">View profile →</p>
    </Card>
  );
}

export function DoctorCardView({ d }: { d: DoctorCard }) {
  const primary = d.specialties.find((s) => s.isPrimary) ?? d.specialties[0];
  const hosp = d.hospitals.find((h) => h.isPrimary) ?? d.hospitals[0];
  return (
    <Card className="relative flex h-full flex-col transition-shadow hover:shadow-pop">
      <div className="flex items-start gap-3">
        <DoctorPhoto name={d.fullName} photoKey={d.photoKey} size={72} />
        <div className="min-w-0">
          {d.isDemo && <span className="mb-1 inline-block"><Badge tone="warning">Sample profile</Badge></span>}
          <h3 className="text-lg font-semibold leading-snug"><Link href={`/doctors/${d.slug}`} className="text-ink-900 after:absolute after:inset-0">{[d.title, d.fullName].filter(Boolean).join(' ')}</Link></h3>
          {primary && <p className="text-sm font-medium text-brand-800">{primary.specialty.name}</p>}
          {d.designation && <p className="text-sm text-ink-600">{d.designation}</p>}
        </div>
      </div>
      <dl className="mt-3 space-y-1 text-sm text-ink-600">
        {hosp && <div className="flex gap-1.5"><dt className="sr-only">Hospital</dt><dd>{hosp.hospital.name} · {hosp.hospital.country.name}</dd></div>}
        {d.yearsOfExperience != null && <div className="flex gap-1.5"><dt className="font-medium text-ink-800">Experience:</dt><dd>{d.yearsOfExperience} years</dd></div>}
        {d.languages.length > 0 && <div className="flex gap-1.5"><dt className="font-medium text-ink-800">Languages:</dt><dd>{d.languages.map((l) => l.language.name).join(', ')}</dd></div>}
      </dl>
      <p className="mt-auto pt-4 text-sm font-semibold text-brand-700">View profile →</p>
    </Card>
  );
}

export function TreatmentCardView({ t }: { t: TreatmentCard }) {
  return (
    <Card className="relative flex h-full flex-col transition-shadow hover:shadow-pop">
      <div><Badge tone="info">{t.category.name}</Badge></div>
      <h3 className="mt-2 text-lg font-semibold leading-snug"><Link href={`/treatments/${t.slug}`} className="text-ink-900 after:absolute after:inset-0">{t.name}</Link></h3>
      {t.summary && <p className="mt-2 line-clamp-3 text-sm text-ink-600">{t.summary}</p>}
      <p className="mt-auto pt-4 text-sm font-semibold text-brand-700">Learn more →</p>
    </Card>
  );
}

export function Grid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const c = cols === 4 ? 'lg:grid-cols-4' : cols === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3';
  return <div className={`grid gap-4 sm:grid-cols-2 ${c}`}>{children}</div>;
}

export function Pagination({ basePath, params, page, pageSize, total }: { basePath: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / (pageSize || 1)));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const u = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    if (p > 1) u.set('page', String(p));
    const s = u.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm">
      {page > 1 ? <Link href={href(page - 1)} rel="prev" className="rounded-lg border border-ink-300 px-4 py-2 font-medium">← Previous</Link> : <span />}
      <span className="text-ink-600">Page {page} of {pages}</span>
      {page < pages ? <Link href={href(page + 1)} rel="next" className="rounded-lg border border-ink-300 px-4 py-2 font-medium">Next →</Link> : <span />}
    </nav>
  );
}
