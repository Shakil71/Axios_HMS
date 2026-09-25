import type { Metadata } from 'next';
import Link from 'next/link';
import { DoctorCardView, Grid } from '@/components/cards';
import { JsonLd, breadcrumbLd } from '@/components/json-ld';
import { Alert, Avatar, Badge, Breadcrumbs, Card, Container, LinkButton, Section } from '@/components/ui';
import { apiGet } from '@/lib/api-server';
import { absoluteUrl, pageMeta } from '@/lib/seo';
import type { HospitalDetail } from '@/lib/types';

export const revalidate = 300;
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const h = await apiGet<HospitalDetail>(`/hospitals/${slug}`);
  if (!h) return {};
  return pageMeta({ title: h.metaTitle ?? `${h.name} — ${h.country.name}`, description: h.metaDescription ?? h.description, path: `/hospitals/${slug}` });
}

export default async function HospitalPage({ params }: Props) {
  const { slug } = await params;
  const h = await apiGet<HospitalDetail>(`/hospitals/${slug}`);
  if (!h) return <Container className="py-16"><Alert tone="warning" title="This page is temporarily unavailable">Please try again in a moment.</Alert></Container>;
  const place = [h.city?.name, h.country.name].filter(Boolean).join(', ');

  const blocks: [string, string | null][] = [
    ['About', h.description], ['Information for international patients', h.internationalDeptInfo],
    ['Medical tourism services', h.medicalTourismServices], ['Patient information', h.patientInformation],
  ];

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([{ name: 'Home', url: absoluteUrl('/') }, { name: 'Hospitals', url: absoluteUrl('/hospitals') }, { name: h.name, url: absoluteUrl(`/hospitals/${h.slug}`) }]),
          {
            '@context': 'https://schema.org', '@type': 'Hospital', name: h.name, url: absoluteUrl(`/hospitals/${h.slug}`),
            ...(h.description ? { description: h.description } : {}), ...(h.website ? { sameAs: [h.website] } : {}),
            address: { '@type': 'PostalAddress', ...(h.address ? { streetAddress: h.address } : {}), ...(h.city ? { addressLocality: h.city.name } : {}), addressCountry: h.country.name },
            ...(h.specialties.length ? { medicalSpecialty: h.specialties.map((s) => s.specialty.name) } : {}),
          },
        ]}
      />
      <Container className="py-8 sm:py-12">
        <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Hospitals', href: '/hospitals' }, { name: h.name }]} />
        <div className="mt-4 flex items-start gap-4">
          <Avatar name={h.name.replace(/^DEMO\s+/i, '')} size={72} />
          <div>
            <h1 className="text-3xl font-bold sm:text-4xl">{h.name}</h1>
            <p className="mt-1 text-ink-600">{place}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {h.accreditations.map((a) => <Badge key={a.accreditation.id} tone="success">{a.accreditation.name}</Badge>)}
              {h.languages.map((l) => <Badge key={l.language.code}>{l.language.name}</Badge>)}
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href={`/patient/cases/new?country=${h.country.id}&hospital=${h.id}`}>Get consultation for this hospital</LinkButton>
          <LinkButton href={`/countries/${h.country.slug}`} variant="secondary">About {h.country.name}</LinkButton>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {blocks.filter(([, v]) => v).map(([t, v]) => <Card key={t}><h2 className="text-lg font-semibold">{t}</h2><p className="mt-2 whitespace-pre-line text-ink-700">{v}</p></Card>)}
            {h.departments.length > 0 && (
              <Card><h2 className="text-lg font-semibold">Departments</h2>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">{h.departments.map((d) => <li key={d.id} className="text-ink-700">{d.name}</li>)}</ul></Card>
            )}
            {h.treatments.length > 0 && (
              <Card><h2 className="text-lg font-semibold">Treatments offered</h2>
                <ul className="mt-2 flex flex-wrap gap-2">{h.treatments.map((t) => <li key={t.treatment.id}><Link href={`/treatments/${t.treatment.slug}`} className="inline-block rounded-full border border-ink-200 px-3 py-1 text-sm">{t.treatment.name}</Link></li>)}</ul></Card>
            )}
          </div>
          <aside className="space-y-6">
            {h.specialties.length > 0 && <Card><h2 className="text-lg font-semibold">Specialties</h2><ul className="mt-2 space-y-1 text-sm text-ink-700">{h.specialties.map((s) => <li key={s.specialty.id}>{s.specialty.name}</li>)}</ul></Card>}
            {h.facilities.length > 0 && <Card><h2 className="text-lg font-semibold">Facilities</h2><ul className="mt-2 space-y-1 text-sm text-ink-700">{h.facilities.map((f) => <li key={f.id}>{f.name}</li>)}</ul></Card>}
            <Card>
              <h2 className="text-lg font-semibold">Contact</h2>
              <ul className="mt-2 space-y-1 text-sm text-ink-700">
                {h.address && <li>{h.address}</li>}
                {h.phone && <li>Phone: {h.phone}</li>}
                {h.emergencyPhone && <li>Emergency: {h.emergencyPhone}</li>}
                {h.website && /^https?:\/\//.test(h.website) && <li><a href={h.website} rel="noopener noreferrer nofollow" target="_blank">Hospital website</a></li>}
              </ul>
            </Card>
          </aside>
        </div>
      </Container>
      {h.doctors.length > 0 && <Section title="Doctors at this hospital" className="bg-ink-50"><Grid>{h.doctors.map((x) => <DoctorCardView key={x.doctor.id} d={{ ...x.doctor, languages: [], hospitals: [] }} />)}</Grid></Section>}
    </>
  );
}
