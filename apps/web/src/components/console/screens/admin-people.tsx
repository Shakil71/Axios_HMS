'use client';

import { useMemo, useState } from 'react';
import { Alert, Avatar, Badge, Button, EmptyState, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { AuditRow, RoleRow, UserRow } from '@/lib/console-types';
import { errorText, qstr, useAction, useDebounced, useGet, useList } from '@/lib/hooks';
import { fmtDate, fmtDateTime } from '@/lib/labels';
import { ROLE_LABELS, roleLabel } from '@/lib/roles';
import { USER_STATUS, entry, relTime } from '@/lib/status';
import { usePermissions } from '../providers';
import { Icon } from '../icons';
import { useToast } from '../shell';
import { ConfirmDialog, DataTable, Drawer, FilterBar, FilterSelect, PageHeader, Pager, Panel, SearchBox, Skeleton, StatusBadge, type Column } from '../kit';

const STAFF_ROLES = Object.keys(ROLE_LABELS).filter((r) => r !== 'PATIENT');

// ═══════════════════════════ staff accounts ═══════════════════════════
export function StaffScreen() {
  const { me, can } = usePermissions();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<UserRow | null>(null);
  const [create, setCreate] = useState(false);
  const dq = useDebounced(q);
  const roles = useGet<RoleRow[]>(['roles'], '/admin/roles');
  const list = useList<UserRow>(['users'], `/admin/users${qstr({ page, pageSize: 12, q: dq, role, status, kind: 'staff' })}`);

  const columns: Column<UserRow>[] = [
    { key: 'name', header: 'Team member', primary: true, cell: (u) => <span className="inline-flex items-center gap-2.5"><Avatar name={u.fullName} size={34} /><span><span className="block font-semibold">{u.fullName}{u.id === me.id && <span className="ml-1.5 text-xs font-normal text-ink-500">(you)</span>}</span><span className="block text-xs font-normal text-ink-500">{u.email}</span></span></span> },
    { key: 'roles', header: 'Role', cell: (u) => <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone={r === 'SUPER_ADMIN' ? 'warning' : 'info'}>{roleLabel(r)}</Badge>)}{u.doctor && <Badge>Doctor profile</Badge>}</div> },
    { key: 'status', header: 'Status', cell: (u) => <StatusBadge e={entry(USER_STATUS, u.status)} /> },
    { key: 'login', header: 'Last sign-in', hideOnMobile: true, cell: (u) => u.lastLoginAt ? <span className="text-ink-600">{relTime(u.lastLoginAt)}</span> : <span className="text-ink-400">Never</span> },
    { key: 'added', header: 'Added', hideOnMobile: true, cell: (u) => <span className="text-ink-600">{fmtDate(u.createdAt)}</span> },
  ];
  void toast;
  return (
    <>
      <PageHeader title="Staff" subtitle="Accounts for coordinators, officers, finance, doctors and admins" actions={can('staff.manage') ? <Button onClick={() => setCreate(true)}><Icon name="plus" className="size-4" />Add staff member</Button> : undefined} />
      <Panel pad={false}>
        <FilterBar>
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name or email" />
          <FilterSelect label="Role" value={role} onChange={(v) => { setRole(v); setPage(1); }} options={STAFF_ROLES.concat((roles.data ?? []).filter((r) => !r.isSystem).map((r) => r.name)).map((r) => [r, roleLabel(r)])} className="w-48" />
          <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={Object.entries(USER_STATUS).map(([k, x]) => [k, x.label])} className="w-40" />
        </FilterBar>
        <DataTable rows={list.data?.items} loading={list.isLoading} columns={columns} rowKey={(u) => u.id} caption="Staff accounts" onRowClick={setEdit} empty={<p className="py-8 text-center text-sm text-ink-600">No staff match.</p>} />
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Panel>
      {create && <StaffForm open onClose={() => setCreate(false)} roles={roles.data ?? []} />}
      {edit && <StaffEdit user={edit} onClose={() => setEdit(null)} roles={roles.data ?? []} />}
    </>
  );
}

