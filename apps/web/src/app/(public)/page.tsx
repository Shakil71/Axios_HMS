import Link from 'next/link';
import { CountryCardView, DoctorCardView, Grid, HospitalCardView } from '@/components/cards';
import { JsonLd, faqLd } from '@/components/json-ld';
import { Container, LinkButton, Section } from '@/components/ui';
import { apiGet, apiList } from '@/lib/api-server';
import { SITE_NAME } from '@/lib/config';
import { absoluteUrl, pageMeta } from '@/lib/seo';
import type { Country, DoctorCard, Faq, HospitalCard, TreatmentCategory } from '@/lib/types';

export const revalidate = 300;
export const metadata = pageMeta({
  title: 'Trusted medical treatment abroad, from consultation to recovery',
  description: 'Patients from Bangladesh can get help with doctors, hospitals, appointments, visa documents and travel coordination for treatment abroad.',
  path: '/',
});

// Default copy. Editable copy moves to the CMS in Phase 3.
const STEPS = [
  ['Share your medical information', 'Tell us about your condition and upload your reports.'],
  ['Our medical team reviews your case', 'A coordinator checks your information and asks if anything is missing.'],
  ['Receive doctor and hospital options', 'We suggest options from our verified directory.'],
  ['Schedule a consultation', 'We help arrange an online or in-person appointment.'],
  ['Visa and travel help', 'We guide you through visa documents, flights and stay.'],
  ['Treatment abroad', 'A local coordinator supports you during your treatment.'],
  ['Return and follow-up', 'We help with your return journey and follow-up care.'],
];

const WHY = [
  ['Verified network', 'Doctor and hospital profiles are checked by our team before they are published.'],
  ['One dedicated coordinator', 'A single person who knows your case and answers your questions.'],
  ['Visa assistance', 'Clear checklists and document help for the country you choose.'],
  ['Appointment help', 'We arrange consultations and keep you updated on changes.'],
  ['Clear communication', 'Your treatment journey is always visible in your portal, in plain language.'],
  ['Private documents', 'Your passport and medical reports are stored securely and shown only to people who need them.'],
];

export default async function HomePage() {
  const [categories, countries, hospitals, doctors, faqs] = await Promise.all([
    apiGet<TreatmentCategory[]>('/treatment-categories'),
    apiList<Country>('/countries?featured=true&pageSize=6'),
    apiList<HospitalCard>('/hospitals?featured=true&pageSize=6'),
    apiList<DoctorCard>('/doctors?featured=true&pageSize=6'),
    apiGet<Faq[]>('/faqs'),
  ]);

  return (
    <>
      <JsonLd
        data={[
          { '@context': 'https://schema.org', '@type': 'MedicalOrganization', name: SITE_NAME, url: absoluteUrl('/'), areaServed: 'BD', description: 'Medical treatment coordination for patients from Bangladesh.' },
          ...(faqs?.length ? [faqLd(faqs.slice(0, 6))] : []),
        ]}
      />

      <section className="bg-gradient-to-b from-brand-50 to-white">
        <Container className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.4fr_1fr] lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Treatment abroad, made clearer</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">Trusted medical treatment abroad, from consultation to recovery</h1>
            <p className="mt-5 text-lg text-ink-600">
              Patients from Bangladesh can get help finding doctors and hospitals, booking appointments, preparing visa documents and arranging travel — all in one place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/register">Get medical consultation</LinkButton>
              <LinkButton href="/doctors" variant="secondary">Explore doctors</LinkButton>
              <LinkButton href="/hospitals" variant="secondary">Explore hospitals</LinkButton>
            </div>
            <p className="mt-4 text-sm text-ink-600">We coordinate care and paperwork. Medical advice always comes from licensed doctors.</p>
          </div>
          <aside aria-label="What we help with" className="hidden rounded-2xl border border-ink-200 bg-white p-6 shadow-card lg:block">
            <p className="text-sm font-semibold uppercase tracking-wide text-ink-500">What we help with</p>
            <ul className="mt-4 space-y-3">
              {['Finding the right doctor and hospital', 'Booking your consultation', 'Preparing visa documents', 'Flights, hotel and airport pickup', 'Support during treatment and follow-up'].map((t) => (
                <li key={t} className="flex items-start gap-3 text-ink-800"><span aria-hidden="true" className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">✓</span>{t}</li>
              ))}
            </ul>
            <LinkButton href="/services" variant="ghost" className="mt-4 px-0">See all services →</LinkButton>
          </aside>
        </Container>
      </section>

      {!!categories?.length && (
        <Section title="Popular treatment categories" subtitle="Find doctors and hospitals by the kind of care you need.">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/treatments?category=${c.slug}`} className="flex min-h-14 items-center rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm font-semibold text-ink-800 shadow-card hover:border-brand-400 hover:text-brand-800">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!!countries.data.length && (
        <Section title="Featured countries" subtitle="Destinations our patients most often ask about." action={<LinkButton href="/countries" variant="secondary">All countries</LinkButton>} className="bg-ink-50">
          <Grid>{countries.data.map((c) => <CountryCardView key={c.id} c={c} />)}</Grid>
        </Section>
      )}

      {!!hospitals.data.length && (
        <Section title="Featured hospitals" action={<LinkButton href="/hospitals" variant="secondary">All hospitals</LinkButton>}>
          <Grid>{hospitals.data.map((h) => <HospitalCardView key={h.id} h={h} />)}</Grid>
        </Section>
      )}

      {!!doctors.data.length && (
        <Section title="Featured doctors" subtitle="Profiles are entered and verified by our team." action={<LinkButton href="/doctors" variant="secondary">All doctors</LinkButton>} className="bg-ink-50">
          <Grid>{doctors.data.map((d) => <DoctorCardView key={d.id} d={d} />)}</Grid>
        </Section>
      )}

      <Section title="How it works" subtitle="Seven simple steps from your first message to your follow-up.">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="rounded-xl border border-ink-200 bg-white p-5 shadow-card">
              <span aria-hidden="true" className="mb-3 inline-flex size-8 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">{i + 1}</span>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-ink-600">{text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Why patients choose us" className="bg-ink-50">
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map(([title, text]) => (
            <li key={title}>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-ink-600">{text}</p>
            </li>
          ))}
        </ul>
      </Section>

      {!!faqs?.length && (
        <Section title="Common questions" action={<LinkButton href="/faq" variant="secondary">All questions</LinkButton>}>
          <div className="divide-y divide-ink-200 rounded-xl border border-ink-200">
            {faqs.slice(0, 5).map((f) => (
              <details key={f.id} className="group p-5">
                <summary className="cursor-pointer list-none font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">{f.question}</summary>
                <p className="mt-2 text-ink-600">{f.answer}</p>
              </details>
            ))}
          </div>
        </Section>
      )}

      <section className="bg-brand-800 py-14 text-white">
        <Container className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready to start?</h2>
            <p className="mt-2 max-w-xl text-brand-100">Create a free account, tell us about your condition and upload your reports. A coordinator will guide you from there.</p>
          </div>
          <LinkButton href="/register" variant="secondary">Start your treatment journey</LinkButton>
        </Container>
      </section>
    </>
  );
}
