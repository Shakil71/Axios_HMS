import { Grid, Pagination, TreatmentCardView } from '@/components/cards';
import { FilterForm } from '@/components/filter-form';
import { Container, EmptyState } from '@/components/ui';
import { apiGet, apiList, qs } from '@/lib/api-server';
import { pageMeta } from '@/lib/seo';
import type { TreatmentCard, TreatmentCategory } from '@/lib/types';

export const metadata = pageMeta({ title: 'Treatments', description: 'Explore treatments available abroad and find the doctors and hospitals that offer them.', path: '/treatments' });

export default async function TreatmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const params = { category: sp.category, q: sp.q };
  const page = Math.max(1, Number(sp.page) || 1);
  const [list, categories] = await Promise.all([
    apiList<TreatmentCard>(`/treatments${qs({ ...params, page, pageSize: 12 })}`),
    apiGet<TreatmentCategory[]>('/treatment-categories'),
  ]);
  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-3xl font-bold sm:text-4xl">Treatments</h1>
      <p className="mt-2 max-w-2xl text-ink-600">General information to help you prepare questions for your doctor. It is not medical advice.</p>
      <div className="mt-6">
        <FilterForm
          action="/treatments"
          values={params}
          fields={[
            { name: 'category', label: 'Category', type: 'select', options: (categories ?? []).map((c) => ({ value: c.slug, label: c.name })) },
            { name: 'q', label: 'Search', type: 'search', placeholder: 'Treatment name' },
          ]}
        />
      </div>
      <p className="mt-6 text-sm text-ink-600" aria-live="polite">{list.meta.total} {list.meta.total === 1 ? 'treatment' : 'treatments'} found</p>
      <div className="mt-3">
        {list.data.length ? <Grid>{list.data.map((t) => <TreatmentCardView key={t.id} t={t} />)}</Grid> : <EmptyState title="No treatments match your filters">Try a different category or search term.</EmptyState>}
      </div>
      <Pagination basePath="/treatments" params={params} page={page} pageSize={list.meta.pageSize} total={list.meta.total} />
    </Container>
  );
}
