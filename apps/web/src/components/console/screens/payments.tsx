'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { CaseRow, InvoiceRow } from '@/lib/console-types';
import { errorText, qstr, useAction, useDebounced, useGet, useList } from '@/lib/hooks';
import { fmtDate } from '@/lib/labels';
import { INVOICE_STATUS, entry, money } from '@/lib/status';
import { usePermissions } from '../providers';
import { Icon } from '../icons';
import { useToast } from '../shell';
import { ConfirmDialog, DataTable, Drawer, FilterBar, FilterSelect, Kpi, KeyValue, PageHeader, Pager, Panel, SearchBox, StatusBadge, type Column } from '../kit';

const METHODS: Record<string, string> = { BANK_TRANSFER: 'Bank transfer', MOBILE_BANKING: 'Mobile banking', CARD: 'Card', CASH: 'Cash', OTHER: 'Other' };

export function InvoiceForm({ open, onClose, caseId: fixedCaseId }: { open: boolean; onClose: () => void; caseId?: string }) {
  const toast = useToast();
  const cases = useGet<CaseRow[]>(['inv-case-picker'], open && !fixedCaseId ? '/cases?pageSize=100' : null);
  const [caseId, setCaseId] = useState(fixedCaseId ?? '');
  const [currency, setCurrency] = useState('USD');
  const [items, setItems] = useState([{ description: '', quantity: '1', unitPrice: '' }]);
  const [discount, setDiscount] = useState('0');
  const [tax, setTax] = useState('0');
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
  const total = subtotal - (Number(discount) || 0) + (Number(tax) || 0);
  const create = useAction(() => api('/invoices', {
    method: 'POST',
    body: { caseId, currency, items: items.filter((i) => i.description && Number(i.unitPrice) > 0).map((i) => ({ description: i.description, quantity: Number(i.quantity) || 1, unitPrice: Number(i.unitPrice) })), discount: Number(discount) || 0, tax: Number(tax) || 0, dueDate: due || null, notes: notes || null },
  }), { invalidate: [['invoices'], ['workspace'], ['case']], onSuccess: () => { toast('Invoice issued. The patient has been notified.'); onClose(); }, onError: (e) => setError(errorText(e)) });

  const caseList = cases.data ?? [];
  return (
    <Drawer open={open} onClose={onClose} title="New invoice" wide footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={create.isPending || !caseId || total <= 0} onClick={() => { setError(null); create.mutate(undefined); }}>{create.isPending ? 'Issuing…' : `Issue invoice · ${money(total, currency)}`}</Button></>}>
      <div className="space-y-4">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
        {!fixedCaseId && <Field label="Case" htmlFor="in-case" required><Select id="in-case" value={caseId} onChange={(e) => setCaseId(e.target.value)}><option value="">Choose a case</option>{caseList.map((c) => <option key={c.id} value={c.id}>{c.caseNumber} · {c.patient.fullName}</option>)}</Select></Field>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Currency" htmlFor="in-cur"><Select id="in-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>{['USD', 'BDT', 'EUR', 'GBP', 'INR'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Due date" htmlFor="in-due"><Input id="in-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Line items</h3><Button variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => setItems([...items, { description: '', quantity: '1', unitPrice: '' }])}><Icon name="plus" className="size-4" />Add line</Button></div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_7rem_auto] items-end gap-2 max-sm:grid-cols-2">
                <div className="max-sm:col-span-2"><Field label={i === 0 ? 'Description' : 'Description'} htmlFor={`li-d-${i}`}><Input id={`li-d-${i}`} value={it.description} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} /></Field></div>
                <Field label="Qty" htmlFor={`li-q-${i}`}><Input id={`li-q-${i}`} type="number" min={1} value={it.quantity} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} /></Field>
                <Field label="Unit price" htmlFor={`li-p-${i}`}><Input id={`li-p-${i}`} type="number" min={0} step="0.01" value={it.unitPrice} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, unitPrice: e.target.value } : x))} /></Field>
                {items.length > 1 && <Button variant="ghost" className="mb-0.5 text-red-700" aria-label={`Remove line ${i + 1}`} onClick={() => setItems(items.filter((_, j) => j !== i))}><Icon name="x" className="size-4" /></Button>}
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Discount" htmlFor="in-disc"><Input id="in-disc" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field><Field label="Tax" htmlFor="in-tax"><Input id="in-tax" type="number" min={0} step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} /></Field></div>
        <dl className="rounded-lg bg-ink-50 p-3 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{money(subtotal, currency)}</dd></div><div className="flex justify-between font-bold"><dt>Total</dt><dd className="tabular-nums">{money(total, currency)}</dd></div></dl>
        <Field label="Note on the invoice" htmlFor="in-notes"><Textarea id="in-notes" className="min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Drawer>
  );
}

