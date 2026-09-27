import Image from 'next/image';
import Link from 'next/link';
import { CountryCardView, DoctorCardView, Grid, HospitalCardView, TreatmentCardView } from '@/components/cards';
import { HeroSearch } from '@/components/home/hero-search';
import { HomeIcon, type HomeIconName } from '@/components/home/icons';
import { Reveal } from '@/components/home/reveal';
import { JsonLd, faqLd } from '@/components/json-ld';
import { Container, LinkButton } from '@/components/ui';
import { apiGet, apiList } from '@/lib/api-server';
import { SITE_NAME } from '@/lib/config';
import { absoluteUrl, pageMeta } from '@/lib/seo';
import type { Country, DoctorCard, Faq, HospitalCard, Ref, TreatmentCard, TreatmentCategory } from '@/lib/types';

export const revalidate = 300;
export const metadata = pageMeta({
  title: 'Trusted medical treatment abroad, from consultation to recovery',
  description: 'Patients from Bangladesh can get help with doctors, hospitals, appointments, visa documents and travel coordination for treatment abroad.',
  path: '/',
});

// Default copy. Editable copy moves to the CMS in Phase 3. Photos are generic stock (public/images/CREDITS.md):
// the people shown are not our staff, patients or partner doctors.
const SERVICES: { icon: HomeIconName; title: string; text: string; href: string }[] = [
  { icon: 'file', title: 'Case review', text: 'Share your reports. A medical coordinator reviews them and asks for anything that is missing.', href: '/services' },
  { icon: 'stethoscope', title: 'Doctor options', text: 'Suggestions from our verified directory, matched to your condition and preferences.', href: '/doctors' },
  { icon: 'hospital', title: 'Hospital selection', text: 'Compare hospitals, accreditations and specialties before you decide.', href: '/hospitals' },
  { icon: 'calendar', title: 'Appointments', text: 'Online or in-person consultations arranged, confirmed and reminded for you.', href: '/services' },
  { icon: 'visa', title: 'Visa documents', text: 'A clear checklist for the country you choose, and help preparing your medical visa file.', href: '/visa-assistance' },
  { icon: 'plane', title: 'Flights and stay', text: 'Travel planning, accommodation details and airport pickup, all in one plan.', href: '/services' },
  { icon: 'users', title: 'Local support', text: 'A local coordinator during your treatment so you are never on your own.', href: '/services' },
  { icon: 'heart', title: 'Follow-up care', text: 'Help with the return journey and follow-up consultations after you are home.', href: '/services' },
];

const STEPS: [string, string][] = [
  ['Share your medical information', 'Tell us about your condition and upload your reports. It takes a few minutes.'],
  ['Our medical team reviews your case', 'A coordinator checks your information and asks if anything is missing.'],
  ['Receive doctor and hospital options', 'We suggest options from our verified directory, with clear next steps.'],
  ['Schedule a consultation', 'We arrange an online or in-person appointment that suits you.'],
  ['Visa and travel help', 'We guide you through visa documents, flights and where you will stay.'],
  ['Treatment abroad', 'A local coordinator supports you during your treatment.'],
  ['Return and follow-up', 'We help with your return journey and follow-up care.'],
];

const TRUST = ['Verified doctor profiles', 'One dedicated coordinator', 'Private, secure documents', 'English and বাংলা'];

const SECURITY: { icon: HomeIconName; title: string; text: string }[] = [
  { icon: 'lock', title: 'Private by design', text: 'Reports, passport and ID files are stored privately and opened only through short-lived secure links.' },
  { icon: 'users', title: 'Only the right people', text: 'Only the team members assigned to your case can see your records, and every view is logged.' },
  { icon: 'shield', title: 'Sensitive numbers protected', text: 'Passport and national ID numbers are encrypted and masked on screen.' },
];

