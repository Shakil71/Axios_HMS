import { CountryCardView, Grid } from '@/components/cards';
import { Container, EmptyState } from '@/components/ui';
import { apiList } from '@/lib/api-server';
import { pageMeta } from '@/lib/seo';
import type { Country } from '@/lib/types';

export const revalidate = 300;
export const metadata = pageMeta({ title: 'Countries for medical treatment', description: 'Compare destinations for treatment abroad: partner hospitals, popular treatments and consultation information.', path: '/countries' });

export default async function CountriesPage() {
  const { data } = await apiList<Country>('/countries?pageSize=60');
  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-3xl font-bold sm:text-4xl">Countries for medical treatment</h1>
      <p className="mt-2 max-w-2xl text-ink-600">Choose a destination to see its hospitals, popular treatments and visa checklist.</p>
      <div className="mt-8">
        {data.length ? <Grid>{data.map((c) => <CountryCardView key={c.id} c={c} />)}</Grid> : <EmptyState title="No countries to show yet">Please check back soon.</EmptyState>}
      </div>
    </Container>
  );
}
