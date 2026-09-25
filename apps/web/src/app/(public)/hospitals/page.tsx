import { Grid, HospitalCardView, Pagination } from '@/components/cards';
import { FilterForm } from '@/components/filter-form';
import { Container, EmptyState } from '@/components/ui';
import { apiGet, apiList, qs } from '@/lib/api-server';
import { pageMeta } from '@/lib/seo';
import type { Country, HospitalCard, Ref } from '@/lib/types';

export const metadata = pageMeta({ title: 'Hospitals abroad', description: 'Browse partner hospitals by country, city, specialty, treatment and accreditation.', path: '/hospitals' });

type SP = Promise<Record<string, string | undefined>>;

export default async function HospitalsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const params = { country: sp.country, specialty: sp.specialty, treatment: sp.treatment, accreditation: sp.accreditation, q: sp.q };
  const page = Math.max(1, Number(sp.page) || 1);
  const [list, countries, specialties, accreditations] = await Promise.all([
    apiList<HospitalCard>(`/hospitals${qs({ ...params, page, pageSize: 12 })}`),
    apiList<Country>('/countries?pageSize=60'),
    apiGet<Ref[]>('/specialties'),
    apiGet<{ slug: string; name: string }[]>('/accreditations'),
  ]);
  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-3xl font-bold sm:text-4xl">Hospitals abroad</h1>
      <p className="mt-2 max-w-2xl text-ink-600">Every profile is entered and checked by our team.</p>
      <div className="mt-6">
        <FilterForm
          action="/hospitals"
          values={params}
          fields={[
            { name: 'country', label: 'Country', type: 'select', options: countries.data.map((c) => ({ value: c.slug, label: c.name })) },
            { name: 'specialty', label: 'Specialty', type: 'select', options: (specialties ?? []).map((s) => ({ value: s.slug, label: s.name })) },
            { name: 'accreditation', label: 'Accreditation', type: 'select', options: (accreditations ?? []).map((a) => ({ value: a.slug, label: a.name })) },
            { name: 'q', label: 'Search', type: 'search', placeholder: 'Hospital name' },
          ]}
        />
      </div>
      <p className="mt-6 text-sm text-ink-600" aria-live="polite">{list.meta.total} {list.meta.total === 1 ? 'hospital' : 'hospitals'} found</p>
      <div className="mt-3">
        {list.data.length ? <Grid>{list.data.map((h) => <HospitalCardView key={h.id} h={h} />)}</Grid> : <EmptyState title="No hospitals match your filters">Try removing a filter or searching by a different name.</EmptyState>}
      </div>
      <Pagination basePath="/hospitals" params={params} page={page} pageSize={list.meta.pageSize} total={list.meta.total} />
    </Container>
  );
}