export default async function HomePage() {
  const [categories, countries, hospitals, doctors, treatments, faqs, specialties, hospitalTotal, doctorTotal] = await Promise.all([
    apiGet<TreatmentCategory[]>('/treatment-categories'),
    apiList<Country>('/countries?pageSize=12'),
    apiList<HospitalCard>('/hospitals?featured=true&pageSize=6'),
    apiList<DoctorCard>('/doctors?featured=true&pageSize=6'),
    apiList<TreatmentCard>('/treatments?pageSize=6'),
    apiGet<Faq[]>('/faqs'),
    apiGet<Ref[]>('/specialties'),
    apiList<HospitalCard>('/hospitals?pageSize=1'),
    apiList<DoctorCard>('/doctors?pageSize=1'),
  ]);

  const stats = [
    { value: countries.meta.total, label: 'Destination countries' },
    { value: hospitalTotal.meta.total, label: 'Hospitals in our directory' },
    { value: doctorTotal.meta.total, label: 'Doctor profiles' },
    { value: treatments.meta.total, label: 'Treatments explained' },
  ].filter((s) => s.value > 0);

  return (
    <>
      <JsonLd
        data={[
          { '@context': 'https://schema.org', '@type': 'MedicalOrganization', name: SITE_NAME, url: absoluteUrl('/'), areaServed: 'BD', description: 'Medical treatment coordination for patients from Bangladesh.' },
          ...(faqs?.length ? [faqLd(faqs.slice(0, 6))] : []),
        ]}
      />

      {/* ───────── hero ───────── */}
      <section className="relative isolate overflow-hidden bg-brand-900 text-white">
        <Image src="/images/hero-corridor.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover opacity-30" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-900 via-brand-900/95 to-brand-800/60" />
        <div aria-hidden="true" className="absolute -right-32 -top-32 -z-10 size-96 rounded-full bg-brand-500/20 blur-3xl" />

        <Container className="grid items-center gap-12 pb-44 pt-12 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:pb-48 lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm font-medium text-brand-100">
              <HomeIcon name="globe" className="size-4" />
              From Bangladesh to leading hospitals abroad
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.1] text-white sm:text-5xl">
              Treatment abroad, <span className="text-brand-300">handled with care</span> from first call to follow-up
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-brand-100">
              We help you find the right doctor and hospital, book appointments, prepare visa documents and plan your travel. One coordinator, one place, in plain language.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/register" variant="light" className="px-6 py-3 text-base">
                Get medical consultation
                <HomeIcon name="arrow" className="size-4" />
              </LinkButton>
              <LinkButton href="/doctors" variant="outlineLight" className="px-6 py-3 text-base">Explore doctors</LinkButton>
            </div>
            <ul className="mt-8 grid max-w-xl gap-x-6 gap-y-3 sm:grid-cols-2">
              {TRUST.map((t) => (
                <li key={t} className="flex items-center gap-2.5 text-sm font-medium text-white">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300"><HomeIcon name="check" className="size-3.5" strokeWidth={3} /></span>
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-xl text-sm text-brand-100">We coordinate care and paperwork. Medical advice always comes from licensed doctors.</p>
          </div>

          <div className="relative mx-auto h-[26rem] w-full max-w-md sm:h-[30rem] lg:max-w-none">
            <div className="absolute right-0 top-0 h-[85%] w-[78%] overflow-hidden rounded-[2rem] border-4 border-white/20 shadow-2xl">
              <Image src="/images/home/consultation.jpg" alt="A doctor smiling as she goes through a report with a patient" fill priority sizes="(min-width: 1024px) 34vw, 80vw" className="object-cover" style={{ objectPosition: '35% center' }} />
            </div>
            <div className="absolute bottom-0 left-0 hidden h-44 w-[52%] overflow-hidden rounded-3xl border-4 border-brand-900 shadow-2xl sm:block">
              <Image src="/images/home/scan-review.jpg" alt="Two doctors discussing a scan on a monitor" fill sizes="(min-width: 1024px) 22vw, 40vw" className="object-cover" />
            </div>
            <aside aria-label="Example of your case progress" className="absolute -left-2 top-10 w-60 rounded-2xl bg-white p-4 text-ink-900 shadow-pop sm:-left-6">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Example case view</p>
              <ul className="mt-3 space-y-2.5 text-sm">
                <li className="flex items-center gap-2.5"><span className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><HomeIcon name="check" className="size-3" strokeWidth={3} /></span>Documents verified</li>
                <li className="flex items-center gap-2.5"><span className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><HomeIcon name="check" className="size-3" strokeWidth={3} /></span>Doctor options ready</li>
                <li className="flex items-center gap-2.5"><span className="flex size-5 items-center justify-center rounded-full bg-brand-100 text-brand-800"><span className="size-2 rounded-full bg-brand-600" /></span>Visa checklist in progress</li>
              </ul>
            </aside>
          </div>
        </Container>
      </section>

      <Container className="relative z-10 -mt-32 lg:-mt-36">
        <HeroSearch
          countries={countries.data.map((c) => ({ slug: c.slug, name: c.name }))}
          specialties={(specialties ?? []).map((s) => ({ slug: s.slug, name: s.name }))}
          categories={(categories ?? []).map((c) => ({ slug: c.slug, name: c.name }))}
        />
      </Container>

      {/* ───────── directory numbers ───────── */}
      {stats.length > 0 && (
        <section aria-label="Our directory in numbers" className="py-12">
          <Container>
            <dl className="grid grid-cols-2 gap-6 text-center lg:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="flex flex-col-reverse lg:border-r lg:border-ink-200 lg:last:border-0">
                  <dt className="mt-1 text-sm font-medium text-ink-600">{s.label}</dt>
                  <dd className="text-4xl font-bold tracking-tight text-brand-800 sm:text-5xl">{s.value}</dd>
                </div>
              ))}
            </dl>
          </Container>
        </section>
      )}

      {/* ───────── services ───────── */}
      <section className="bg-ink-50 py-16 sm:py-20">
        <Container>
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Everything in one place</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">One team for your whole journey</h2>
            <p className="mt-3 text-ink-600">From your first question to your follow-up, you always know who is helping you and what happens next.</p>
          </Reveal>
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((s, i) => (
              <li key={s.title}>
                <Reveal delay={(i % 4) * 80} className="h-full">
                  <Link href={s.href} className="group flex h-full flex-row gap-4 rounded-2xl border border-ink-200 bg-white p-5 text-ink-900 no-underline shadow-card transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-pop sm:flex-col sm:gap-0 sm:p-6">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-700 group-hover:text-white"><HomeIcon name={s.icon} className="size-6" /></span>
                    <span className="min-w-0"><h3 className="text-lg font-semibold sm:mt-4">{s.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-ink-600 sm:mt-2">{s.text}</p></span>
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ───────── destinations ───────── */}
      {!!countries.data.length && (
        <section className="py-16 sm:py-20">
          <Container>
            <Reveal className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Where you can go</p>
                <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Popular treatment destinations</h2>
                <p className="mt-3 text-ink-600">Countries our patients most often ask about, each with hospitals we have listed and checked.</p>
              </div>
              <LinkButton href="/countries" variant="secondary">All countries</LinkButton>
            </Reveal>
            <div className="mt-10">
              <Grid>{countries.data.slice(0, 6).map((c) => <CountryCardView key={c.id} c={c} />)}</Grid>
            </div>
          </Container>
        </section>
      )}

      {/* ───────── how it works ───────── */}
      <section className="bg-ink-50 py-16 sm:py-20">
        <Container className="grid items-start gap-12 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <Reveal>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">How it works</p>
              <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Seven clear steps, and you see every one</h2>
              <p className="mt-3 max-w-xl text-ink-600">Your progress is always visible in your private portal, in plain language.</p>
            </Reveal>
            <ol className="mt-10 space-y-0">
              {STEPS.map(([title, text], i) => (
                <li key={title} className="relative flex gap-5 pb-8 last:pb-0">
                  {i < STEPS.length - 1 && <span aria-hidden="true" className="absolute left-5 top-11 h-[calc(100%-2.75rem)] w-0.5 bg-brand-200" />}
                  <span aria-hidden="true" className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white ring-4 ring-ink-50">{i + 1}</span>
                  <div className="pt-1.5">
                    <h3 className="font-semibold text-ink-900">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-ink-600">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="lg:sticky lg:top-24">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] shadow-pop">
              <Image src="/images/care-coordination.jpg" alt="A doctor in a white coat with a stethoscope reviewing information on a tablet" fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
              <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-brand-900/70 to-transparent" />
              <p className="absolute inset-x-5 bottom-5 text-lg font-semibold text-white">A coordinator reviews every case before anything is arranged.</p>
            </div>
          </div>
        </Container>
      </section>

      {/* ───────── treatments ───────── */}
      {(!!treatments.data.length || !!categories?.length) && (
        <section className="py-16 sm:py-20">
          <Container>
            <Reveal className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Conditions and procedures</p>
                <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Find care for what you need</h2>
              </div>
              <LinkButton href="/treatments" variant="secondary">All treatments</LinkButton>
            </Reveal>
            {!!categories?.length && (
              <ul className="mt-8 flex flex-wrap gap-2.5" aria-label="Treatment categories">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link href={`/treatments?category=${c.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-ink-300 bg-white px-5 text-sm font-semibold text-ink-800 no-underline transition-colors hover:border-brand-600 hover:bg-brand-50 hover:text-brand-800">
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {!!treatments.data.length && <div className="mt-8"><Grid>{treatments.data.map((t) => <TreatmentCardView key={t.id} t={t} />)}</Grid></div>}
          </Container>
        </section>
      )}

      {/* ───────── hospitals ───────── */}
      {!!hospitals.data.length && (
        <section className="relative isolate overflow-hidden bg-ink-50 py-16 sm:py-20">
          <Container>
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <Reveal>
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Hospitals</p>
                <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Hospitals we have listed and checked</h2>
                <p className="mt-3 text-ink-600">Compare specialties and accreditations, then ask your coordinator to arrange a consultation.</p>
                <div className="relative mt-6 aspect-[16/10] overflow-hidden rounded-2xl shadow-card">
                  <Image src="/images/home/hospital-building.jpg" alt="The entrance of a modern hospital building" fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />
                </div>
                <div className="mt-6"><LinkButton href="/hospitals">Explore all hospitals</LinkButton></div>
              </Reveal>
              <div className="grid gap-4 sm:grid-cols-2">{hospitals.data.slice(0, 4).map((h) => <HospitalCardView key={h.id} h={h} />)}</div>
            </div>
          </Container>
        </section>
      )}

      {/* ───────── doctors ───────── */}
      {!!doctors.data.length && (
        <section className="py-16 sm:py-20">
          <Container>
            <Reveal className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Doctors</p>
                <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Meet doctors from our directory</h2>
                <p className="mt-3 text-ink-600">Profiles are entered and verified by our team before they are published.</p>
              </div>
              <LinkButton href="/doctors" variant="secondary">All doctors</LinkButton>
            </Reveal>
            <div className="mt-10"><Grid>{doctors.data.map((d) => <DoctorCardView key={d.id} d={d} />)}</Grid></div>
          </Container>
        </section>
      )}

      {/* ───────── portal preview ───────── */}
      <section className="bg-brand-50 py-16 sm:py-20">
        <Container className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Your private portal</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Always know where your treatment stands</h2>
            <p className="mt-3 text-ink-700">Sign in to see your case, upload reports, check appointments and follow visa and travel steps, on your phone or computer.</p>
            <ul className="mt-6 space-y-3">
              {[
                ['file', 'Upload reports and documents from your phone'],
                ['calendar', 'See and request appointments'],
                ['visa', 'Follow your visa checklist item by item'],
                ['chat', 'Get an update whenever something changes'],
              ].map(([icon, text]) => (
                <li key={text} className="flex items-center gap-3 text-ink-800">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 shadow-card"><HomeIcon name={icon as HomeIconName} className="size-5" /></span>
                  {text}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/register">Create your free account</LinkButton>
              <LinkButton href="/login" variant="secondary">Sign in</LinkButton>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <figure aria-label="Example of the patient portal">
              <div className="rounded-3xl border border-ink-200 bg-white p-5 shadow-pop sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Your treatment case</p>
                    <p className="text-lg font-semibold text-ink-900">Doctor selected</p>
                  </div>
                  <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800">Step 4 of 13</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full w-[32%] rounded-full bg-brand-600" /></div>
                <ul className="mt-5 space-y-3 text-sm">
                  <li className="flex items-center gap-3 rounded-xl bg-ink-50 p-3"><HomeIcon name="calendar" className="size-5 text-brand-700" /><span className="flex-1"><strong className="block text-ink-900">Video consultation</strong><span className="text-ink-600">Confirmed by your coordinator</span></span><span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Confirmed</span></li>
                  <li className="flex items-center gap-3 rounded-xl bg-ink-50 p-3"><HomeIcon name="visa" className="size-5 text-brand-700" /><span className="flex-1"><strong className="block text-ink-900">Visa checklist</strong><span className="text-ink-600">3 of 4 documents verified</span></span><span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900">1 needed</span></li>
                  <li className="flex items-center gap-3 rounded-xl bg-ink-50 p-3"><HomeIcon name="file" className="size-5 text-brand-700" /><span className="flex-1"><strong className="block text-ink-900">Medical reports</strong><span className="text-ink-600">All reports reviewed</span></span><span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Verified</span></li>
                </ul>
              </div>
              <figcaption className="mt-3 text-center text-xs text-ink-600">Example view with made-up details.</figcaption>
            </figure>
          </Reveal>
        </Container>
      </section>

      {/* ───────── beyond the hospital ───────── */}
      <section className="py-16 sm:py-20">
        <Container>
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Support that goes with you</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Care does not stop at the hospital door</h2>
          </Reveal>
          <ul className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { image: '/images/home/airport.jpg', alt: 'An airliner parked at an airport terminal', title: 'Travel, arranged', text: 'Flights, airport pickup and a place to stay, planned around your appointments.', position: 'center' },
              { image: '/images/home/caring-hands.jpg', alt: 'A caregiver gently holding a patient’s hand', title: 'Someone by your side', text: 'A coordinator who knows your case and a local contact during your treatment.', position: 'center' },
              { image: '/images/home/family-recovery.jpg', alt: 'A family standing together on a beach at sunset', title: 'Home and follow-up', text: 'Help with the journey back and with follow-up care once you are home.', position: 'center 60%' },
            ].map((c, i) => (
              <li key={c.title}>
                <Reveal delay={i * 100} className="h-full">
                  <div className="group h-full overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card">
                    <div className="relative aspect-[4/3] overflow-hidden bg-ink-100">
                      <Image src={c.image} alt={c.alt} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-105" style={{ objectPosition: c.position }} />
                    </div>
                    <div className="p-6">
                      <h3 className="text-lg font-semibold">{c.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{c.text}</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ───────── privacy ───────── */}
      <section className="relative isolate overflow-hidden bg-brand-900 py-16 text-white sm:py-20">
        <Image src="/images/home/laboratory.jpg" alt="" fill sizes="100vw" className="-z-20 object-cover opacity-15" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-900/90 to-brand-900" />
        <Container>
          <Reveal className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-300">Your privacy</p>
            <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Your medical records stay yours</h2>
            <p className="mt-3 text-brand-100">Passports, reports and ID documents are sensitive. We treat them that way.</p>
          </Reveal>
          <ul className="mt-10 grid gap-5 md:grid-cols-3">
            {SECURITY.map((s, i) => (
              <li key={s.title}>
                <Reveal delay={i * 100} className="h-full">
                  <div className="h-full rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-white/15 text-brand-200"><HomeIcon name={s.icon} className="size-6" /></span>
                    <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-brand-100">{s.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ───────── faq ───────── */}
      {!!faqs?.length && (
        <section className="bg-ink-50 py-16 sm:py-20">
          <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <Reveal>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Questions</p>
              <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Things patients ask us most</h2>
              <p className="mt-3 text-ink-600">Cannot find your answer? Our team is happy to help.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <LinkButton href="/faq" variant="secondary">All questions</LinkButton>
                <LinkButton href="/contact" variant="ghost">Contact us</LinkButton>
              </div>
            </Reveal>
            <div className="divide-y divide-ink-200 rounded-2xl border border-ink-200 bg-white shadow-card">
              {faqs.slice(0, 6).map((f) => (
                <details key={f.id} className="group p-5">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">
                    {f.question}
                    <span aria-hidden="true" className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-700 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 leading-relaxed text-ink-600">{f.answer}</p>
                </details>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* ───────── final call to action ───────── */}
      <section className="px-4 pb-0 pt-16 sm:px-6 sm:pt-20">
        <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-brand-800 text-white">
          <Image src="/images/home/consultation.jpg" alt="" fill sizes="(min-width: 1152px) 1152px, 100vw" className="-z-20 object-cover opacity-25" style={{ objectPosition: 'center 30%' }} />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-900 via-brand-900/90 to-brand-800/50" />
          <div className="grid gap-8 p-8 sm:p-12 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:p-16">
            <div>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">Ready to take the first step?</h2>
              <p className="mt-3 max-w-xl text-lg text-brand-100">Create a free account, tell us about your condition and upload your reports. A coordinator will guide you from there.</p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <LinkButton href="/register" variant="light" className="px-6 py-3 text-base">
                Start your treatment journey
                <HomeIcon name="arrow" className="size-4" />
              </LinkButton>
              <LinkButton href="/contact" variant="outlineLight" className="px-6 py-3 text-base">Talk to us first</LinkButton>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
