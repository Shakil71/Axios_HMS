import request from 'supertest';
import { API, TestApp, bearer, createApp, makeUser, resetDb, tokenFor } from './helpers';

describe('treatment case workflow', () => {
  let t: TestApp;
  let patient: { tok: string; id: string; profileId: string };
  let mc: { tok: string; id: string };
  let admin: { tok: string; id: string };
  const asP = (m: 'get' | 'post' | 'patch', p: string, body?: object) => (request(t.http()) as any)[m](API + p).set(bearer(patient.tok)).send(body);
  const as = (who: { tok: string }, m: 'get' | 'post' | 'patch', p: string, body?: object) => (request(t.http()) as any)[m](API + p).set(bearer(who.tok)).send(body);

  const newCase = async (body: object = { symptoms: 'Persistent headache' }) => (await asP('post', '/cases', body)).body.data.id as string;
  const assignMc = (caseId: string) => as(admin, 'post', `/cases/${caseId}/assignments`, { staffId: mc.id, role: 'MEDICAL_COORDINATOR' });

  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDb(t.prisma);
    const p = await makeUser(t.prisma, 'PATIENT');
    patient = { tok: await tokenFor(t.http, p.email), id: p.id, profileId: p.profileId! };
    const m = await makeUser(t.prisma, 'MEDICAL_COORDINATOR');
    mc = { tok: await tokenFor(t.http, m.email), id: m.id };
    const a = await makeUser(t.prisma, 'ADMIN');
    admin = { tok: await tokenFor(t.http, a.email), id: a.id };
  });
  afterAll(() => t.app.close());

  it('creates a case with a readable number, plain-language status and a first timeline event', async () => {
    const res = await asP('post', '/cases', { symptoms: 'Chest pain', budgetMin: 1000, budgetMax: 5000, budgetCurrency: 'usd' });
    expect(res.status).toBe(201);
    expect(res.body.data.caseNumber).toMatch(/^MC-\d{4}-\d{6}$/);
    expect(res.body.data).toMatchObject({ status: 'NEW', statusLabel: 'We received your request', budgetCurrency: 'USD', budgetMax: 5000 });
    const tl = await asP('get', `/cases/${res.body.data.id}/timeline`);
    expect(tl.body.data.map((e: { type: string }) => e.type)).toEqual(['CASE_CREATED']);
    const second = await asP('post', '/cases', { symptoms: 'x' });
    expect(second.body.data.caseNumber).not.toBe(res.body.data.caseNumber);
  });

  it('validates budget and unknown fields', async () => {
    expect((await asP('post', '/cases', { budgetMin: 500, budgetMax: 100 })).status).toBe(422);
    expect((await asP('post', '/cases', { status: 'COMPLETED' })).status).toBe(422);
    expect((await asP('post', '/cases', { priority: 'URGENT' })).status).toBe(422);
  });

  it('lets a patient open a case for their own family member only', async () => {
    const fam = await asP('post', '/patients/me/family-members', { fullName: 'Rina Begum', relationship: 'MOTHER', passportNumber: 'AB1234567' });
    expect(fam.status).toBe(201);
    expect(fam.body.data.passportNumber).toBe('••••4567');
    const ok = await asP('post', '/cases', { familyMemberId: fam.body.data.id, symptoms: 'Knee pain' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.familyMember).toMatchObject({ fullName: 'Rina Begum', relationship: 'MOTHER' });

    const other = await makeUser(t.prisma, 'PATIENT');
    const otherTok = await tokenFor(t.http, other.email);
    const stolen = await request(t.http()).post(`${API}/cases`).set(bearer(otherTok)).send({ familyMemberId: fam.body.data.id });
    expect(stolen.status).toBe(422);
    expect((await request(t.http()).patch(`${API}/patients/me/family-members/${fam.body.data.id}`).set(bearer(otherTok)).send({ fullName: 'Hacked' })).status).toBe(404);
    expect((await request(t.http()).delete(`${API}/patients/me/family-members/${fam.body.data.id}`).set(bearer(otherTok))).status).toBe(404);
  });

  it('patients can edit details only while the case is at the start; then it is locked', async () => {
    const id = await newCase();
    expect((await asP('patch', `/cases/${id}`, { currentDiagnosis: 'Migraine?' })).status).toBe(200);
    await assignMc(id);
    expect((await as(mc, 'post', `/cases/${id}/status`, { status: 'MEDICAL_REVIEW' })).status).toBe(200);
    const locked = await asP('patch', `/cases/${id}`, { symptoms: 'changed' });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('CASE_LOCKED');
  });

  it('staff move a case through the journey, each step visible to the patient in plain words', async () => {
    const id = await newCase();
    await assignMc(id);
    for (const status of ['DOCUMENT_COLLECTION', 'MEDICAL_REVIEW', 'VISA_PROCESSING']) {
      expect((await as(mc, 'post', `/cases/${id}/status`, { status, message: status === 'VISA_PROCESSING' ? 'Embassy appointment booked' : undefined })).status).toBe(200);
    }
    const tl = (await asP('get', `/cases/${id}/timeline`)).body.data as { title: string; description: string | null; toStatus: string | null }[];
    expect(tl.map((e) => e.title)).toEqual([
      'Your case was created', 'A medical coordinator was assigned to your case', 'We are collecting your documents',
      'Our medical team is reviewing your case', 'Your visa is being processed',
    ]);
    expect(tl.at(-1)!.description).toBe('Embassy appointment booked');
    expect((await asP('get', `/cases/${id}`)).body.data.statusLabel).toBe('Your visa is being processed');
    expect((await asP('get', `/cases/${id}`)).body.data.coordinators).toEqual([{ role: 'MEDICAL_COORDINATOR', name: expect.any(String) }]);
  });

  it('rejects no-op transitions and requires cases.close to finish or cancel; closed cases are frozen', async () => {
    const id = await newCase();
    await assignMc(id);
    expect((await as(mc, 'post', `/cases/${id}/status`, { status: 'NEW' })).body.error.code).toBe('NO_CHANGE');
    expect((await as(mc, 'post', `/cases/${id}/status`, { status: 'COMPLETED' })).status).toBe(403);
    expect((await as(admin, 'post', `/cases/${id}/status`, { status: 'COMPLETED' })).status).toBe(200);
    const closed = await t.prisma.medicalCase.findUniqueOrThrow({ where: { id } });
    expect(closed.closedAt).not.toBeNull();
    expect((await as(admin, 'post', `/cases/${id}/status`, { status: 'FOLLOW_UP' })).body.error.code).toBe('CASE_CLOSED');
    expect((await as(admin, 'post', `/cases/${id}/status`, { status: 'NOPE' })).status).toBe(422);
  });

  it('a patient can cancel early but not once travel is being arranged', async () => {
    const early = await newCase();
    const c1 = await asP('post', `/cases/${early}/cancel`);
    expect(c1.status).toBe(200);
    expect(c1.body.data).toMatchObject({ status: 'CANCELLED', statusLabel: 'Your case was cancelled' });

    const late = await newCase();
    await assignMc(late);
    await as(mc, 'post', `/cases/${late}/status`, { status: 'TRAVEL_PLANNING' });
    const c2 = await asP('post', `/cases/${late}/cancel`);
    expect(c2.status).toBe(409);
    expect(c2.body.error.code).toBe('CANNOT_CANCEL');
    expect((await as(mc, 'post', `/cases/${late}/cancel`)).status).toBe(403); // staff use the status endpoint instead
  });

  it('assignment rules: no duplicates, staff only, active users only', async () => {
    const id = await newCase();
    expect((await assignMc(id)).status).toBe(201);
    expect((await assignMc(id)).body.error.code).toBe('ALREADY_ASSIGNED');
    expect((await as(admin, 'post', `/cases/${id}/assignments`, { staffId: patient.id, role: 'CASE_MANAGER' })).status).toBe(422); // a patient is not staff
    await t.prisma.user.update({ where: { id: mc.id }, data: { status: 'SUSPENDED' } });
    const other = await newCase();
    expect((await assignMc(other)).status).toBe(422);
    expect(await t.prisma.auditLog.count({ where: { action: 'case.assign' } })).toBe(1);
  });

  it('lists with filters, pagination and sorting; patients only ever see their own', async () => {
    const ids = [await newCase({ symptoms: 'a' }), await newCase({ symptoms: 'b' }), await newCase({ symptoms: 'c' })];
    await assignMc(ids[0]);
    await as(mc, 'post', `/cases/${ids[0]}/status`, { status: 'MEDICAL_REVIEW' });
    const other = await makeUser(t.prisma, 'PATIENT');
    const otherTok = await tokenFor(t.http, other.email);
    await request(t.http()).post(`${API}/cases`).set(bearer(otherTok)).send({});

    const mine = await asP('get', '/cases');
    expect(mine.body.meta).toMatchObject({ total: 3 });
    expect((await asP('get', '/cases?status=MEDICAL_REVIEW')).body.data.map((c: { id: string }) => c.id)).toEqual([ids[0]]);
    const page = await asP('get', '/cases?pageSize=2&page=2&sort=createdAt');
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 3 });

    expect((await as(admin, 'get', '/cases')).body.meta.total).toBe(4);
    expect((await as(mc, 'get', '/cases')).body.meta.total).toBe(1); // only the assigned case
    expect((await as(admin, 'get', `/cases?q=${encodeURIComponent('Test PATIENT')}`)).body.meta.total).toBeGreaterThanOrEqual(3);
    expect((await asP('get', '/cases?status=BOGUS')).status).toBe(422);
  });

  it('audits every case mutation with who/what/where', async () => {
    const id = await newCase();
    await assignMc(id);
    await as(mc, 'post', `/cases/${id}/status`, { status: 'MEDICAL_REVIEW' });
    await as(mc, 'get', `/cases/${id}`);
    const rows = await t.prisma.auditLog.findMany({ where: { resourceId: id }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.action)).toEqual(['case.create', 'case.assign', 'case.status', 'case.view']);
    const status = rows.find((r) => r.action === 'case.status')!;
    expect(status).toMatchObject({ actorId: mc.id, actorRole: 'MEDICAL_COORDINATOR', resourceType: 'MedicalCase' });
    expect(status.before).toEqual({ status: 'NEW' });
    expect(status.after).toEqual({ status: 'MEDICAL_REVIEW' });
    expect(status.ip).toBeTruthy();
  });
});
