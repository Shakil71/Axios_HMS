import { Card, Container, LinkButton } from '@/components/ui';
import { pageMeta } from '@/lib/seo';

export const metadata = pageMeta({ title: 'Our medical tourism services', description: 'Consultation coordination, doctor and hospital selection, appointments, visa documents, flights, hotels and local support.', path: '/services' });

// Default copy; managed from the CMS in Phase 3.
const SERVICES = [
  ['Case review', 'Share your reports; our medical coordinators review your information and ask for anything missing.'],
  ['Doctor and hospital options', 'Options from our verified directory, based on your condition and preferences.'],
  ['Appointment coordination', 'Online or in-person consultations arranged and confirmed for you.'],
  ['Visa documentation', 'Country-specific checklists and help preparing your medical visa application.'],
  ['Flights, hotels and transport', 'Travel planning, accommodation information and airport pickup arrangements.'],
  ['Local support and follow-up', 'A local coordinator during treatment, and help with return travel and follow-up care.'],
];

export default function ServicesPage() {
  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-3xl font-bold sm:text-4xl">Our medical tourism services</h1>
      <p className="mt-2 max-w-2xl text-ink-600">One team for the whole journey, from your first question to your follow-up. We coordinate care and paperwork; medical advice comes from licensed doctors.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map(([t, d]) => <Card key={t}><h2 className="text-lg font-semibold">{t}</h2><p className="mt-2 text-sm text-ink-600">{d}</p></Card>)}
      </div>
      <div className="mt-8"><LinkButton href="/register">Start your treatment journey</LinkButton></div>
    </Container>
  );
}