/** Invoice detail: lines, payments, record payment, refund and cancel (each gated by its permission). */
export function InvoiceDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { can } = usePermissions();
  const toast = useToast();
  const q = useGet<InvoiceRow>(['invoice', id], id ? `/invoices/${id}` : null);
  const inv = q.data;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [txn, setTxn] = useState('');
  const [refund, setRefund] = useState<{ id: string; amount: number } | null>(null);
  const [reason, setReason] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const inval = [['invoice'], ['invoices'], ['workspace'], ['case'], ['admin-overview']];

  const pay = useAction(() => api(`/invoices/${id}/payments`, { method: 'POST', body: { amount: Number(amount), method, transactionId: txn || null } }), {
    invalidate: inval, onSuccess: () => { toast('Payment recorded. The patient has been notified.'); setAmount(''); setTxn(''); }, onError: (e) => toast(errorText(e), 'danger'),
  });
  const doRefund = useAction(() => api(`/payments/${refund!.id}/refund`, { method: 'POST', body: { reason } }), { invalidate: inval, onSuccess: () => { toast('Payment refunded.'); setRefund(null); setReason(''); }, onError: (e) => toast(errorText(e), 'danger') });
  const cancel = useAction(() => api(`/invoices/${id}/cancel`, { method: 'POST' }), { invalidate: inval, onSuccess: () => { toast('Invoice cancelled.'); setConfirmCancel(false); }, onError: (e) => toast(errorText(e), 'danger') });
  const open = inv && ['PENDING', 'PARTIAL'].includes(inv.status);

  return (
    <>
      <Drawer open={!!id && !refund} onClose={onClose} title={inv ? `Invoice ${inv.invoiceNumber}` : 'Invoice'} wide>
        {!inv ? <p className="text-sm text-ink-600">Loading…</p> : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge e={entry(INVOICE_STATUS, inv.status)} />{inv.overdue && <Badge tone="danger">Overdue</Badge>}</div>
            <KeyValue items={[['Patient', inv.patient?.fullName], ['Case', inv.case.caseNumber], ['Issued', fmtDate(inv.issuedAt)], ['Due', inv.dueDate ? fmtDate(inv.dueDate) : null], ['Note', inv.notes]]} />
            <table className="w-full text-sm"><thead><tr className="border-b border-ink-200 text-left text-xs uppercase text-ink-500"><th className="py-2 font-semibold">Item</th><th className="py-2 text-right font-semibold">Qty</th><th className="py-2 text-right font-semibold">Amount</th></tr></thead>
              <tbody className="divide-y divide-ink-100">{inv.items.map((i) => <tr key={i.id}><td className="py-2">{i.description}</td><td className="py-2 text-right tabular-nums">{i.quantity}</td><td className="py-2 text-right tabular-nums">{money(i.amount, inv.currency)}</td></tr>)}</tbody>
              <tfoot className="text-sm">{inv.discount > 0 && <tr><td colSpan={2} className="pt-2 text-right text-ink-600">Discount</td><td className="pt-2 text-right tabular-nums">−{money(inv.discount, inv.currency)}</td></tr>}{inv.tax > 0 && <tr><td colSpan={2} className="text-right text-ink-600">Tax</td><td className="text-right tabular-nums">{money(inv.tax, inv.currency)}</td></tr>}<tr className="font-bold"><td colSpan={2} className="pt-1 text-right">Total</td><td className="pt-1 text-right tabular-nums">{money(inv.total, inv.currency)}</td></tr><tr><td colSpan={2} className="text-right text-emerald-700">Paid</td><td className="text-right tabular-nums text-emerald-700">{money(inv.paid, inv.currency)}</td></tr><tr className="font-semibold"><td colSpan={2} className="text-right">Balance</td><td className="text-right tabular-nums">{money(inv.balance, inv.currency)}</td></tr></tfoot></table>

            <div><h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Payments</h3>
              {inv.payments.length === 0 ? <p className="text-sm text-ink-600">No payments yet.</p> : (
                <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">{inv.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm"><div className="min-w-0 flex-1"><p className="font-semibold tabular-nums">{money(p.amount, p.currency)} <span className="font-normal text-ink-600">· {METHODS[p.method] ?? p.method}</span></p><p className="text-xs text-ink-500">{p.receiptNumber}{p.transactionId ? ` · ${p.transactionId}` : ''}{p.paidAt ? ` · ${fmtDate(p.paidAt)}` : ''}</p></div>{p.status === 'REFUNDED' ? <Badge>Refunded</Badge> : can('payments.refund') && <Button variant="ghost" className="min-h-9 px-2.5 py-1 text-red-700" onClick={() => setRefund({ id: p.id, amount: p.amount })}>Refund</Button>}</li>))}</ul>
              )}
            </div>

            {open && can('payments.create') && (
              <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-4">
                <h3 className="mb-3 text-sm font-semibold">Record a payment</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={`Amount (max ${money(inv.balance, inv.currency)})`} htmlFor="pay-a"><Input id="pay-a" type="number" min={0} step="0.01" max={inv.balance} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
                  <Field label="Method" htmlFor="pay-m"><Select id="pay-m" value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
                  <Field label="Transaction ID" htmlFor="pay-t"><Input id="pay-t" value={txn} onChange={(e) => setTxn(e.target.value)} /></Field>
                </div>
                <div className="mt-3 flex flex-wrap gap-2"><Button disabled={pay.isPending || !Number(amount)} onClick={() => pay.mutate(undefined)}>{pay.isPending ? 'Recording…' : 'Record payment'}</Button><Button variant="secondary" onClick={() => setAmount(String(inv.balance))}>Pay full balance</Button></div>
              </div>
            )}
            {open && can('payments.create') && inv.paid === 0 && <Button variant="ghost" className="text-red-700" onClick={() => setConfirmCancel(true)}>Cancel this invoice</Button>}
          </div>
        )}
      </Drawer>
      <Drawer open={!!refund} onClose={() => setRefund(null)} title="Refund payment" footer={<><Button variant="secondary" onClick={() => setRefund(null)}>Keep payment</Button><Button variant="danger" disabled={doRefund.isPending || reason.trim().length < 3} onClick={() => doRefund.mutate(undefined)}>{doRefund.isPending ? 'Refunding…' : `Refund ${refund ? money(refund.amount, inv?.currency) : ''}`}</Button></>}>
        <p className="mb-3 text-sm text-ink-700">This is recorded in the audit log with your reason.</p>
        <Field label="Reason" htmlFor="rf-r" required><Textarea id="rf-r" className="min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Drawer>
      <ConfirmDialog open={confirmCancel} title="Cancel invoice?" danger confirmLabel="Cancel invoice" busy={cancel.isPending} onCancel={() => setConfirmCancel(false)} onConfirm={() => cancel.mutate(undefined)}>No payments have been made, so nothing needs refunding. The patient is not notified.</ConfirmDialog>
    </>
  );
}