function RolePicker({ value, onChange, roles, canGrantSuper }: { value: string[]; onChange: (v: string[]) => void; roles: RoleRow[]; canGrantSuper: boolean }) {
  const options = roles.filter((r) => r.name !== 'PATIENT' && (canGrantSuper || r.name !== 'SUPER_ADMIN'));
  return (
    <fieldset><legend className="mb-1.5 text-sm font-medium text-ink-800">Roles</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((r) => (
          <label key={r.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm ${value.includes(r.name) ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:bg-ink-50'}`}>
            <input type="checkbox" className="mt-0.5 size-4" checked={value.includes(r.name)} onChange={(e) => onChange(e.target.checked ? [...value, r.name] : value.filter((x) => x !== r.name))} />
            <span><span className="block font-medium">{roleLabel(r.name)}</span><span className="block text-xs text-ink-500">{r.description ?? `${r.permissions.length} permissions`}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function StaffForm({ open, onClose, roles }: { open: boolean; onClose: () => void; roles: RoleRow[] }) {
  const { me } = usePermissions();
  const toast = useToast();
  const [f, setF] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [sel, setSel] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const create = useAction(() => api('/admin/users', { method: 'POST', body: { fullName: f.fullName, email: f.email, phone: f.phone || undefined, password: f.password, roles: sel } }), {
    invalidate: [['users'], ['roles']], onSuccess: () => { toast('Staff account created. Share the temporary password securely.'); onClose(); }, onError: (e) => setError(errorText(e)),
  });
  const gen = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint32Array(14)); setF({ ...f, password: Array.from(r, (x) => a[x % a.length]).join('') + '!7' }); };
  return (
    <Drawer open={open} onClose={onClose} title="Add a staff member" wide footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={create.isPending || !f.fullName || !f.email || f.password.length < 10 || !sel.length} onClick={() => { setError(null); create.mutate(undefined); }}>{create.isPending ? 'Creating…' : 'Create account'}</Button></>}>
      <div className="space-y-4">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="sf-name" required><Input id="sf-name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
          <Field label="Email" htmlFor="sf-email" required><Input id="sf-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Mobile (optional)" htmlFor="sf-phone" hint="With country code"><Input id="sf-phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Temporary password" htmlFor="sf-pw" required hint="At least 10 characters. Ask them to change it after signing in."><div className="flex gap-2"><Input id="sf-pw" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="off" /><Button variant="secondary" onClick={gen}>Generate</Button></div></Field>
        </div>
        <RolePicker value={sel} onChange={setSel} roles={roles} canGrantSuper={me.roles.includes('SUPER_ADMIN')} />
      </div>
    </Drawer>
  );
}

function StaffEdit({ user, onClose, roles }: { user: UserRow; onClose: () => void; roles: RoleRow[] }) {
  const { me } = usePermissions();
  const toast = useToast();
  const [name, setName] = useState(user.fullName);
  const [status, setStatus] = useState(user.status);
  const [sel, setSel] = useState(user.roles);
  const [pw, setPw] = useState('');
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const isSelf = user.id === me.id;
  const isSuper = user.roles.includes('SUPER_ADMIN');
  const locked = isSuper && !me.roles.includes('SUPER_ADMIN');
  const dirty = name !== user.fullName || status !== user.status || sel.slice().sort().join() !== user.roles.slice().sort().join();
  const save = useAction(() => api(`/admin/users/${user.id}`, { method: 'PATCH', body: { fullName: name, status, roles: sel } }), { invalidate: [['users'], ['roles']], onSuccess: () => { toast('Account updated.'); onClose(); }, onError: (e) => toast(errorText(e), 'danger') });
  const reset = useAction(() => api(`/admin/users/${user.id}/reset-password`, { method: 'POST', body: { password: pw } }), { onSuccess: () => { toast('Password reset. All their sessions were signed out.'); setPw(''); }, onError: (e) => toast(errorText(e), 'danger') });
  return (
    <>
      <Drawer open onClose={onClose} title={user.fullName} wide footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button disabled={!dirty || save.isPending || locked || isSelf} onClick={() => (status !== 'ACTIVE' && user.status === 'ACTIVE' ? setConfirmSuspend(true) : save.mutate(undefined))}>Save changes</Button></>}>
        <div className="min-w-0 space-y-5">
          {(isSelf || locked) && <Alert tone="info">{isSelf ? 'You cannot change your own roles or status.' : 'Only a super admin can change a super admin.'}</Alert>}
          <dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-ink-500">Email</dt><dd className="break-all">{user.email}</dd></div><div><dt className="text-xs text-ink-500">Last sign-in</dt><dd>{user.lastLoginAt ? fmtDateTime(user.lastLoginAt) : 'Never'}</dd></div><div><dt className="text-xs text-ink-500">Created</dt><dd>{fmtDate(user.createdAt)}</dd></div></dl>
          <Field label="Full name" htmlFor="se-name"><Input id="se-name" disabled={locked} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Status" htmlFor="se-status" hint="Suspending signs the person out everywhere immediately."><Select id="se-status" disabled={locked || isSelf} value={status} onChange={(e) => setStatus(e.target.value)}>{['ACTIVE', 'SUSPENDED', 'DISABLED'].map((s) => <option key={s} value={s}>{USER_STATUS[s].label}</option>)}</Select></Field>
          {!locked && !isSelf && <RolePicker value={sel} onChange={setSel} roles={roles} canGrantSuper={me.roles.includes('SUPER_ADMIN')} />}
          {!locked && (
            <div className="rounded-lg border border-ink-200 p-4"><h3 className="mb-2 text-sm font-semibold">Reset password</h3>
              <div className="flex gap-2"><Input aria-label="New temporary password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New temporary password" autoComplete="off" /><Button variant="secondary" disabled={pw.length < 10 || reset.isPending} onClick={() => reset.mutate(undefined)}>Reset</Button></div>
              <p className="mt-1.5 text-xs text-ink-500">At least 10 characters. Their current sessions end immediately.</p></div>
          )}
        </div>
      </Drawer>
      <ConfirmDialog open={confirmSuspend} title="Suspend this account?" danger confirmLabel="Suspend and sign out" busy={save.isPending} onCancel={() => setConfirmSuspend(false)} onConfirm={() => save.mutate(undefined, { onSuccess: () => setConfirmSuspend(false) })}>{user.fullName} will be signed out everywhere and will not be able to sign in until you reactivate the account.</ConfirmDialog>
    </>
  );
}

// ═══════════════════════════ roles & access ═══════════════════════════
const MODULE_LABEL: Record<string, string> = { patients: 'Patients', cases: 'Cases', documents: 'Documents', identity: 'Identity numbers', visa: 'Visa', travel: 'Travel', appointments: 'Appointments', payments: 'Payments', directory: 'Directory', cms: 'Website content', messages: 'Messages', staff: 'Staff', roles: 'Roles', reports: 'Reports', audit: 'Audit log', settings: 'Settings' };
const SENS = ['identity', 'medical', 'travel', 'financial', 'general'];
const ACTS = ['view', 'download', 'upload', 'verify', 'delete'];

function humanPerm(k: string) {
  const [, ...rest] = k.split('.');
  const t = rest.join(' ').replace('.all', ' (all records)').replace(/\./g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function RolesScreen() {
  const { can } = usePermissions();
  const toast = useToast();
  const roles = useGet<RoleRow[]>(['roles'], '/admin/roles');
  const catalog = useGet<{ module: string; permissions: string[] }[]>(['perm-catalog'], '/admin/permissions');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [create, setCreate] = useState(false);
  const [del, setDel] = useState(false);
  const role = roles.data?.find((r) => r.id === (selected ?? roles.data?.[0]?.id));
  const canManage = can('roles.manage');
  const locked = !role || role.name === 'SUPER_ADMIN' || role.name === 'PATIENT' || !canManage;
  const cur = draft ?? new Set(role?.permissions ?? []);
  const dirty = draft !== null && [...draft].sort().join() !== (role?.permissions ?? []).join();

  const save = useAction(() => api(`/admin/roles/${role!.id}/permissions`, { method: 'PUT', body: { permissions: [...cur] } }), { invalidate: [['roles']], onSuccess: () => { toast('Permissions saved. They apply on the very next request.'); setDraft(null); }, onError: (e) => toast(errorText(e), 'danger') });
  const remove = useAction(() => api(`/admin/roles/${role!.id}`, { method: 'DELETE' }), { invalidate: [['roles']], onSuccess: () => { toast('Role deleted.'); setSelected(null); setDel(false); }, onError: (e) => { toast(errorText(e), 'danger'); setDel(false); } });
  const toggle = (k: string) => { const n = new Set(cur); n.has(k) ? n.delete(k) : n.add(k); setDraft(n); };

  const documentsGrid = catalog.data?.find((m) => m.module === 'documents');
  const other = catalog.data?.filter((m) => m.module !== 'documents') ?? [];

  return (
    <>
      <PageHeader title="Roles & access" subtitle="Decide exactly what each role can do. Changes apply immediately." actions={canManage ? <Button onClick={() => setCreate(true)}><Icon name="plus" className="size-4" />New role</Button> : undefined} />
      {!canManage && <div className="mb-4"><Alert tone="info">You can review roles. Only a super admin can change them.</Alert></div>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Panel pad={false} className="h-fit">
          {roles.isLoading ? <div className="p-3"><Skeleton className="h-40" /></div> : (
            <ul className="divide-y divide-ink-100" aria-label="Roles">{roles.data?.map((r) => (
              <li key={r.id}><button onClick={() => { setSelected(r.id); setDraft(null); }} aria-current={role?.id === r.id} className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm ${role?.id === r.id ? 'bg-brand-50 font-semibold text-brand-900' : 'hover:bg-ink-50'}`}><span className="min-w-0 flex-1 truncate">{roleLabel(r.name)}</span><span className="text-xs text-ink-500">{r.userCount} {r.userCount === 1 ? 'user' : 'users'}</span></button></li>
            ))}</ul>
          )}
        </Panel>

        {role && (
          <div className="min-w-0 space-y-5">
            <Panel title={roleLabel(role.name)} action={<div className="flex items-center gap-2">{role.isSystem ? <Badge>Built-in</Badge> : <Badge tone="info">Custom</Badge>}{!role.isSystem && canManage && <Button variant="ghost" className="min-h-9 px-2.5 py-1 text-red-700" onClick={() => setDel(true)}>Delete</Button>}</div>}>
              <p className="text-sm text-ink-700">{role.description ?? 'Custom role.'}</p>
              {role.name === 'SUPER_ADMIN' && <p className="mt-2 text-sm text-ink-600">The super admin always has every permission, so it cannot be edited.</p>}
              {role.name === 'PATIENT' && <p className="mt-2 text-sm text-ink-600">Patients have no staff permissions. They can only ever open their own records.</p>}
              <p className="mt-2 text-sm text-ink-600"><strong>{cur.size}</strong> of {catalog.data?.reduce((s, m) => s + m.permissions.length, 0) ?? '…'} permissions enabled.</p>
            </Panel>

            {documentsGrid && (
              <Panel title="Documents by type" pad={false}>
                <p className="border-b border-ink-100 px-4 py-2.5 text-sm text-ink-600 sm:px-5">Sensitive documents are separated by type, so Finance can be given invoices without ever seeing medical reports.</p>
                <div className="overflow-x-auto"><table className="w-full min-w-[34rem] text-sm"><thead><tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-500"><th className="px-4 py-2 font-semibold sm:px-5">Document type</th>{ACTS.map((a) => <th key={a} className="px-2 py-2 text-center font-semibold">{a}</th>)}</tr></thead>
                  <tbody className="divide-y divide-ink-100">{SENS.map((s) => (
                    <tr key={s}><th scope="row" className="px-4 py-2.5 text-left font-medium capitalize sm:px-5">{s}{s === 'identity' && <span className="ml-1 text-xs font-normal text-ink-500">(NID, passport)</span>}{s === 'medical' && <span className="ml-1 text-xs font-normal text-ink-500">(reports, scans)</span>}</th>
                      {ACTS.map((a) => { const k = `documents.${a}.${s}`; return <td key={a} className="px-2 py-2.5 text-center"><input type="checkbox" className="size-4" aria-label={`${a} ${s} documents`} checked={cur.has(k)} disabled={locked} onChange={() => toggle(k)} /></td>; })}</tr>
                  ))}</tbody></table></div>
                <div className="border-t border-ink-100 px-4 py-3 sm:px-5"><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4" checked={cur.has('documents.scope.all')} disabled={locked} onChange={() => toggle('documents.scope.all')} /><span><strong>Can open documents of every case</strong> <span className="text-ink-600">— otherwise only cases the person is assigned to.</span></span></label></div>
              </Panel>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              {other.map((m) => (
                <Panel key={m.module} title={MODULE_LABEL[m.module] ?? m.module}>
                  <ul className="space-y-2">{m.permissions.map((k) => (
                    <li key={k}><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4" checked={cur.has(k)} disabled={locked} onChange={() => toggle(k)} /><span><span className="block">{humanPerm(k)}</span><span className="block font-mono text-[11px] text-ink-400">{k}</span></span></label></li>
                  ))}</ul>
                </Panel>
              ))}
            </div>

            {dirty && (
              <div className="sticky bottom-20 z-20 flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-white p-3 shadow-pop lg:bottom-4">
                <p className="text-sm">You have unsaved changes to <strong>{roleLabel(role.name)}</strong>.</p>
                <div className="flex gap-2"><Button variant="secondary" onClick={() => setDraft(null)}>Discard</Button><Button disabled={save.isPending} onClick={() => save.mutate(undefined)}>{save.isPending ? 'Saving…' : 'Save permissions'}</Button></div>
              </div>
            )}
          </div>
        )}
      </div>
      {create && <RoleForm onClose={() => setCreate(false)} />}
      <ConfirmDialog open={del} title="Delete this role?" danger confirmLabel="Delete role" busy={remove.isPending} onCancel={() => setDel(false)} onConfirm={() => remove.mutate(undefined)}>Roles that are still assigned to people cannot be deleted.</ConfirmDialog>
    </>
  );
}

function RoleForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useAction(() => api('/admin/roles', { method: 'POST', body: { name, description: description || undefined, permissions: [] } }), { invalidate: [['roles']], onSuccess: () => { toast('Role created. Now choose its permissions.'); onClose(); }, onError: (e) => setError(errorText(e)) });
  return (
    <Drawer open onClose={onClose} title="New role" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={create.isPending || name.trim().length < 3} onClick={() => { setError(null); create.mutate(undefined); }}>Create role</Button></>}>
      <div className="space-y-4">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
        <Field label="Role name" htmlFor="rn-name" required hint="Capital letters, numbers and underscores, e.g. REPORT_VIEWER"><Input id="rn-name" value={name} onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} /></Field>
        <Field label="What is this role for?" htmlFor="rn-desc"><Textarea id="rn-desc" className="min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <p className="text-sm text-ink-600">The role starts with no permissions. You choose them next.</p>
      </div>
    </Drawer>
  );
}

// ═══════════════════════════ audit log ═══════════════════════════
const RESOURCES = ['User', 'MedicalCase', 'Document', 'PatientProfile', 'Appointment', 'VisaCase', 'Invoice', 'TravelPlan', 'Role', 'SystemSetting', 'Doctor', 'Hospital', 'Country', 'Treatment'];

export function AuditScreen() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AuditRow | null>(null);
  const dq = useDebounced(q);
  const list = useList<AuditRow>(['audit'], `/admin/audit-logs${qstr({ page, pageSize: 15, q: dq, action, resourceType, from: from ? new Date(from).toISOString() : '', to: to ? new Date(to + 'T23:59:59').toISOString() : '' })}`);
  const columns: Column<AuditRow>[] = [
    { key: 'when', header: 'When', primary: true, cell: (a) => <div><p className="font-medium">{fmtDateTime(a.createdAt)}</p><p className="text-xs font-normal text-ink-500">{relTime(a.createdAt)}</p></div> },
    { key: 'who', header: 'Who', cell: (a) => a.actor ? <div><p>{a.actor.fullName}</p><p className="text-xs text-ink-500">{a.actorRole ? roleLabel(a.actorRole) : ''}</p></div> : <span className="text-ink-400">System / unknown</span> },
    { key: 'action', header: 'Action', cell: (a) => <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">{a.action}</code> },
    { key: 'res', header: 'Record', hideOnMobile: true, cell: (a) => <span className="text-ink-700">{a.resourceType}{a.resourceId ? <span className="ml-1 font-mono text-xs text-ink-400">{a.resourceId.slice(0, 8)}</span> : null}</span> },
    { key: 'ip', header: 'IP address', hideOnMobile: true, cell: (a) => <span className="font-mono text-xs text-ink-600">{a.ip ?? '—'}</span> },
  ];
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every sensitive action, who did it and from where. Entries cannot be edited or deleted." />
      <Panel pad={false}>
        <FilterBar>
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Person, action or record id" />
          <FilterSelect label="Action" value={action} onChange={(v) => { setAction(v); setPage(1); }} options={['auth', 'case', 'document', 'patient', 'appointment', 'visa', 'payment', 'travel', 'rbac', 'staff', 'directory', 'settings'].map((x) => [x, x])} className="w-40" />
          <FilterSelect label="Record type" value={resourceType} onChange={(v) => { setResourceType(v); setPage(1); }} options={RESOURCES.map((x) => [x, x])} className="w-44" />
          <Field label="From" htmlFor="au-from"><Input id="au-from" type="date" className="min-h-10 py-1.5 text-sm" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
          <Field label="To" htmlFor="au-to"><Input id="au-to" type="date" className="min-h-10 py-1.5 text-sm" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
        </FilterBar>
        <DataTable rows={list.data?.items} loading={list.isLoading} columns={columns} rowKey={(a) => a.id} caption="Audit log" onRowClick={setOpen} empty={<p className="py-8 text-center text-sm text-ink-600">No entries match.</p>} />
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Panel>
      <Drawer open={!!open} onClose={() => setOpen(null)} title="Audit entry" wide>
        {open && (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-ink-500">When</dt><dd>{fmtDateTime(open.createdAt)}</dd></div><div><dt className="text-xs text-ink-500">Action</dt><dd><code>{open.action}</code></dd></div><div><dt className="text-xs text-ink-500">Who</dt><dd>{open.actor ? `${open.actor.fullName} (${open.actor.email})` : 'Unknown'}</dd></div><div><dt className="text-xs text-ink-500">Role</dt><dd>{open.actorRole ? roleLabel(open.actorRole) : '—'}</dd></div><div><dt className="text-xs text-ink-500">Record</dt><dd className="break-all">{open.resourceType} {open.resourceId}</dd></div><div><dt className="text-xs text-ink-500">IP address</dt><dd className="font-mono">{open.ip ?? '—'}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-ink-500">Device</dt><dd className="break-all text-ink-700">{open.userAgent ?? '—'}</dd></div></dl>
            {(['before', 'after', 'metadata'] as const).map((k) => open[k] != null && <div key={k}><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">{k === 'metadata' ? 'Details' : k}</h3><pre className="max-h-56 overflow-auto rounded-lg bg-ink-900 p-3 text-xs text-ink-100">{JSON.stringify(open[k], null, 2)}</pre></div>)}
            <p className="text-xs text-ink-500">Passwords, tokens and identity numbers are removed before an entry is written.</p>
          </div>
        )}
      </Drawer>
    </>
  );
}

// ═══════════════════════════ settings ═══════════════════════════
interface Setting { id: string; key: string; value: string; isPublic: boolean; description: string | null; updatedAt: string }

export function SettingsScreen() {
  const toast = useToast();
  const list = useGet<Setting[]>(['settings'], '/admin/settings');
  const [edit, setEdit] = useState<Partial<Setting> | null>(null);
  const save = useAction((s: { key: string; value: string; isPublic: boolean; description: string | null }) => api('/admin/settings', { method: 'PUT', body: s }), { invalidate: [['settings']], onSuccess: () => { toast('Setting saved.'); setEdit(null); }, onError: (e) => toast(errorText(e), 'danger') });
  const groups = useMemo(() => { const m = new Map<string, Setting[]>(); for (const s of list.data ?? []) { const g = s.key.split('.')[0]; m.set(g, [...(m.get(g) ?? []), s]); } return [...m]; }, [list.data]);
  return (
    <>
      <PageHeader title="Settings" subtitle="Contact details, limits and behaviour. Settings marked public appear on the website." actions={<Button onClick={() => setEdit({ key: '', value: '', isPublic: false })}><Icon name="plus" className="size-4" />Add setting</Button>} />
      {list.isLoading ? <Skeleton className="h-48" /> : !groups.length ? <EmptyState title="No settings yet" /> : (
        <div className="space-y-5">{groups.map(([g, items]) => (
          <Panel key={g} title={g} pad={false}>
            <ul className="divide-y divide-ink-100">{items.map((s) => (
              <li key={s.id}><button onClick={() => setEdit(s)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-ink-50 sm:px-5"><div className="min-w-0 flex-1"><p className="font-mono text-sm font-semibold">{s.key}</p>{s.description && <p className="text-xs text-ink-500">{s.description}</p>}</div><p className="max-w-xs truncate text-sm text-ink-700">{s.value}</p>{s.isPublic ? <Badge tone="info">Public</Badge> : <Badge>Private</Badge>}</button></li>
            ))}</ul>
          </Panel>
        ))}</div>
      )}
      {edit && <SettingForm initial={edit} busy={save.isPending} onClose={() => setEdit(null)} onSave={(v) => save.mutate(v)} />}
    </>
  );
}

function SettingForm({ initial, onClose, onSave, busy }: { initial: Partial<Setting>; onClose: () => void; onSave: (v: { key: string; value: string; isPublic: boolean; description: string | null }) => void; busy: boolean }) {
  const isNew = !initial.id;
  const [key, setKey] = useState(initial.key ?? '');
  const [value, setValue] = useState(initial.value ?? '');
  const [isPublic, setPublic] = useState(!!initial.isPublic);
  const [description, setDescription] = useState(initial.description ?? '');
  return (
    <Drawer open onClose={onClose} title={isNew ? 'Add setting' : 'Edit setting'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy || !key || !value} onClick={() => onSave({ key, value, isPublic, description: description || null })}>{busy ? 'Saving…' : 'Save'}</Button></>}>
      <div className="space-y-4">
        <Field label="Key" htmlFor="sk-key" required hint="Lowercase, dots and dashes, e.g. contact.phone"><Input id="sk-key" disabled={!isNew} value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} /></Field>
        <Field label="Value" htmlFor="sk-val" required><Textarea id="sk-val" className="min-h-24" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <Field label="Description" htmlFor="sk-desc"><Input id="sk-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} /><span><strong>Show on the public website</strong> <span className="text-ink-600">— never turn this on for private values.</span></span></label>
      </div>
    </Drawer>
  );
}
