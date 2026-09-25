import Link from 'next/link';
import { Alert, Card, Container, LinkButton } from '@/components/ui';
import { apiGet, apiList } from '@/lib/api-server';
import { flagEmoji } from '@/lib/labels';
import { pageMeta } from '@/lib/seo';
import type { Country } from '@/lib/types';

export const revalidate = 300;
export const metadata = pageMeta({ title: 'Medical visa assistance', description: 'See the usual documents for a medical visa by country and learn how we help you prepare your application.', path: '/visa-assistance' });

interface Visa { country: string; information: string | null; disclaimer: string; requirements: { id: string; name: string; description: string | null; isMandatory: boolean }[] }

export default async function VisaPage({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
  const { country } = await searchParams;
  const { data: countries } = await apiList<Country>('/countries?pageSize=60');
  const selected = country && /^[a-z0-9-]+$/.test(country) ? await apiGet<Visa>(`/visa/requirements?country=${country}`) : null;
  const meta = countries.find((c) => c.slug === country);

  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-3xl font-bold sm:text-4xl">Medical visa assistance</h1>
      <p className="mt-2 max-w-2xl text-ink-600">Choose your destination to see the documents people usually need. Your coordinator will confirm what applies to you.</p>

      <form method="get" action="/visa-assistance" className="mt-6 flex max-w-xl flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="country" className="mb-1.5 block text-sm font-medium">Country you plan to visit</label>
          <select id="country" name="country" defaultValue={country ?? ''} className="block min-h-11 w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-base">
            <option value="">Select a country</option>
            {countries.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <button type="submit" className="min-h-11 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">Show checklist</button>
      </form>

      {selected && (
        <Card className="mt-8 max-w-3xl">
          <h2 className="text-xl font-semibold">{meta && <span aria-hidden="true">{flagEmoji(meta.isoCode)} </span>}{selected.country}: usual documents</h2>
          {selected.information && <p className="mt-2 text-ink-700">{selected.information}</p>}
          {selected.requirements.length > 0 ? (
            <ul className="mt-4 divide-y divide-ink-100">
              {selected.requirements.map((r) => (
                <li key={r.id} className="py-3">
                  <p className="font-medium">{r.name} {!r.isMandatory && <span className="text-sm font-normal text-ink-500">(if available)</span>}</p>
                  {r.description && <p className="text-sm text-ink-600">{r.description}</p>}
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-ink-600">We have not published a checklist for this country yet. Your coordinator will share it.</p>}
          <div className="mt-4"><Alert tone="warning">{selected.disclaimer}</Alert></div>
        </Card>
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[['1. Upload your documents', 'Add your passport, photo and medical reports to your portal.'], ['2. We check the checklist', 'Your coordinator tells you what is missing.'], ['3. Submit your application', 'We guide you through the steps and keep you updated.']].map(([t, d]) => (
          <Card key={t}><h3 className="font-semibold">{t}</h3><p className="mt-1 text-sm text-ink-600">{d}</p></Card>
        ))}
      </div>
      <div className="mt-8 flex gap-3"><LinkButton href="/register">Start your treatment journey</LinkButton><Link href="/contact" className="inline-flex items-center px-3 text-sm font-semibold">Talk to us</Link></div>
    </Container>
  );
}