export function PaymentsScreen({ area }: { area: 'admin' | 'staff' }) {
  const { can } = usePermissions();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const dq = useDebounced(q);
  const list = useList<InvoiceRow>(['invoices'], `/invoices${qstr({ page, pageSize: 12, q: dq, status })}`);
  const all = useList<InvoiceRow>(['invoices-totals'], '/invoices?pageSize=100');
  const t = useMemo(() => {
    const rows = all.data?.items ?? [];
    const sum = (f: (i: InvoiceRow) => number) => rows.reduce((s, i) => s + f(i), 0);
    return { paid: sum((i) => i.paid), balance: sum((i) => (['PENDING', 'PARTIAL'].includes(i.status) ? i.balance : 0)), overdue: rows.filter((i) => i.overdue).length, count: all.data?.meta.total ?? 0 };
  }, [all.data]);

  const columns: Column<InvoiceRow>[] = [
    { key: 'no', header: 'Invoice', primary: true, cell: (i) => <div><p className="font-mono text-sm font-semibold">{i.invoiceNumber}</p><p className="text-xs font-normal text-ink-500">{fmtDate(i.issuedAt)}</p></div> },
    { key: 'patient', header: 'Patient', cell: (i) => i.patient?.fullName },
    { key: 'status', header: 'Status', cell: (i) => <div className="flex flex-wrap items-center gap-1"><StatusBadge e={entry(INVOICE_STATUS, i.status)} />{i.overdue && <Badge tone="danger">Overdue</Badge>}</div> },
    { key: 'total', header: 'Total', align: 'right', cell: (i) => money(i.total, i.currency) },
    { key: 'balance', header: 'Balance', align: 'right', cell: (i) => <span className={i.balance > 0 && i.status !== 'CANCELLED' ? 'font-semibold' : 'text-ink-400'}>{money(i.status === 'CANCELLED' ? 0 : i.balance, i.currency)}</span> },
  ];
  void area;
  return (
    <>
      <PageHeader title="Payments" subtitle="Invoices, payments received and refunds" actions={can('payments.create') ? <Button onClick={() => setCreate(true)}><Icon name="plus" className="size-4" />New invoice</Button> : undefined} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Collected" value={money(t.paid)} icon="check" tone="success" loading={all.isLoading} />
        <Kpi label="Outstanding" value={money(t.balance)} icon="card" tone="warning" loading={all.isLoading} />
        <Kpi label="Overdue invoices" value={t.overdue} icon="alert" tone={t.overdue ? 'danger' : 'neutral'} loading={all.isLoading} />
        <Kpi label="Invoices" value={t.count} icon="file" loading={all.isLoading} />
      </div>
      <Panel pad={false}>
        <FilterBar>
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Invoice, case or patient" />
          <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={Object.entries(INVOICE_STATUS).map(([k, x]) => [k, x.label])} className="w-40" />
        </FilterBar>
        <DataTable rows={list.data?.items} loading={list.isLoading} columns={columns} rowKey={(i) => i.id} caption="Invoices" onRowClick={(i) => setOpen(i.id)} empty={<p className="py-8 text-center text-sm text-ink-600">No invoices match.</p>} />
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Panel>
      <InvoiceDrawer id={open} onClose={() => setOpen(null)} />
      {create && <InvoiceForm open onClose={() => setCreate(false)} />}
    </>
  );
}
