'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { DocumentList, DocumentUploader } from '@/components/documents';
import { JourneyStepper, TimelineList } from '@/components/journey';
import { Alert, Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui';
import { ApiError, api } from '@/lib/api-client';
import { caseTone, fmtDate } from '@/lib/labels';
import type { CaseNote, CaseSummary, DocumentDto, TimelineEvent } from '@/lib/types';

const CANCELLABLE = ['NEW', 'DOCUMENT_COLLECTION', 'MEDICAL_REVIEW', 'DOCTOR_REVIEW', 'HOSPITAL_SELECTION', 'QUOTATION', 'APPOINTMENT'];

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <div><dt className="text-sm text-ink-500">{label}</dt><dd className="whitespace-pre-line text-ink-800">{value}</dd></div>;
}

function CaseView() {
  const { id } = useParams<{ id: string }>();
  const isNew = useSearchParams().get('new') === '1';
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const c = useQuery({ queryKey: ['case', id], queryFn: async () => (await api<CaseSummary>(`/cases/${id}`)).data, retry: false });
  const timeline = useQuery({ queryKey: ['case', id, 'timeline'], queryFn: async () => (await api<TimelineEvent[]>(`/cases/${id}/timeline`)).data, enabled: c.isSuccess });
  const notes = useQuery({ queryKey: ['case', id, 'notes'], queryFn: async () => (await api<CaseNote[]>(`/cases/${id}/notes`)).data, enabled: c.isSuccess });
  const docs = useQuery({ queryKey: ['documents', { caseId: id }], queryFn: async () => (await api<DocumentDto[]>(`/documents?caseId=${id}&pageSize=100`)).data, enabled: c.isSuccess });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['case', id] });
    void qc.invalidateQueries({ queryKey: ['documents'] });
    void qc.invalidateQueries({ queryKey: ['cases'] });
  };

  if (c.isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-48" /></div>;
  if (c.isError) {
    const notFound = c.error instanceof ApiError && c.error.status === 404;
    return <EmptyState title={notFound ? 'We could not find this case' : 'We could not load this case'} action={<Link href="/patient/cases" className="font-semibold">Back to my cases</Link>}>{notFound ? 'It may have been removed, or the link is incorrect.' : 'Please check your connection and try again.'}</EmptyState>;
  }
  const cs = c.data!;

  async function cancel() {
    setError(null);
    try {
      await api(`/cases/${id}/cancel`, { method: 'POST' });
      setConfirm(false);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'We could not cancel this case. Please try again.');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/patient/cases" className="text-sm">← My cases</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm text-ink-500">{cs.caseNumber}</p>
            <h1 className="text-2xl font-bold sm:text-3xl">{cs.treatment?.name ?? 'Treatment case'}{cs.familyMember ? ` — for ${cs.familyMember.fullName}` : ''}</h1>
          </div>
          <Badge tone={caseTone(cs.status)}>{cs.statusLabel}</Badge>
        </div>
      </div>

      {isNew && <Alert tone="success" title="Your case has been created">Next, upload your medical reports and passport below. This helps our team review your case faster.</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <h2 className="text-lg font-semibold">Your treatment journey</h2>
        <div className="mt-4"><JourneyStepper status={cs.status} /></div>
        {cs.coordinators.length > 0 && <p className="mt-4 border-t border-ink-100 pt-3 text-sm text-ink-600">Your team: {cs.coordinators.map((k) => `${k.name} (${k.role.replace('_', ' ').toLowerCase()})`).join(', ')}</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DocumentUploader caseId={id} familyMemberId={cs.familyMember?.id} onDone={refresh} />
          <section aria-labelledby="case-docs">
            <h2 id="case-docs" className="mb-3 text-lg font-semibold">Documents for this case</h2>
            {docs.isLoading ? <Skeleton className="h-24" /> : <DocumentList documents={docs.data ?? []} onChanged={refresh} />}
          </section>
          {!!notes.data?.length && (
            <Card>
              <h2 className="text-lg font-semibold">Updates from our team</h2>
              <ul className="mt-3 space-y-3">{notes.data.map((n) => <li key={n.id} className="rounded-lg bg-brand-50 p-3 text-sm"><p>{n.body}</p><p className="mt-1 text-xs text-ink-500">{n.author} · {fmtDate(n.createdAt)}</p></li>)}</ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold">What happened</h2>
            <div className="mt-4">{timeline.isLoading ? <Skeleton className="h-32" /> : <TimelineList events={timeline.data ?? []} />}</div>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold">Case details</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <Detail label="Symptoms" value={cs.symptoms} />
              <Detail label="Diagnosis" value={cs.currentDiagnosis} />
              <Detail label="Medical history" value={cs.medicalHistory} />
              <Detail label="Previous treatment" value={cs.previousTreatment} />
              <Detail label="Medicines" value={cs.currentMedications} />
              <Detail label="Preferred country" value={cs.preferredCountry?.name} />
              <Detail label="Preferred hospital" value={cs.preferredHospital?.name} />
              <Detail label="Selected doctor" value={cs.selectedDoctor?.fullName} />
              <Detail label="Selected hospital" value={cs.selectedHospital?.name} />
              <Detail label="Preferred travel date" value={cs.preferredTravelDate ? fmtDate(cs.preferredTravelDate) : null} />
              <Detail label="Budget" value={cs.budgetMin != null || cs.budgetMax != null ? `${cs.budgetMin ?? ''}–${cs.budgetMax ?? ''} ${cs.budgetCurrency ?? ''}` : null} />
            </dl>
            <p className="mt-3 text-xs text-ink-500">To change these details, message your coordinator.</p>
          </Card>
          {CANCELLABLE.includes(cs.status) && (
            <Card>
              <h2 className="text-lg font-semibold">Need to stop?</h2>
              {confirm ? (
                <div className="mt-3 space-y-3"><p className="text-sm text-ink-700">Cancel this case? Our team will stop working on it.</p><div className="flex gap-2"><Button variant="danger" onClick={cancel}>Yes, cancel case</Button><Button variant="secondary" onClick={() => setConfirm(false)}>Keep it</Button></div></div>
              ) : <Button className="mt-3" variant="secondary" onClick={() => setConfirm(true)}>Cancel this case</Button>}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CasePage() {
  return <Suspense><CaseView /></Suspense>;
}
