'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Avatar, Button } from '@/components/ui';
import type { CaseRow } from '@/lib/console-types';
import { qstr, useDebounced, useList, useGet } from '@/lib/hooks';
import { CASE_STATUS, PRIORITY, STAFF_ROLE_ON_CASE, entry, relTime } from '@/lib/status';
import type { StaffPick } from '@/lib/console-types';
import { usePermissions } from '../providers';
import { DataTable, FilterBar, FilterSelect, PageHeader, Pager, Panel, PriorityDot, SearchBox, StatusBadge, type Column } from '../kit';

function CasesInner({ area }: { area: 'admin' | 'staff' | 'doctor' }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { can } = usePermissions();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [priority, setPriority] = useState(sp.get('priority') ?? '');
  const [assignedTo, setAssignedTo] = useState(sp.get('assignedTo') ?? '');
  const [unassigned, setUnassigned] = useState(sp.get('unassigned') === 'true');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const staff = useGet<StaffPick[]>(['staff-directory'], area === 'admin' && can('cases.assign') ? '/admin/staff-directory' : null);
  const list = useList<CaseRow>(['cases'], `/cases${qstr({ page, pageSize: 12, q: dq, status, priority, assignedTo, unassigned, sort: '-updatedAt' })}`);
  const anyFilter = !!(q || status || priority || assignedTo || unassigned);
  const detailBase = area === 'doctor' ? '/doctor/cases' : `/${area}/cases`;

  const columns: Column<CaseRow>[] = [
    { key: 'patient', header: 'Patient', primary: true, cell: (c) => <span className="inline-flex items-center gap-2.5"><Avatar name={c.patient.fullName} size={32} /><span><span className="block font-semibold">{c.patient.fullName}</span><span className="block font-mono text-xs font-normal text-ink-500">{c.caseNumber}</span></span></span> },
    { key: 'treatment', header: 'Treatment', cell: (c) => <div><p>{c.treatment?.name ?? <span className="text-ink-400">Not chosen</span>}</p><p className="text-xs text-ink-500">{c.preferredCountry?.name}{c.familyMember ? ` · for ${c.familyMember.fullName}` : ''}</p></div> },
    { key: 'status', header: 'Stage', cell: (c) => <StatusBadge e={entry(CASE_STATUS, c.status)} /> },
    { key: 'priority', header: 'Priority', cell: (c) => <PriorityDot p={c.priority} /> },
    { key: 'team', header: 'Team', hideOnMobile: true, cell: (c) => c.assignments.length ? <span className="text-sm" title={c.assignments.map((a) => `${STAFF_ROLE_ON_CASE[a.role]}: ${a.staff.fullName}`).join('\n')}>{c.assignments[0].staff.fullName}{c.assignments.length > 1 ? ` +${c.assignments.length - 1}` : ''}</span> : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">Unassigned</span> },
    { key: 'updated', header: 'Updated', cell: (c) => <span className="text-ink-600">{relTime(c.updatedAt)}</span> },
  ];

  return (
    <>
      <PageHeader title={area === 'doctor' ? 'My patients' : area === 'staff' ? 'My cases' : 'Cases'} subtitle={area === 'admin' ? 'Every treatment case across the platform' : area === 'doctor' ? 'Patients you are linked to, through their case or an appointment' : 'Cases assigned to you'} />
      <Panel pad={false}>
        <FilterBar>
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Case number or patient name" />
          <FilterSelect label="Stage" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={Object.entries(CASE_STATUS).map(([k, v]) => [k, v.label])} className="w-44" />
          <FilterSelect label="Priority" value={priority} onChange={(v) => { setPriority(v); setPage(1); }} options={Object.entries(PRIORITY).map(([k, v]) => [k, v.label])} className="w-36" />
          {staff.data && <FilterSelect label="Assigned to" value={assignedTo} onChange={(v) => { setAssignedTo(v); setUnassigned(false); setPage(1); }} options={staff.data.map((s) => [s.id, s.fullName])} className="w-48" />}
          {area === 'admin' && <label className="flex min-h-10 items-center gap-2 pb-0.5 text-sm"><input type="checkbox" className="size-4 rounded" checked={unassigned} onChange={(e) => { setUnassigned(e.target.checked); setAssignedTo(''); setPage(1); }} />Unassigned only</label>}
          {anyFilter && <Button variant="ghost" className="min-h-10" onClick={() => { setQ(''); setStatus(''); setPriority(''); setAssignedTo(''); setUnassigned(false); setPage(1); router.replace(`/${area}/cases`); }}>Clear</Button>}
        </FilterBar>
        <DataTable rows={list.data?.items} loading={list.isLoading} columns={columns} rowKey={(c) => c.id} caption="Cases" onRowClick={(c) => router.push(`${detailBase}/${c.id}`)}
          empty={<p className="py-8 text-center text-sm text-ink-600">{anyFilter ? 'No cases match these filters.' : 'No cases to show yet.'}</p>} />
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Panel>
    </>
  );
}

export function CasesScreen({ area }: { area: 'admin' | 'staff' | 'doctor' }) {
  return <Suspense><CasesInner area={area} /></Suspense>;
}

export { Link };
