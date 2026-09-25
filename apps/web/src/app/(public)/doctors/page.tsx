import { DoctorCardView, Grid, Pagination } from '@/components/cards';
import { FilterForm } from '@/components/filter-form';
import { Container, EmptyState } from '@/components/ui';
import { apiGet, apiList, qs } from '@/lib/api-server';
import { pageMeta } from '@/lib/seo';
import type { Country, DoctorCard, Ref } from '@/lib/types';

export const metadata = pageMeta({ title: 'Doctors abroad', description: 'Find doctors by specialty, country, experience and language. All profiles are verified by our team.', path: '/doctors' });

export default async function DoctorsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const params = { country: sp.country, specialty: sp.specialty, language: sp.language, minExperience: sp.minExperience, q: sp.q };
  const page = Math.max(1, Number(sp.page) || 1);
  const [list, countries, specialties, languages] = await Promise.all([
    apiList<DoctorCard>(`/doctors${qs({ ...params, page, pageSize: 12 })}`),
    apiList<Country>('/countries?pageSize=60'),
    apiGet<Ref[]>('/specialties'),
    apiGet<{ code: string; name: string }[]>('/languages'),
  ]);
  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-3xl font-bold sm:text-4xl">Doctors abroad</h1>
      <p className="mt-2 max-w-2xl text-ink-600">Only profiles verified by our team from the doctor’s own documents are shown.</p>
      <div className="mt-6">
        <FilterForm
          action="/doctors"
          values={params}
          fields={[
            { name: 'country', label: 'Country', type: 'select', options: countries.data.map((c) => ({ value: c.slug, label: c.name })) },
            { name: 'specialty', label: 'Specialty', type: 'select', options: (specialties ?? []).map((s) => ({ value: s.slug, label: s.name })) },
            { name: 'language', label: 'Language', type: 'select', options: (languages ?? []).map((l) => ({ value: l.code, label: l.name })) },
            { name: 'minExperience', label: 'Minimum years of experience', type: 'number', placeholder: 'e.g. 10' },
            { name: 'q', label: 'Search', type: 'search', placeholder: 'Doctor name' },
          ]}
        />
      </div>
      <p className="mt-6 text-sm text-ink-600" aria-live="polite">{list.meta.total} {list.meta.total === 1 ? 'doctor' : 'doctors'} found</p>
      <div className="mt-3">
        {list.data.length ? <Grid>{list.data.map((d) => <DoctorCardView key={d.id} d={d} />)}</Grid> : <EmptyState title="No doctors match your filters">Try removing a filter.</EmptyState>}
      </div>
      <Pagination basePath="/doctors" params={params} page={page} pageSize={list.meta.pageSize} total={list.meta.total} />
    </Container>
  );
}
