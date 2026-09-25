import { Card, Container, LinkButton } from '@/components/ui';
import { apiGet } from '@/lib/api-server';
import { pageMeta } from '@/lib/seo';

export const revalidate = 300;
export const metadata = pageMeta({ title: 'Contact us', description: 'Talk to our patient coordination team.', path: '/contact' });

export default async function ContactPage() {
  const s = (await apiGet<Record<string, string>>('/settings/public')) ?? {};
  const rows: [string, string | undefined, string?][] = [
    ['Phone', s['contact.phone']], ['WhatsApp', s['contact.whatsapp']], ['Email', s['contact.email'], `mailto:${s['contact.email']}`],
    ['Office', s['office.dhaka.address']], ['Office hours', s['office.dhaka.hours']],
  ];
  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-3xl font-bold sm:text-4xl">Contact us</h1>
      <p className="mt-2 max-w-2xl text-ink-600">The fastest way to get help is to create a free account and tell us about your case. A coordinator will reply in your portal.</p>
      <div className="mt-6"><LinkButton href="/register">Get medical consultation</LinkButton></div>
      <Card className="mt-8 max-w-2xl">
        <dl className="divide-y divide-ink-100">
          {rows.filter(([, v]) => v).map(([k, v, href]) => (
            <div key={k} className="grid gap-1 py-3 sm:grid-cols-3"><dt className="text-sm font-medium text-ink-500">{k}</dt><dd className="sm:col-span-2">{href ? <a href={href}>{v}</a> : v}</dd></div>
          ))}
        </dl>
        {rows.every(([, v]) => !v) && <p className="text-ink-600">Contact details will appear here soon.</p>}
      </Card>
      <p className="mt-6 max-w-2xl text-sm text-ink-500">In an emergency, contact your local emergency services. We are not an emergency service.</p>
    </Container>
  );
}
