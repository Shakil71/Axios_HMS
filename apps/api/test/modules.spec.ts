import request from 'supertest';
import { API, TestApp, bearer, createApp, login, makeUser, resetDb, tokenFor, uploadDoc } from './helpers';

/** Authorization and workflow rules of the Phase 2 modules: appointments, visa, travel, payments, notifications, admin, workspace. */
describe('operations modules', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  afterAll(() => t.app.close());

  const call = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, tok?: string, body?: object) => {
    const r = (request(t.http()) as any)[method](API + path);
    return (tok ? r.set(bearer(tok)) : r).send(body);
  };

  let s: Awaited<ReturnType<typeof world>>;
  async function world() {
    const p = t.prisma;
    const users = {
      patientA: await makeUser(p, 'PATIENT'), patientB: await makeUser(p, 'PATIENT'), admin: await makeUser(p, 'ADMIN'), superadmin: await makeUser(p, 'SUPER_ADMIN'),
      mc1: await makeUser(p, 'MEDICAL_COORDINATOR'), mc2: await makeUser(p, 'MEDICAL_COORDINATOR'), cm: await makeUser(p, 'CASE_MANAGER'), visa: await makeUser(p, 'VISA_OFFICER'),
      travel: await makeUser(p, 'TRAVEL_COORDINATOR'), finance: await makeUser(p, 'FINANCE'), doctor: await makeUser(p, 'DOCTOR'), doctor2: await makeUser(p, 'DOCTOR'),
    };
    const tk = {} as Record<keyof typeof users, string>;
    for (const [k, u] of Object.entries(users)) tk[k as keyof typeof users] = await tokenFor(t.http, u.email);

    const country = await p.country.create({ data: { slug: 'land', name: 'Land', isoCode: 'LD', status: 'PUBLISHED', visaRequirements: { create: [{ name: 'Passport', sortOrder: 0 }, { name: 'Invitation letter', sortOrder: 1 }] } } });
    const hospital = await p.hospital.create({ data: { slug: 'h', name: 'Hospital', countryId: country.id, status: 'PUBLISHED' } });
    const d1 = await p.doctor.create({ data: { slug: 'd1', fullName: 'Doc One', userId: users.doctor.id, isVerified: true, status: 'PUBLISHED' } });
    const d2 = await p.doctor.create({ data: { slug: 'd2', fullName: 'Doc Two', userId: users.doctor2.id, isVerified: true, status: 'PUBLISHED' } });
    await p.doctorHospital.createMany({ data: [{ doctorId: d1.id, hospitalId: hospital.id }, { doctorId: d2.id, hospitalId: hospital.id }] });

    const caseA = (await call('post', '/cases', tk.patientA, { symptoms: 'Chest pain' })).body.data.id as string;
    const caseB = (await call('post', '/cases', tk.patientB, { symptoms: 'Knee pain' })).body.data.id as string;
    for (const [who, role] of [['mc1', 'MEDICAL_COORDINATOR'], ['cm', 'CASE_MANAGER'], ['visa', 'VISA_OFFICER'], ['travel', 'TRAVEL_COORDINATOR'], ['finance', 'FINANCE']] as const) {
      const r = await call('post', `/cases/${caseA}/assignments`, tk.admin, { staffId: users[who].id, role });
      if (r.status !== 201) throw new Error(`assign ${who}: ${JSON.stringify(r.body)}`);
    }
    return { users, tk, country, hospital, d1, d2, caseA, caseB };
  }

  beforeEach(async () => {
    await resetDb(t.prisma);
    s = await world();
  });

  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

  describe('appointments', () => {
    const create = (tok: string, over: object = {}) => call('post', '/appointments', tok, { caseId: s.caseA, doctorId: s.d1.id, hospitalId: s.hospital.id, scheduledAt: inDays(3), type: 'ONLINE_CONSULTATION', method: 'VIDEO', ...over });

    it('assigned staff schedule, the patient sees it, other patients and unassigned staff do not', async () => {
      const a = await create(s.tk.mc1);
      expect(a.status).toBe(201);
      expect(a.body.data).toMatchObject({ status: 'CONFIRMED', doctor: { fullName: 'Doc One' } });
      expect(a.body.data.internalNotes).toBeNull();

      expect((await call('get', '/appointments', s.tk.patientA)).body.meta.total).toBe(1);
      expect((await call('get', `/appointments/${a.body.data.id}`, s.tk.patientB)).status).toBe(404);
      expect((await call('get', '/appointments', s.tk.patientB)).body.meta.total).toBe(0);
      expect((await create(s.tk.mc2)).status).toBe(404); // not assigned to the case
      expect((await call('get', `/appointments/${a.body.data.id}`, s.tk.mc2)).status).toBe(404);
      expect((await create(s.tk.finance)).status).toBe(403); // finance cannot schedule
      expect((await create(s.tk.patientA)).status).toBe(403);

      const patientView = await call('get', `/appointments/${a.body.data.id}`, s.tk.patientA);
      expect(patientView.body.data.internalNotes).toBeUndefined(); // internal notes never reach patients
      const notes = await call('get', '/notifications', s.tk.patientA);
      expect(notes.body.data.map((n: { type: string }) => n.type)).toContain('APPOINTMENT_CONFIRMED');
    });

    it('a patient can request and cancel their own appointment but nothing else', async () => {
      const req = await call('post', '/appointments/request', s.tk.patientA, { caseId: s.caseA, type: 'SECOND_OPINION', preferredAt: inDays(5) });
      expect(req.status).toBe(201);
      expect(req.body.data.status).toBe('REQUESTED');
      expect((await call('post', '/appointments/request', s.tk.patientA, { caseId: s.caseA, type: 'SECOND_OPINION', preferredAt: inDays(-1) })).status).toBe(422);
      expect((await call('post', '/appointments/request', s.tk.patientB, { caseId: s.caseA, type: 'SECOND_OPINION', preferredAt: inDays(5) })).status).toBe(404);
      expect((await call('post', `/appointments/${req.body.data.id}/status`, s.tk.patientA, { status: 'CONFIRMED' })).status).toBe(403);
      expect((await call('post', `/appointments/${req.body.data.id}/status`, s.tk.patientB, { status: 'CANCELLED' })).status).toBe(404);
      const cancelled = await call('post', `/appointments/${req.body.data.id}/status`, s.tk.patientA, { status: 'CANCELLED' });
      expect(cancelled.status).toBe(200);
      expect((await call('post', `/appointments/${req.body.data.id}/status`, s.tk.patientA, { status: 'CANCELLED' })).status).toBe(409);
      const team = await call('get', '/notifications', s.tk.mc1);
      expect(team.body.data.some((n: { title: string }) => n.title === 'New appointment request')).toBe(true);
    });

    it('staff status workflow: reschedule needs a time, closed appointments are frozen', async () => {
      const id = (await create(s.tk.mc1)).body.data.id;
      expect((await call('post', `/appointments/${id}/status`, s.tk.mc1, { status: 'RESCHEDULED' })).status).toBe(422);
      expect((await call('post', `/appointments/${id}/status`, s.tk.mc1, { status: 'RESCHEDULED', scheduledAt: inDays(6) })).status).toBe(200);
      expect((await call('post', `/appointments/${id}/status`, s.tk.mc1, { status: 'COMPLETED' })).status).toBe(200);
      expect((await call('post', `/appointments/${id}/status`, s.tk.mc1, { status: 'CANCELLED' })).status).toBe(409);
      expect((await call('patch', `/appointments/${id}`, s.tk.mc1, { notes: 'x' })).status).toBe(409);
    });

    it('doctors only see their own appointments', async () => {
      await create(s.tk.mc1, { doctorId: s.d1.id });
      await create(s.tk.mc1, { doctorId: s.d2.id, scheduledAt: inDays(4) });
      const mine = await call('get', '/appointments', s.tk.doctor);
      expect(mine.body.meta.total).toBe(1);
      expect(mine.body.data[0].doctor.fullName).toBe('Doc One');
      const otherId = (await call('get', '/appointments', s.tk.doctor2)).body.data[0].id;
      expect((await call('get', `/appointments/${otherId}`, s.tk.doctor)).status).toBe(404);
      expect((await call('post', `/appointments/${mine.body.data[0].id}/status`, s.tk.doctor, { status: 'COMPLETED' })).status).toBe(200);
      expect((await call('post', `/appointments/${otherId}/status`, s.tk.doctor, { status: 'COMPLETED' })).status).toBe(404);
    });
  });

  describe('visa', () => {
    it('only visa staff open and decide visa cases; patients see their own without internal remarks', async () => {
      expect((await call('post', '/visa', s.tk.finance, { caseId: s.caseA, countryId: s.country.id })).status).toBe(403);
      expect((await call('post', '/visa', s.tk.cm, { caseId: s.caseA, countryId: s.country.id })).status).toBe(403); // view only
      const v = await call('post', '/visa', s.tk.visa, { caseId: s.caseA, countryId: s.country.id });
      expect(v.status).toBe(201);
      expect(v.body.data.checklist.map((c: { name: string }) => c.name)).toEqual(['Passport', 'Invitation letter']);
      expect(v.body.data.missingCount).toBe(2);
      expect((await call('post', '/visa', s.tk.visa, { caseId: s.caseA, countryId: s.country.id })).status).toBe(409); // duplicate
      expect((await call('post', '/visa', s.tk.visa, { caseId: s.caseB, countryId: s.country.id })).status).toBe(404); // not assigned

      const id = v.body.data.id;
      await call('patch', `/visa/${id}`, s.tk.visa, { internalRemarks: 'Check the invitation letter date', patientRemarks: 'We received your passport.', status: 'SUBMITTED' });
      const mine = await call('get', `/visa/${id}`, s.tk.patientA);
      expect(mine.status).toBe(200);
      expect(mine.body.data.internalRemarks).toBeUndefined();
      expect(mine.body.data.officer).toBeUndefined();
      expect(mine.body.data).toMatchObject({ status: 'SUBMITTED', patientRemarks: 'We received your passport.' });
      expect(mine.body.data.disclaimer).toMatch(/cannot guarantee/);
      expect((await call('get', `/visa/${id}`, s.tk.patientB)).status).toBe(404);
      expect((await call('patch', `/visa/${id}`, s.tk.patientA, { status: 'APPROVED' })).status).toBe(403);
      expect((await call('patch', `/visa/${id}`, s.tk.visa, { status: 'APPROVED' })).status).toBe(200);
      expect((await call('get', '/notifications', s.tk.patientA)).body.data.some((n: { type: string }) => n.type === 'VISA_STATUS_CHANGED')).toBe(true);
    });

    it('patients attach only their own documents to the checklist', async () => {
      const id = (await call('post', '/visa', s.tk.visa, { caseId: s.caseA, countryId: s.country.id })).body.data.id;
      const item = (await call('get', `/visa/${id}`, s.tk.patientA)).body.data.checklist[0].id;
      const mine = await uploadDoc(t, s.tk.patientA, { category: 'PASSPORT', caseId: s.caseA });
      const theirs = await uploadDoc(t, s.tk.patientB, { category: 'PASSPORT', caseId: s.caseB });
      expect((await call('post', `/visa/${id}/checklist/${item}/attach`, s.tk.patientA, { documentId: theirs.documentId })).status).toBe(422);
      const ok = await call('post', `/visa/${id}/checklist/${item}/attach`, s.tk.patientA, { documentId: mine.documentId });
      expect(ok.status).toBe(200);
      expect(ok.body.data.checklist[0]).toMatchObject({ status: 'SUBMITTED', documentId: mine.documentId });
      expect((await call('post', `/visa/${id}/checklist/${item}/attach`, s.tk.patientB, { documentId: theirs.documentId })).status).toBe(404);
    });
  });

  describe('travel', () => {
    const plan = { travelerCount: 2, localCoordinatorName: 'Local Guide', flights: [{ direction: 'OUTBOUND', departureAirport: 'DAC', arrivalAirport: 'MAA', departureAt: inDays(10) }], hotels: [{ name: 'Hotel', checkInDate: inDays(10), checkOutDate: inDays(20) }], transports: [{ type: 'AIRPORT_PICKUP', scheduledAt: inDays(10) }] };

    it('travel staff edit, the patient reads, everyone else is refused', async () => {
      expect((await call('put', `/travel/case/${s.caseA}`, s.tk.mc1, plan)).status).toBe(403); // no travel.edit
      expect((await call('put', `/travel/case/${s.caseA}`, s.tk.patientA, plan)).status).toBe(403);
      expect((await call('put', `/travel/case/${s.caseB}`, s.tk.travel, plan)).status).toBe(404);
      const saved = await call('put', `/travel/case/${s.caseA}`, s.tk.travel, plan);
      expect(saved.status).toBe(200);
      expect(saved.body.data).toMatchObject({ travelerCount: 2, flights: [{ departureAirport: 'DAC' }], hotels: [{ name: 'Hotel' }] });
      expect((await call('get', `/travel/case/${s.caseA}`, s.tk.patientA)).body.data.transports).toHaveLength(1);
      expect((await call('get', `/travel/case/${s.caseA}`, s.tk.patientB)).status).toBe(404);
      expect((await call('get', `/travel/case/${s.caseA}`, s.tk.mc1)).status).toBe(403);
      const badDates = await call('put', `/travel/case/${s.caseA}`, s.tk.travel, { ...plan, hotels: [{ name: 'H', checkInDate: inDays(10), checkOutDate: inDays(5) }] });
      expect(badDates.status).toBe(422);
      const replaced = await call('put', `/travel/case/${s.caseA}`, s.tk.travel, { ...plan, flights: [] });
      expect(replaced.body.data.flights).toHaveLength(0);
    });
  });

  describe('payments', () => {
    const invoice = (tok: string, over: object = {}) => call('post', '/invoices', tok, { caseId: s.caseA, currency: 'USD', items: [{ description: 'Deposit', quantity: 2, unitPrice: 500 }, { description: 'Fee', quantity: 1, unitPrice: 200 }], discount: 100, tax: 50, ...over });

    it('the server computes totals; only finance/admin create; patients see only their own', async () => {
      expect((await invoice(s.tk.mc1)).status).toBe(403);
      expect((await invoice(s.tk.patientA)).status).toBe(403);
      expect((await invoice(s.tk.finance, { total: 1 })).status).toBe(422); // clients cannot send totals
      expect((await invoice(s.tk.finance, { discount: 5000 })).status).toBe(422);
      const inv = await invoice(s.tk.finance);
      expect(inv.status).toBe(201);
      expect(inv.body.data).toMatchObject({ subtotal: 1200, total: 1150, status: 'PENDING', balance: 1150 });
      expect(inv.body.data.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
      expect((await call('get', '/invoices', s.tk.patientA)).body.meta.total).toBe(1);
      expect((await call('get', '/invoices', s.tk.patientB)).body.meta.total).toBe(0);
      expect((await call('get', `/invoices/${inv.body.data.id}`, s.tk.patientB)).status).toBe(404);
      expect((await call('get', '/invoices', s.tk.mc1)).status).toBe(403);
      expect((await call('get', '/invoices', s.tk.finance)).body.data[0].patient.fullName).toBeTruthy();
    });

    it('payments settle the invoice; overpaying and closed invoices are refused; refunds need payments.refund', async () => {
      const id = (await invoice(s.tk.finance)).body.data.id;
      expect((await call('post', `/invoices/${id}/payments`, s.tk.finance, { amount: 2000, method: 'CASH' })).status).toBe(422);
      const part = await call('post', `/invoices/${id}/payments`, s.tk.finance, { amount: 400, method: 'BANK_TRANSFER', transactionId: 'T1' });
      expect(part.body.data).toMatchObject({ status: 'PARTIAL', paid: 400, balance: 750 });
      expect(part.body.data.payments[0].receiptNumber).toMatch(/^RCT-/);
      const full = await call('post', `/invoices/${id}/payments`, s.tk.finance, { amount: 750, method: 'CARD' });
      expect(full.body.data).toMatchObject({ status: 'PAID', balance: 0 });
      expect((await call('post', `/invoices/${id}/payments`, s.tk.finance, { amount: 1, method: 'CASH' })).status).toBe(409);
      expect((await call('post', `/invoices/${id}/cancel`, s.tk.finance)).status).toBe(409); // has payments

      const paymentId = full.body.data.payments[1].id;
      expect((await call('post', `/payments/${paymentId}/refund`, s.tk.admin, { reason: 'Duplicate charge' })).status).toBe(403); // admin lacks payments.refund
      const refunded = await call('post', `/payments/${paymentId}/refund`, s.tk.finance, { reason: 'Duplicate charge' });
      expect(refunded.status).toBe(200);
      expect(refunded.body.data).toMatchObject({ status: 'PARTIAL', paid: 400 });
      expect((await call('post', `/payments/${paymentId}/refund`, s.tk.finance, { reason: 'Again' })).status).toBe(409);
      expect((await call('get', '/notifications', s.tk.patientA)).body.data.some((n: { type: string }) => n.type === 'PAYMENT_RECEIVED')).toBe(true);
      expect(await t.prisma.auditLog.count({ where: { action: 'payment.refund' } })).toBe(1);
    });

    it('an unpaid invoice can be cancelled', async () => {
      const id = (await invoice(s.tk.finance)).body.data.id;
      const c = await call('post', `/invoices/${id}/cancel`, s.tk.finance);
      expect(c.body.data.status).toBe('CANCELLED');
      expect((await call('post', `/invoices/${id}/payments`, s.tk.finance, { amount: 10, method: 'CASH' })).status).toBe(409);
    });
  });

  describe('admin: staff, roles, audit, stats', () => {
    it('only permitted staff reach admin endpoints', async () => {
      for (const p of ['/admin/users', '/admin/roles', '/admin/stats/overview', '/admin/audit-logs', '/admin/settings']) {
        expect((await call('get', p, s.tk.mc1)).status).toBe(403);
        expect((await call('get', p, s.tk.patientA)).status).toBe(403);
        expect((await call('get', p)).status).toBe(401);
      }
      expect((await call('get', '/admin/users', s.tk.admin)).status).toBe(200);
      expect((await call('get', '/admin/stats/overview', s.tk.admin)).body.data.kpis).toMatchObject({ totalPatients: 2, activeCases: 2 });
      expect((await call('get', '/admin/settings', s.tk.admin)).status).toBe(403); // super admin only
      expect((await call('get', '/admin/settings', s.tk.superadmin)).status).toBe(200);
    });

    it('creates staff, protects super admins and self, and signs suspended users out at once', async () => {
      const email = 'new.staff@example.test';
      const created = await call('post', '/admin/users', s.tk.admin, { fullName: 'New Staff', email, roles: ['VISA_OFFICER'], password: 'Strong-Passw0rd!' });
      expect(created.status).toBe(201);
      expect(created.body.data.roles).toEqual(['VISA_OFFICER']);
      expect((await call('post', '/admin/users', s.tk.admin, { fullName: 'Dup', email, roles: ['VISA_OFFICER'], password: 'Strong-Passw0rd!' })).status).toBe(409);
      expect((await call('post', '/admin/users', s.tk.admin, { fullName: 'Boss', email: 'boss@example.test', roles: ['SUPER_ADMIN'], password: 'Strong-Passw0rd!' })).status).toBe(403);
      expect((await call('post', '/admin/users', s.tk.admin, { fullName: 'Pat', email: 'pat@example.test', roles: ['PATIENT'], password: 'Strong-Passw0rd!' })).status).toBe(422);
      expect((await call('post', '/admin/users', s.tk.admin, { fullName: 'Weak', email: 'weak@example.test', roles: ['FINANCE'], password: 'short' })).status).toBe(422);

      const newTok = (await login(t.http, email, 'Strong-Passw0rd!')).token;
      expect((await call('get', '/visa', newTok)).status).toBe(200);
      expect((await call('patch', `/admin/users/${s.users.admin.id}`, s.tk.admin, { status: 'SUSPENDED' })).status).toBe(403); // not yourself
      expect((await call('patch', `/admin/users/${s.users.superadmin.id}`, s.tk.admin, { status: 'SUSPENDED' })).status).toBe(403); // not a super admin
      const suspended = await call('patch', `/admin/users/${created.body.data.id}`, s.tk.admin, { status: 'SUSPENDED' });
      expect(suspended.status).toBe(200);
      expect((await call('get', '/visa', newTok)).status).toBe(401); // existing token dies immediately
      expect((await login(t.http, email, 'Strong-Passw0rd!')).res.status).toBe(403);
      expect(await t.prisma.auditLog.count({ where: { action: 'staff.create' } })).toBe(1);
    });

    it('custom roles and permission edits take effect on the next request and are audited', async () => {
      expect((await call('post', '/admin/roles', s.tk.admin, { name: 'REPORT_VIEWER', permissions: ['reports.view'] })).status).toBe(403); // roles.manage is super-admin only
      const role = await call('post', '/admin/roles', s.tk.superadmin, { name: 'report_viewer', description: 'Reads reports', permissions: ['reports.view'] });
      expect(role.status).toBe(201);
      expect((await call('post', '/admin/roles', s.tk.superadmin, { name: 'REPORT_VIEWER', permissions: [] })).status).toBe(409);
      expect((await call('post', '/admin/roles', s.tk.superadmin, { name: 'BAD_ROLE', permissions: ['nope.nothing'] })).status).toBe(422);

      const staff = await call('post', '/admin/users', s.tk.superadmin, { fullName: 'Reporter', email: 'reporter@example.test', roles: ['REPORT_VIEWER'], password: 'Strong-Passw0rd!' });
      const tok = (await login(t.http, 'reporter@example.test', 'Strong-Passw0rd!')).token;
      expect((await call('get', '/admin/stats/overview', tok)).status).toBe(200);
      expect((await call('put', `/admin/roles/${role.body.data.id}/permissions`, s.tk.superadmin, { permissions: [] })).status).toBe(204);
      expect((await call('get', '/admin/stats/overview', tok)).status).toBe(403); // revoked immediately
      const superRole = (await call('get', '/admin/roles', s.tk.superadmin)).body.data.find((r: { name: string }) => r.name === 'SUPER_ADMIN');
      expect((await call('put', `/admin/roles/${superRole.id}/permissions`, s.tk.superadmin, { permissions: [] })).status).toBe(403);
      expect((await call('delete', `/admin/roles/${role.body.data.id}`, s.tk.superadmin)).status).toBe(409); // still assigned
      await call('patch', `/admin/users/${staff.body.data.id}`, s.tk.superadmin, { roles: ['FINANCE'] });
      expect((await call('delete', `/admin/roles/${role.body.data.id}`, s.tk.superadmin)).status).toBe(204);
      expect((await call('delete', `/admin/roles/${superRole.id}`, s.tk.superadmin)).status).toBe(403);
      const audit = await call('get', '/admin/audit-logs?action=rbac', s.tk.admin);
      expect(audit.body.data.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['rbac.permission_change', 'rbac.role_create', 'rbac.role_delete', 'rbac.role_change']));
    });

    it('audit log filters by actor and text and never exposes secrets', async () => {
      await call('post', '/admin/users', s.tk.admin, { fullName: 'Audited', email: 'audited@example.test', roles: ['FINANCE'], password: 'Strong-Passw0rd!' });
      const byActor = await call('get', `/admin/audit-logs?actorId=${s.users.admin.id}`, s.tk.admin);
      expect(byActor.body.data.length).toBeGreaterThan(0);
      expect(byActor.body.data.every((a: { actor: { id: string } | null }) => a.actor?.id === s.users.admin.id)).toBe(true);
      expect(JSON.stringify(byActor.body)).not.toMatch(/Strong-Passw0rd|passwordHash/);
    });

    it('reports summarise a date range', async () => {
      const r = await call('get', '/admin/reports/summary', s.tk.admin);
      expect(r.status).toBe(200);
      expect(r.body.data.cases.created).toBe(2);
      expect(r.body.data.casesByStatus[0]).toHaveProperty('count');
      expect((await call('get', '/admin/reports/summary', s.tk.finance)).status).toBe(200); // finance holds reports.view
      expect((await call('get', '/admin/reports/summary', s.tk.travel)).status).toBe(403);
    });
  });

  describe('workspace & notifications', () => {
    it('staff and doctor dashboards only include what the role may see', async () => {
      const fin = (await call('get', '/workspace/overview', s.tk.finance)).body.data;
      expect(fin.kind).toBe('staff');
      expect(fin.visa).toBeNull();
      expect(fin.travel).toBeNull();
      expect(fin.invoices).not.toBeNull();
      expect(fin.documents.total).toBe(0);

      await uploadDoc(t, s.tk.patientA, { category: 'MEDICAL_REPORT', caseId: s.caseA });
      expect((await call('get', '/workspace/overview', s.tk.mc1)).body.data.documents.total).toBe(1);
      expect((await call('get', '/workspace/overview', s.tk.mc2)).body.data.documents.total).toBe(0); // not assigned
      expect((await call('get', '/workspace/overview', s.tk.travel)).body.data.documents.total).toBe(0); // may not verify medical documents

      await call('post', '/appointments', s.tk.mc1, { caseId: s.caseA, doctorId: s.d1.id, scheduledAt: inDays(2), type: 'ONLINE_CONSULTATION', method: 'VIDEO' });
      const doc = (await call('get', '/workspace/overview', s.tk.doctor)).body.data;
      expect(doc.kind).toBe('doctor');
      expect(doc.doctor.fullName).toBe('Doc One');
      expect(doc.appointments.upcomingTotal).toBe(1);
      expect(doc.cases.active).toBe(1); // reached through the appointment
      expect((await call('get', '/workspace/overview', s.tk.patientA)).status).toBe(403);
      expect((await call('get', '/workspace/overview')).status).toBe(401);
    });

    it('doctors edit only their own consultation hours', async () => {
      const slot = { dayOfWeek: 2, startTime: '10:00', endTime: '12:00', timezone: 'Asia/Kolkata', method: 'VIDEO' };
      expect((await call('put', '/workspace/doctor/availability', s.tk.mc1, { availability: [slot] })).status).toBe(403);
      expect((await call('put', '/workspace/doctor/availability', s.tk.doctor, { availability: [{ ...slot, endTime: '09:00' }] })).status).toBe(422);
      const ok = await call('put', '/workspace/doctor/availability', s.tk.doctor, { availability: [slot] });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toHaveLength(1);
      expect((await call('get', '/workspace/doctor/availability', s.tk.doctor2)).body.data).toHaveLength(0);
    });

    it('notifications belong to their owner', async () => {
      await call('post', '/appointments', s.tk.mc1, { caseId: s.caseA, scheduledAt: inDays(2), type: 'ONLINE_CONSULTATION', method: 'VIDEO' });
      const mine = await call('get', '/notifications?unread=true', s.tk.patientA);
      expect(mine.body.meta.total).toBe(1);
      expect((await call('get', '/notifications/unread-count', s.tk.patientA)).body.data.count).toBe(1);
      expect((await call('get', '/notifications/unread-count', s.tk.patientB)).body.data.count).toBe(0);
      const id = mine.body.data[0].id;
      expect((await call('post', `/notifications/${id}/read`, s.tk.patientB)).status).toBe(404);
      expect((await call('post', `/notifications/${id}/read`, s.tk.patientA)).status).toBe(200);
      expect((await call('get', '/notifications/unread-count', s.tk.patientA)).body.data.count).toBe(0);
      await call('post', '/notifications/read-all', s.tk.mc1);
      expect((await call('get', '/notifications/unread-count', s.tk.mc1)).body.data.count).toBe(0);
    });
  });
});
