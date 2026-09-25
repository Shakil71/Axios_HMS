'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Badge, Card, EmptyState, LinkButton, Skeleton } from '@/components/ui';
import { api } from '@/lib/api-client';
import { caseTone, fmtDate } from '@/lib/labels';
import type { CaseSummary } from '@/lib/types';

export default function CasesPage() {
  const q = useQuery({ queryKey: ['cases'], queryFn: async () => (await api<CaseSummary[]>('/cases?pageSize=50')).data });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold sm:text-3xl">My treatment cases</h1><p className="text-ink-600">Each case follows one person’s treatment journey.</p></div>
        <LinkButton href="/patient/cases/new">Start a new case</LinkButton>
      </div>
      {q.isLoading ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        : q.isError ? <p role="alert" className="text-red-700">We could not load your cases. Please refresh the page.</p>
        : !q.data?.length ? <EmptyState title="No cases yet" action={<LinkButton href="/patient/cases/new">Start your treatment journey</LinkButton>}>Tell us about your condition and we will guide you.</EmptyState>
        : (
          <ul className="space-y-3">
            {q.data.map((c) => (
              <li key={c.id}>
                <Card className="relative p-4 transition-shadow hover:shadow-pop">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs text-ink-500">{c.caseNumber}</p>
                      <h2 className="text-lg font-semibold"><Link href={`/patient/cases/${c.id}`} className="text-ink-900 after:absolute after:inset-0">{c.treatment?.name ?? 'Treatment case'}{c.familyMember ? ` — for ${c.familyMember.fullName}` : ''}</Link></h2>
                      <p className="text-sm text-ink-600">Started {fmtDate(c.createdAt)}{c.preferredCountry ? ` · ${c.preferredCountry.name}` : ''}</p>
                    </div>
                    <Badge tone={caseTone(c.status)}>{c.statusLabel}</Badge>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
