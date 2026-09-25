'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { DOCUMENT_CATEGORIES, documentTone, fmtBytes, fmtDate } from '@/lib/labels';
import type { DocumentDto } from '@/lib/types';
import { startUpload, uploadErrorMessage, validateFile } from '@/lib/upload';
import { Alert, Badge, Button, Card, EmptyState, Field, Select, cx } from './ui';

interface Item { id: number; name: string; size: number; progress: number; state: 'uploading' | 'done' | 'error'; error?: string }
let seq = 0;

export function DocumentUploader({ caseId, familyMemberId, defaultCategory = 'MEDICAL_REPORT', onDone }: { caseId?: string; familyMemberId?: string; defaultCategory?: string; onDone?: () => void }) {
  const [category, setCategory] = useState(defaultCategory);
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const cat = DOCUMENT_CATEGORIES.find((c) => c.value === category);

  const patch = (id: number, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function handle(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const id = ++seq;
      const invalid = validateFile(file, !!cat?.scan);
      setItems((xs) => [{ id, name: file.name, size: file.size, progress: 0, state: invalid ? 'error' : 'uploading', error: invalid ?? undefined }, ...xs]);
      if (invalid) continue;
      try {
        await startUpload({ file, category, caseId, familyMemberId }, (pct) => patch(id, { progress: pct }));
        patch(id, { progress: 100, state: 'done' });
        onDone?.();
      } catch (e) {
        patch(id, { state: 'error', error: uploadErrorMessage(e) });
      }
    }
  }

  const accept = cat?.scan ? '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.zip,.dcm' : '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif';

  return (
    <Card>
      <h2 className="text-lg font-semibold">Upload your documents</h2>
      <div className="mt-4 max-w-sm">
        <Field label="What are you uploading?" htmlFor="doc-category" hint={cat?.hint}>
          <Select id="doc-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {DOCUMENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files); }}
        className={cx('mt-4 rounded-xl border-2 border-dashed p-6 text-center transition-colors', drag ? 'border-brand-600 bg-brand-50' : 'border-ink-300 bg-ink-50')}
      >
        <p className="font-medium text-ink-800">Drag files here, or choose how to add them</p>
        <p className="mt-1 text-sm text-ink-600">PDF, JPG, PNG or HEIC. Up to {fmtBytes(15 * 1024 * 1024)} each.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Button type="button" onClick={() => fileRef.current?.click()}>Choose files</Button>
          <Button type="button" variant="secondary" onClick={() => cameraRef.current?.click()}>Take a photo</Button>
        </div>
        <input ref={fileRef} type="file" multiple accept={accept} className="sr-only" aria-label="Choose files to upload" tabIndex={-1} onChange={(e) => { if (e.target.files) void handle(e.target.files); e.target.value = ''; }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a photo of your document" tabIndex={-1} onChange={(e) => { if (e.target.files) void handle(e.target.files); e.target.value = ''; }} />
      </div>

      {items.length > 0 && (
        <ul className="mt-4 space-y-2" aria-live="polite">
          {items.map((it) => (
            <li key={it.id} className="rounded-lg border border-ink-200 p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{it.name} <span className="font-normal text-ink-500">· {fmtBytes(it.size)}</span></span>
                <span className={cx('shrink-0', it.state === 'error' ? 'text-red-700' : it.state === 'done' ? 'text-emerald-700' : 'text-ink-600')}>
                  {it.state === 'uploading' ? `${it.progress}%` : it.state === 'done' ? 'Uploaded' : 'Failed'}
                </span>
              </div>
              {it.state === 'uploading' && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={it.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${it.name}`}><div className="h-full bg-brand-600 transition-all" style={{ width: `${it.progress}%` }} /></div>}
              {it.state === 'done' && <p className="mt-1 text-sm text-emerald-800">Your document has been submitted for verification.</p>}
              {it.state === 'error' && <p role="alert" className="mt-1 text-sm text-red-700">{it.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DocumentList({ documents, onChanged }: { documents: DocumentDto[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);

  async function open(id: string, purpose: 'view' | 'download') {
    setError(null);
    setBusy(id);
    const w = purpose === 'view' ? window.open('', '_blank') : null; // open synchronously so popup blockers allow it
    if (w) w.opener = null;
    try {
      const { data } = await api<{ url: string }>(`/documents/${id}/download-url`, { method: 'POST', body: { purpose } });
      if (w) w.location.href = data.url;
      else window.location.assign(data.url);
    } catch (e) {
      w?.close();
      setError(uploadErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      onChanged();
    } catch (e) {
      setError(uploadErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function replace(file: File) {
    const id = replaceTarget.current;
    const invalid = validateFile(file, true);
    if (!id) return;
    if (invalid) return setError(invalid);
    setBusy(id);
    setError(null);
    try {
      await startUpload({ file, documentId: id }, () => undefined);
      onChanged();
    } catch (e) {
      setError(uploadErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (!documents.length) return <EmptyState title="No documents yet">Upload your passport and medical reports so our team can review your case.</EmptyState>;

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <input ref={replaceRef} type="file" className="sr-only" tabIndex={-1} aria-label="Choose a replacement file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.zip" onChange={(e) => { const f = e.target.files?.[0]; if (f) void replace(f); e.target.value = ''; }} />
      <ul className="space-y-3">
        {documents.map((d) => (
          <li key={d.id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{d.categoryLabel.charAt(0).toUpperCase() + d.categoryLabel.slice(1)}</p>
                  {d.file && <p className="truncate text-sm text-ink-600">{d.file.fileName} · {fmtBytes(d.file.sizeBytes)} · added {fmtDate(d.file.uploadedAt)}{d.currentVersion > 1 ? ` · version ${d.currentVersion}` : ''}</p>}
                  {d.expiresAt && <p className="text-xs text-ink-500">Expires {fmtDate(d.expiresAt)}</p>}
                </div>
                <Badge tone={documentTone(d.status)}>{d.statusLabel}</Badge>
              </div>
              {d.status === 'REJECTED' && d.rejectionReason && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"><strong>What to fix:</strong> {d.rejectionReason}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" className="min-h-9 px-3 py-1.5" disabled={busy === d.id} onClick={() => open(d.id, 'view')}>View</Button>
                <Button variant="secondary" className="min-h-9 px-3 py-1.5" disabled={busy === d.id} onClick={() => open(d.id, 'download')}>Download</Button>
                <Button variant={d.status === 'REJECTED' ? 'primary' : 'secondary'} className="min-h-9 px-3 py-1.5" disabled={busy === d.id} onClick={() => { replaceTarget.current = d.id; replaceRef.current?.click(); }}>Replace</Button>
                {d.status !== 'VERIFIED' && (
                  confirmDelete === d.id ? (
                    <span className="flex items-center gap-2 text-sm">Delete this document? <Button variant="danger" className="min-h-9 px-3 py-1.5" disabled={busy === d.id} onClick={() => remove(d.id)}>Yes, delete</Button><Button variant="ghost" className="min-h-9 px-3 py-1.5" onClick={() => setConfirmDelete(null)}>Keep</Button></span>
                  ) : <Button variant="ghost" className="min-h-9 px-3 py-1.5 text-red-700" onClick={() => setConfirmDelete(d.id)}>Delete</Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
