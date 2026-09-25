import type { Metadata } from 'next';
import Link from 'next/link';
import { DoctorCardView, Grid, HospitalCardView } from '@/components/cards';
import { JsonLd, breadcrumbLd, faqLd } from '@/components/json-ld';
import { Alert, Breadcrumbs, Card, Container, LinkButton, Section } from '@/components/ui';
import { apiGet } from '@/lib/api-server';
import { flagEmoji } from '@/lib/labels';
import { absoluteUrl, pageMeta } from '@/lib/seo';
import type { CountryDetail } from '@/lib/types';

export const revalidate = 300;
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = await apiGet<CountryDetail>(`/countries/${slug}`);
  if (!c) return {};
  return pageMeta({ title: c.metaTitle ?? `Medical treatment in ${c.name}`, description: c.metaDescription ?? c.description, path: `/countries/${slug}` });
}

export default async function CountryPage({ params }: Props) {
  const { slug } = await params;
  const c = await apiGet<CountryDetail>(`/countries/${slug}`);
  if (!c) return <Container className="py-16"><Alert tone="warning" title="This page is temporarily unavailable">Please try again in a moment.</Alert></Container>;

  const info: [string, string | null][] = [
    ['Why patients choose ' + c.name, c.whyChoose], ['Travel information', c.travelInformation], ['Accommodation', c.accommodationInformation],
  ];

  return (
    <>
      <JsonLd data={[breadcrumbLd([{ name: 'Home', url: absoluteUrl('/') }, { name: 'Countries', url: absoluteUrl('/countries') }, { name: c.name, url: absoluteUrl(`/countries/${c.slug}`) }]), ...(c.faqs.length ? [faqLd(c.faqs)] : [])]} />
      <Container className="py-8 sm:py-12">
        <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Countries', href: '/countries' }, { name: c.name }]} />
        <div className="mt-4 flex items-center gap-4">
          <span aria-hidden="true" className="text-5xl">{flagEmoji(c.isoCode)}</span>
          <h1 className="text-3xl font-bold sm:text-4xl">Medical treatment in {c.name}</h1>
        </div>
        {c.description && <p className="mt-4 max-w-3xl text-lg text-ink-600">{c.description}</p>}
        {c.startingConsultationInfo && <p className="mt-2 text-sm text-ink-600"><strong>Consultation:</strong> {c.startingConsultationInfo}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href={`/patient/cases/new?country=${c.id}`}>Get consultation for {c.name}</LinkButton>
          <LinkButton href={`/hospitals?country=${c.slug}`} variant="secondary">All hospitals</LinkButton>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {info.filter(([, v]) => v).map(([title, v]) => (
              <Card key={title}><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 whitespace-pre-line text-ink-700">{v}</p></Card>
            ))}
            {c.visaInformation && (
              <Card>
                <h2 className="text-lg font-semibold">Visa information</h2>
                <p className="mt-2 whitespace-pre-line text-ink-700">{c.visaInformation}</p>
                {c.visaRequirements.length > 0 && (
                  <>
                    <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-ink-500">Usual documents</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-700">
                      {c.visaRequirements.map((r) => <li key={r.id}>{r.name}{!r.isMandatory && <span className="text-ink-500"> (if available)</span>}</li>)}
                    </ul>
                  </>
                )}
                <p className="mt-3 text-xs text-ink-500">General guidance only. The embassy or consulate decides every visa; we cannot guarantee any outcome.</p>
              </Card>
            )}
          </div>
          <aside className="space-y-6">
            {c.popularTreatments.length > 0 && (
              <Card>
                <h2 className="text-lg font-semibold">Popular treatments</h2>
                <ul className="mt-2 space-y-1.5 text-sm">{c.popularTreatments.map((t) => <li key={t.id}><Link href={`/treatments/${t.slug}`}>{t.name}</Link></li>)}</ul>
              </Card>
            )}
            {c.cities.length > 0 && (
              <Card>
                <h2 className="text-lg font-semibold">Major medical cities</h2>
                <ul className="mt-2 space-y-1.5 text-sm text-ink-700">{c.cities.map((city) => <li key={city.id}>{city.name}</li>)}</ul>
              </Card>
            )}
          </aside>
        </div>
      </Container>

      {c.hospitals.length > 0 && <Section title={`Hospitals in ${c.name}`} className="bg-ink-50"><Grid>{c.hospitals.map((h) => <HospitalCardView key={h.id} h={h} />)}</Grid></Section>}
      {c.doctors.length > 0 && <Section title={`Doctors in ${c.name}`}><Grid>{c.doctors.map((d) => <DoctorCardView key={d.id} d={d} />)}</Grid></Section>}
      {c.faqs.length > 0 && (
        <Section title="Questions about treatment in this country" className="bg-ink-50">
          <div className="divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">
            {c.faqs.map((f) => <details key={f.id} className="p-5"><summary className="cursor-pointer font-semibold">{f.question}</summary><p className="mt-2 text-ink-600">{f.answer}</p></details>)}
          </div>
        </Section>
      )}
    </>
  );
}
