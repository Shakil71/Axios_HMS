import type { Metadata } from 'next';
import Link from 'next/link';
import { DoctorCardView, Grid, HospitalCardView } from '@/components/cards';
import { JsonLd, breadcrumbLd, faqLd } from '@/components/json-ld';
import { Alert, Breadcrumbs, Card, Container, LinkButton, Section } from '@/components/ui';
import { apiGet } from '@/lib/api-server';
import { flagEmoji } from '@/lib/labels';
import { absoluteUrl, pageMeta } from '@/lib/seo';
import type { TreatmentDetail } from '@/lib/types';

export const revalidate = 300;
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await apiGet<TreatmentDetail>(`/treatments/${slug}`);
  if (!t) return {};
  return pageMeta({ title: t.metaTitle ?? t.name, description: t.metaDescription ?? t.summary, path: `/treatments/${slug}` });
}

export default async function TreatmentPage({ params }: Props) {
  const { slug } = await params;
  const t = await apiGet<TreatmentDetail>(`/treatments/${slug}`);
  if (!t) return <Container className="py-16"><Alert tone="warning" title="This page is temporarily unavailable">Please try again in a moment.</Alert></Container>;

  const blocks: [string, string | null][] = [['Overview', t.description], ['Symptoms and conditions', t.symptoms], ['Treatment options', t.treatmentOptions], ['How to prepare', t.preparationInfo]];

  return (
    <>
      <JsonLd data={[breadcrumbLd([{ name: 'Home', url: absoluteUrl('/') }, { name: 'Treatments', url: absoluteUrl('/treatments') }, { name: t.name, url: absoluteUrl(`/treatments/${t.slug}`) }]), ...(t.faqs.length ? [faqLd(t.faqs)] : [])]} />
      <Container className="py-8 sm:py-12">
        <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Treatments', href: '/treatments' }, { name: t.name }]} />
        <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-brand-700">{t.category.name}</p>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{t.name}</h1>
        {t.summary && <p className="mt-3 max-w-3xl text-lg text-ink-600">{t.summary}</p>}
        <div className="mt-6"><LinkButton href={`/patient/cases/new?treatment=${t.id}`}>Get consultation for this treatment</LinkButton></div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {blocks.filter(([, v]) => v).map(([title, v]) => <Card key={title}><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 whitespace-pre-line text-ink-700">{v}</p></Card>)}
            <Alert tone="info" title="This is general information">It does not replace advice from a licensed doctor. Your doctor decides which treatment is right for you.</Alert>
          </div>
          <aside className="space-y-6">
            {t.countries.length > 0 && <Card><h2 className="text-lg font-semibold">Available in</h2><ul className="mt-2 space-y-1.5 text-sm">{t.countries.map((c) => <li key={c.id}><Link href={`/countries/${c.slug}`}><span aria-hidden="true">{flagEmoji(c.isoCode)}</span> {c.name}</Link></li>)}</ul></Card>}
            {t.related.length > 0 && <Card><h2 className="text-lg font-semibold">Related treatments</h2><ul className="mt-2 space-y-1.5 text-sm">{t.related.map((r) => <li key={r.relatedTreatment.id}><Link href={`/treatments/${r.relatedTreatment.slug}`}>{r.relatedTreatment.name}</Link></li>)}</ul></Card>}
            {t.specialties.length > 0 && <Card><h2 className="text-lg font-semibold">Specialties</h2><ul className="mt-2 space-y-1 text-sm text-ink-700">{t.specialties.map((s) => <li key={s.specialty.id}>{s.specialty.name}</li>)}</ul></Card>}
          </aside>
        </div>
      </Container>
      {t.hospitals.length > 0 && <Section title="Hospitals offering this treatment" className="bg-ink-50"><Grid>{t.hospitals.map((x) => <HospitalCardView key={x.hospital.id} h={x.hospital} />)}</Grid></Section>}
      {t.doctors.length > 0 && <Section title="Doctors"><Grid>{t.doctors.map((x) => <DoctorCardView key={x.doctor.id} d={x.doctor} />)}</Grid></Section>}
      {t.faqs.length > 0 && <Section title="Common questions" className="bg-ink-50"><div className="divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">{t.faqs.map((f) => <details key={f.id} className="p-5"><summary className="cursor-pointer font-semibold">{f.question}</summary><p className="mt-2 text-ink-600">{f.answer}</p></details>)}</div></Section>}
    </>
  );
}
