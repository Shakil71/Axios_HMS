'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DocumentList, DocumentUploader } from '@/components/documents';
import { Skeleton } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { DocumentDto } from '@/lib/types';

export default function DocumentsPage() {
  const qc = useQueryClient();
  const docs = useQuery({ queryKey: ['documents'], queryFn: async () => (await api<DocumentDto[]>('/documents?pageSize=100')).data });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['documents'] });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">My documents</h1>
        <p className="text-ink-600">Upload your passport and medical reports. Only people who need them to help you can see them, and every view is recorded.</p>
      </div>
      <DocumentUploader onDone={refresh} />
      <section aria-labelledby="mine">
        <h2 id="mine" className="mb-3 text-lg font-semibold">Uploaded documents</h2>
        {docs.isLoading ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
          : docs.isError ? <p role="alert" className="text-red-700">We could not load your documents. Please refresh the page.</p>
          : <DocumentList documents={docs.data ?? []} onChanged={refresh} />}
      </section>
    </div>
  );
}
