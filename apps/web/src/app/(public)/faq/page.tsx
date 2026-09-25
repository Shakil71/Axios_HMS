import { JsonLd, faqLd } from '@/components/json-ld';
import { Container, EmptyState } from '@/components/ui';
import { apiGet } from '@/lib/api-server';
import { pageMeta } from '@/lib/seo';
import type { Faq } from '@/lib/types';

export const revalidate = 300;
export const metadata = pageMeta({ title: 'Questions and answers', description: 'Answers to common questions about arranging treatment abroad.', path: '/faq' });

export default async function FaqPage() {
  const faqs = (await apiGet<Faq[]>('/faqs')) ?? [];
  return (
    <Container className="py-10 sm:py-14">
      {faqs.length > 0 && <JsonLd data={faqLd(faqs)} />}
      <h1 className="text-3xl font-bold sm:text-4xl">Questions and answers</h1>
      <div className="mt-8 max-w-3xl">
        {faqs.length ? (
          <div className="divide-y divide-ink-200 rounded-xl border border-ink-200">
            {faqs.map((f) => <details key={f.id} className="p-5"><summary className="cursor-pointer list-none font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">{f.question}</summary><p className="mt-2 text-ink-600">{f.answer}</p></details>)}
          </div>
        ) : <EmptyState title="No questions yet">Please contact us and we will be happy to help.</EmptyState>}
      </div>
    </Container>
  );
}
