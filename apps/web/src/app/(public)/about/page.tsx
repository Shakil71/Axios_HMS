import { Card, Container, LinkButton } from '@/components/ui';
import { SITE_NAME } from '@/lib/config';
import { pageMeta } from '@/lib/seo';

export const metadata = pageMeta({ title: 'About us', description: 'Who we are, what we do and how we protect your information.', path: '/about' });

// Default copy. Company story, mission, management and certifications become CMS-managed in Phase 3;
// nothing here makes credential or outcome claims.
export default function AboutPage() {
  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-3xl font-bold sm:text-4xl">About {SITE_NAME}</h1>
      <p className="mt-3 max-w-3xl text-lg text-ink-600">We help patients from Bangladesh arrange treatment abroad, from the first consultation to the return journey.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card><h2 className="text-lg font-semibold">Our mission</h2><p className="mt-2 text-ink-700">Make it simple and safe for patients and their families to find the right care abroad and to understand every step.</p></Card>
        <Card><h2 className="text-lg font-semibold">Our vision</h2><p className="mt-2 text-ink-700">A clear, transparent and dignified journey for every patient who travels for treatment.</p></Card>
        <Card><h2 className="text-lg font-semibold">What we do</h2><p className="mt-2 text-ink-700">We coordinate doctors, hospitals, appointments, visa documents and travel. We do not diagnose or give medical advice.</p></Card>
        <Card><h2 className="text-lg font-semibold">How we protect your information</h2><p className="mt-2 text-ink-700">Your passport, NID and medical reports are stored privately, shared only with team members who need them, and every access is recorded.</p></Card>
      </div>
      <div className="mt-8"><LinkButton href="/contact">Contact us</LinkButton></div>
    </Container>
  );
}
