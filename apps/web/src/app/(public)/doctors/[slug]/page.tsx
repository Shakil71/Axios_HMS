import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, breadcrumbLd } from '@/components/json-ld';
import { Alert, Badge, Breadcrumbs, Card, Container, DoctorPhoto, LinkButton } from '@/components/ui';
import { apiGet } from '@/lib/api-server';
import { APPOINTMENT_TYPE_LABELS, QUALIFICATION_LABELS } from '@/lib/labels';
import { scheduleRows } from '@/lib/schedule';
import { absoluteUrl, pageMeta } from '@/lib/seo';
import type { DoctorDetail } from '@/lib/types';

export const revalidate = 300;
type Props = { params: Promise<{ slug: string }> };

const fullName = (d: DoctorDetail) => [d.title, d.fullName].filter(Boolean).join(' ');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const d = await apiGet<DoctorDetail>(`/doctors/${slug}`);
  if (!d) return {};
  const spec = d.specialties.find((s) => s.isPrimary)?.specialty.name ?? d.specialties[0]?.specialty.name;
  return pageMeta({ title: d.metaTitle ?? `${fullName(d)}${spec ? ` — ${spec}` : ''}`, description: d.metaDescription ?? d.bio, path: `/doctors/${slug}` });
}

export default async function DoctorPage({ params }: Props) {
  const { slug } = await params;
  const d = await apiGet<DoctorDetail>(`/doctors/${slug}`);
  if (!d) return <Container className="py-16"><Alert tone="warning" title="This page is temporarily unavailable">Please try again in a moment.</Alert></Container>;

  const primary = d.hospitals.find((h) => h.isPrimary) ?? d.hospitals[0];
  const schedule = scheduleRows(d.availability ?? []);
  const groups = Object.entries(
    d.qualifications.reduce<Record<string, DoctorDetail['qualifications']>>((acc, q) => ((acc[q.kind] ??= []).push(q), acc), {}),
  );

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([{ name: 'Home', url: absoluteUrl('/') }, { name: 'Doctors', url: absoluteUrl('/doctors') }, { name: fullName(d), url: absoluteUrl(`/doctors/${d.slug}`) }]),
          {
            '@context': 'https://schema.org', '@type': 'Physician', name: fullName(d), url: absoluteUrl(`/doctors/${d.slug}`),
            ...(d.specialties.length ? { medicalSpecialty: d.specialties.map((s) => s.specialty.name) } : {}),
            ...(d.languages.length ? { knowsLanguage: d.languages.map((l) => l.language.name) } : {}),
            ...(primary ? { worksFor: { '@type': 'Hospital', name: primary.hospital.name, url: absoluteUrl(`/hospitals/${primary.hospital.slug}`) } } : {}),
          },
        ]}
      />
      <Container className="py-8 sm:py-12">
        <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Doctors', href: '/doctors' }, { name: fullName(d) }]} />
        <div className="mt-4 flex flex-col items-start gap-5 sm:flex-row">
          <DoctorPhoto name={d.fullName} photoKey={d.photoKey} size={144} rounded="xl" />
          <div>
            {d.isDemo && <span className="mb-2 inline-block"><Badge tone="warning">Sample profile</Badge></span>}
            <h1 className="text-3xl font-bold sm:text-4xl">{fullName(d)}</h1>
            {d.designation && <p className="mt-1 text-lg text-ink-600">{d.designation}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {d.specialties.map((s) => <Badge key={s.specialty.id} tone={s.isPrimary ? 'info' : 'neutral'}>{s.specialty.name}{s.isSubSpecialty ? ' (sub-specialty)' : ''}</Badge>)}
            </div>
          </div>
        </div>
        {d.isDemo && (
          <div className="mt-6 max-w-3xl">
            <Alert tone="warning" title="This is a sample profile">The name, photo, qualifications and schedule on this page are fictional and shown for demonstration only. They do not describe a real doctor.</Alert>
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href={`/patient/cases/new${primary ? `?hospital=${primary.hospital.id}` : ''}`}>Request a consultation</LinkButton>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            {d.bio && <Card><h2 className="text-lg font-semibold">About</h2><p className="mt-2 whitespace-pre-line text-ink-700">{d.bio}</p></Card>}
            {schedule.length > 0 && (
              <Card>
                <h2 className="text-lg font-semibold">Consultation hours</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <caption className="sr-only">Weekly consultation hours</caption>
                    <thead>
                      <tr className="border-b border-ink-200 text-ink-500">
                        <th scope="col" className="py-2 pr-4 font-medium">Days</th>
                        <th scope="col" className="py-2 pr-4 font-medium">Hospital time</th>
                        <th scope="col" className="py-2 pr-4 font-medium">Bangladesh time</th>
                        <th scope="col" className="py-2 font-medium">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {schedule.map((r) => (
                        <tr key={`${r.days}-${r.local}-${r.method}`}>
                          <th scope="row" className="py-3 pr-4 font-semibold text-ink-900">{r.days}</th>
                          <td className="py-3 pr-4 text-ink-800">{r.local} <span className="text-ink-500">({r.place})</span></td>
                          <td className="py-3 pr-4 text-ink-800">{r.bangladesh}</td>
                          <td className="py-3 text-ink-800">{r.method}{r.notes ? <span className="block text-xs text-ink-500">{r.notes}</span> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-ink-500">Times are shown in the doctor’s hospital time and in Bangladesh time. This is not a booking: your coordinator confirms an appointment that suits you.</p>
              </Card>
            )}
            {groups.map(([kind, items]) => (
              <Card key={kind}>
                <h2 className="text-lg font-semibold">{QUALIFICATION_LABELS[kind] ?? kind}</h2>
                <ul className="mt-2 space-y-2 text-ink-700">
                  {items.map((q) => (
                    <li key={q.id}>
                      <span className="font-medium text-ink-900">{q.title}</span>
                      {(q.institution || q.year) && <span className="text-ink-600"> — {[q.institution, q.year].filter(Boolean).join(', ')}</span>}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
            {d.treatments.length > 0 && (
              <Card><h2 className="text-lg font-semibold">Treatments</h2>
                <ul className="mt-2 flex flex-wrap gap-2">{d.treatments.map((t) => <li key={t.treatment.id}><Link href={`/treatments/${t.treatment.slug}`} className="inline-block rounded-full border border-ink-200 px-3 py-1 text-sm">{t.treatment.name}</Link></li>)}</ul></Card>
            )}
          </div>
          <aside className="space-y-6">
            <Card>
              <h2 className="text-lg font-semibold">At a glance</h2>
              <dl className="mt-3 space-y-3 text-sm">
                {d.yearsOfExperience != null && <div><dt className="text-ink-500">Experience</dt><dd className="font-medium">{d.yearsOfExperience} years</dd></div>}
                {d.hospitals.map((h) => <div key={h.hospital.id}><dt className="text-ink-500">Hospital</dt><dd className="font-medium"><Link href={`/hospitals/${h.hospital.slug}`}>{h.hospital.name}</Link><br /><span className="font-normal text-ink-600">{[h.hospital.city?.name, h.hospital.country.name].filter(Boolean).join(', ')}</span></dd></div>)}
                {d.languages.length > 0 && <div><dt className="text-ink-500">Languages</dt><dd className="font-medium">{d.languages.map((l) => l.language.name).join(', ')}</dd></div>}
                {d.appointmentTypes.length > 0 && <div><dt className="text-ink-500">Appointment types</dt><dd className="font-medium">{d.appointmentTypes.map((a) => APPOINTMENT_TYPE_LABELS[a.type] ?? a.type).join(', ')}</dd></div>}
              </dl>
            </Card>
            {d.consultationInfo && <Card><h2 className="text-lg font-semibold">Consultation</h2><p className="mt-2 text-sm text-ink-700">{d.consultationInfo}</p></Card>}
          </aside>
        </div>
      </Container>
    </>
  );
}
