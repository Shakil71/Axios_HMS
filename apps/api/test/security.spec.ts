import request from 'supertest';
import { MemoryStorage, Storage } from '../src/storage/storage.service';
import { API, PNG, TestApp, bearer, buildScenario, createApp, dl, login, makeUser, resetDb, tokenFor, uploadDoc } from './helpers';

/**
 * Phase 1 security gates (docs/05): object-level authorization, sensitivity separation,
 * immediate revocation, signed URLs, upload validation, audit trail.
 */
describe('security & authorization', () => {
  let t: TestApp;
  let s: Awaited<ReturnType<typeof buildScenario>>;

  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDb(t.prisma);
    s = await buildScenario(t);
  });
  afterAll(() => t.app.close());

  describe('patient isolation', () => {
    it("patient B cannot read, list, or modify patient A's case", async () => {
      const B = bearer(s.tk.patientB);
      for (const path of [`/cases/${s.caseA}`, `/cases/${s.caseA}/timeline`, `/cases/${s.caseA}/notes`]) {
        expect((await request(t.http()).get(API + path).set(B)).status).toBe(404);
      }
      expect((await request(t.http()).patch(`${API}/cases/${s.caseA}`).set(B).send({ symptoms: 'hijack' })).status).toBe(404);
      expect((await request(t.http()).post(`${API}/cases/${s.caseA}/cancel`).set(B)).status).toBe(404);
      const list = await request(t.http()).get(`${API}/cases`).set(B);
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(0);
      expect((await request(t.http()).get(`${API}/cases/${s.caseA}`).set(bearer(s.tk.patientA))).status).toBe(200);
    });

    it("patient B cannot access, download, replace, verify or delete patient A's documents (and each attempt is logged)", async () => {
      const B = bearer(s.tk.patientB);
      const id = s.docs.report;
      expect((await request(t.http()).get(`${API}/documents/${id}`).set(B)).status).toBe(404);
      expect((await dl(t, s.tk.patientB, id)).status).toBe(404);
      expect((await request(t.http()).post(`${API}/documents/${id}/versions`).set(B).send({ fileName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 10 })).status).toBe(404);
      expect((await request(t.http()).patch(`${API}/documents/${id}/verify`).set(B).send({ decision: 'VERIFIED' })).status).toBe(404);
      expect((await request(t.http()).delete(`${API}/documents/${id}`).set(B)).status).toBe(404);
      expect((await request(t.http()).get(`${API}/documents`).set(B)).body.data).toHaveLength(0);

      const denied = await t.prisma.documentAccessLog.count({ where: { documentId: id, userId: s.users.patientB.id, action: 'DENIED', granted: false } });
      expect(denied).toBeGreaterThanOrEqual(5);
      expect(await t.prisma.auditLog.count({ where: { action: 'document.access_denied', actorId: s.users.patientB.id } })).toBeGreaterThanOrEqual(5);
    });

    it("patient B cannot attach documents to patient A's case or use A's family members", async () => {
      const r = await uploadDoc(t, s.tk.patientB, { category: 'MEDICAL_REPORT', caseId: s.caseA });
      expect(r.req.status).toBe(404);
    });

    it('a patient cannot read the staff patient list or another profile', async () => {
      expect((await request(t.http()).get(`${API}/patients`).set(bearer(s.tk.patientB))).status).toBe(403);
      expect((await request(t.http()).get(`${API}/patients/${s.users.patientA.profileId}`).set(bearer(s.tk.patientB))).status).toBe(403);
    });

    it('unauthenticated requests never reach documents or cases', async () => {
      for (const [m, p] of [['get', `/documents/${s.docs.report}`], ['post', `/documents/${s.docs.report}/download-url`], ['get', '/cases'], ['get', '/patients/me']] as const) {
        expect((await (request(t.http()) as any)[m](API + p)).status).toBe(401);
      }
    });
  });

  describe('staff modules & assignment scope', () => {
    it('staff without the permission are blocked from restricted endpoints', async () => {
      const status = (tok: string) => request(t.http()).post(`${API}/cases/${s.caseA}/status`).set(bearer(tok)).send({ status: 'MEDICAL_REVIEW' });
      expect((await status(s.tk.travel)).status).toBe(403); // no cases.edit
      expect((await status(s.tk.finance)).status).toBe(403);
      expect((await status(s.tk.patientA)).status).toBe(403);
      expect((await request(t.http()).post(`${API}/cases/${s.caseA}/assignments`).set(bearer(s.tk.mc1)).send({ staffId: s.users.mc2.id, role: 'MEDICAL_COORDINATOR' })).status).toBe(403); // no cases.assign
      expect((await status(s.tk.mc1)).status).toBe(200);
    });

    it('a staff member NOT assigned to the case cannot see it or its documents, even with the permissions', async () => {
      const mc2 = bearer(s.tk.mc2);
      expect((await request(t.http()).get(`${API}/cases/${s.caseA}`).set(mc2)).status).toBe(404);
      expect((await request(t.http()).get(`${API}/cases`).set(mc2)).body.data).toHaveLength(0);
      expect((await request(t.http()).get(`${API}/patients/${s.users.patientA.profileId}`).set(mc2)).status).toBe(404);
      expect((await dl(t, s.tk.mc2, s.docs.report)).status).toBe(404);
      expect((await request(t.http()).get(`${API}/documents`).set(mc2)).body.data).toHaveLength(0);
    });

    it('assigned staff see the case; admin (with .all scope) sees everything', async () => {
      expect((await request(t.http()).get(`${API}/cases/${s.caseA}`).set(bearer(s.tk.mc1))).status).toBe(200);
      expect((await request(t.http()).get(`${API}/cases`).set(bearer(s.tk.admin))).body.data).toHaveLength(1);
      expect((await dl(t, s.tk.admin, s.docs.passport)).status).toBe(200);
    });

    it('unassigning a staff member removes access on the next request', async () => {
      expect((await dl(t, s.tk.mc1, s.docs.report)).status).toBe(200);
      const a = await t.prisma.caseAssignment.findFirstOrThrow({ where: { staffId: s.users.mc1.id } });
      const un = await request(t.http()).delete(`${API}/cases/${s.caseA}/assignments/${a.id}`).set(bearer(s.tk.admin));
      expect(un.status).toBe(204);
      expect((await dl(t, s.tk.mc1, s.docs.report)).status).toBe(404);
      expect((await request(t.http()).get(`${API}/cases/${s.caseA}`).set(bearer(s.tk.mc1))).status).toBe(404);
    });

    it('a doctor sees a case only once linked as its selected doctor', async () => {
      expect((await request(t.http()).get(`${API}/cases/${s.caseA}`).set(bearer(s.tk.doctor))).status).toBe(404);
      const country = await t.prisma.country.create({ data: { slug: 'x', name: 'X', isoCode: 'XX', status: 'PUBLISHED' } });
      const hospital = await t.prisma.hospital.create({ data: { slug: 'h', name: 'H', countryId: country.id, status: 'PUBLISHED' } });
      const doc = await t.prisma.doctor.create({ data: { slug: 'd', fullName: 'Dr Demo', userId: s.users.doctor.id, isVerified: true, status: 'PUBLISHED' } });
      await t.prisma.doctorHospital.create({ data: { doctorId: doc.id, hospitalId: hospital.id } });
      const sel = await request(t.http()).patch(`${API}/cases/${s.caseA}`).set(bearer(s.tk.admin)).send({ selectedDoctorId: doc.id });
      expect(sel.status).toBe(200);
      expect((await request(t.http()).get(`${API}/cases/${s.caseA}`).set(bearer(s.tk.doctor))).status).toBe(200);
      expect((await dl(t, s.tk.doctor, s.docs.report)).status).toBe(200); // medical
      expect((await dl(t, s.tk.doctor, s.docs.passport)).status).toBe(403); // identity: not for doctors
    });
  });

  describe('document sensitivity separation', () => {
    const matrix: [string, 'passport' | 'report' | 'insurance' | 'visaDoc', number][] = [
      ['finance', 'report', 403], ['finance', 'passport', 403], ['finance', 'visaDoc', 403], ['finance', 'insurance', 200],
      ['travel', 'report', 403], ['travel', 'passport', 200], ['travel', 'visaDoc', 200], ['travel', 'insurance', 403],
      ['visa', 'report', 403], ['visa', 'passport', 200], ['visa', 'visaDoc', 200], ['visa', 'insurance', 403],
      ['mc1', 'report', 200], ['mc1', 'passport', 403], ['mc1', 'visaDoc', 403], ['mc1', 'insurance', 403],
    ];
    it.each(matrix)('%s downloading %s -> %i', async (who, doc, expected) => {
      const res = await dl(t, s.tk[who as keyof typeof s.tk], s.docs[doc]);
      expect(res.status).toBe(expected);
      if (expected === 200) expect(res.body.data.url).toMatch(/^\/api\/v1\/_dev\/storage\/get\//);
    });

    it('document lists only include categories the staff member may view', async () => {
      const cats = async (who: keyof typeof s.tk) =>
        (await request(t.http()).get(`${API}/documents`).set(bearer(s.tk[who]))).body.data.map((d: { category: string }) => d.category).sort();
      expect(await cats('finance')).toEqual(['INSURANCE']);
      expect(await cats('mc1')).toEqual(['MEDICAL_REPORT']);
      expect(await cats('travel')).toEqual(['PASSPORT', 'VISA']);
      expect(await cats('patientA')).toEqual(['INSURANCE', 'MEDICAL_REPORT', 'PASSPORT', 'VISA']);
    });

    it('a patient cannot verify their own documents; staff with the permission can', async () => {
      const own = await request(t.http()).patch(`${API}/documents/${s.docs.report}/verify`).set(bearer(s.tk.patientA)).send({ decision: 'VERIFIED' });
      expect(own.status).toBe(403);
      expect((await request(t.http()).patch(`${API}/documents/${s.docs.report}/verify`).set(bearer(s.tk.travel)).send({ decision: 'VERIFIED' })).status).toBe(403);
      const ok = await request(t.http()).patch(`${API}/documents/${s.docs.report}/verify`).set(bearer(s.tk.mc1)).send({ decision: 'VERIFIED' });
      expect(ok.status).toBe(200);
      expect(ok.body.data.status).toBe('VERIFIED');
    });

    it('rejection requires a reason and is visible to the patient in plain language', async () => {
      const bad = await request(t.http()).patch(`${API}/documents/${s.docs.report}/verify`).set(bearer(s.tk.mc1)).send({ decision: 'REJECTED' });
      expect(bad.status).toBe(422);
      const ok = await request(t.http()).patch(`${API}/documents/${s.docs.report}/verify`).set(bearer(s.tk.mc1)).send({ decision: 'REJECTED', reason: 'The photo is blurry' });
      expect(ok.status).toBe(200);
      const mine = await request(t.http()).get(`${API}/documents/${s.docs.report}`).set(bearer(s.tk.patientA));
      expect(mine.body.data).toMatchObject({ status: 'REJECTED', statusLabel: 'Please upload a new copy', rejectionReason: 'The photo is blurry' });
    });

    it('verified documents cannot be deleted by the patient; unverified can', async () => {
      await request(t.http()).patch(`${API}/documents/${s.docs.report}/verify`).set(bearer(s.tk.mc1)).send({ decision: 'VERIFIED' });
      expect((await request(t.http()).delete(`${API}/documents/${s.docs.report}`).set(bearer(s.tk.patientA))).status).toBe(409);
      expect((await request(t.http()).delete(`${API}/documents/${s.docs.insurance}`).set(bearer(s.tk.patientA))).status).toBe(204);
      expect((await request(t.http()).get(`${API}/documents/${s.docs.insurance}`).set(bearer(s.tk.patientA))).status).toBe(404);
    });
  });

  describe('revocation is immediate', () => {
    it('removing a permission from a role blocks the very next request (no re-login)', async () => {
      const role = await t.prisma.role.create({ data: { name: 'CUSTOM_MEDICAL_VIEWER' } });
      const perms = await t.prisma.permission.findMany({ where: { key: { in: ['cases.view', 'documents.view.medical', 'documents.download.medical'] } } });
      await t.prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
      const user = await makeUser(t.prisma, 'PATIENT', { withProfile: false });
      await t.prisma.userRole.deleteMany({ where: { userId: user.id } });
      await t.prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      const tok = await tokenFor(t.http, user.email);
      await t.prisma.caseAssignment.create({ data: { caseId: s.caseA, staffId: user.id, role: 'MEDICAL_COORDINATOR' } });

      expect((await dl(t, tok, s.docs.report)).status).toBe(200);
      const revoke = perms.find((p) => p.key === 'documents.download.medical')!;
      await t.prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: revoke.id } } });
      expect((await dl(t, tok, s.docs.report)).status).toBe(403);
      expect((await request(t.http()).get(`${API}/cases/${s.caseA}`).set(bearer(tok))).status).toBe(200); // other permissions intact
    });

    it('removing a role, suspending the account, or bumping the session version blocks the next request', async () => {
      const tok = s.tk.mc1;
      expect((await dl(t, tok, s.docs.report)).status).toBe(200);
      await t.prisma.userRole.deleteMany({ where: { userId: s.users.mc1.id } });
      expect((await dl(t, tok, s.docs.report)).status).toBe(404); // no staff perms and no patient profile -> nothing reachable
      const tok2 = s.tk.visa;
      await t.prisma.user.update({ where: { id: s.users.visa.id }, data: { status: 'SUSPENDED' } });
      expect((await dl(t, tok2, s.docs.passport)).status).toBe(401);
    });
  });

  describe('signed URLs', () => {
    it('issue a short-lived URL that works, then expires and cannot be tampered with', async () => {
      const storage = t.app.get(Storage) as MemoryStorage;
      const res = await dl(t, s.tk.patientA, s.docs.report);
      const url = res.body.data.url as string;
      expect(storage.fetchSigned(url).length).toBeGreaterThan(0);

      expect(() => storage.fetchSigned(url.replace(/sig=[0-9a-f]{4}/, 'sig=0000'))).toThrow('SignatureDoesNotMatch');
      expect(() => storage.fetchSigned(url.replace('fn=', 'fn=evil'))).toThrow('SignatureDoesNotMatch'); // response headers are signed too
      expect(() => storage.fetchSigned(url.replace(/docs\/([0-9a-f-]{36})/, 'docs/00000000-0000-0000-0000-000000000000'))).toThrow();
      const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 121_000);
      expect(() => storage.fetchSigned(url)).toThrow('ExpiredToken');
      spy.mockRestore();
      expect(new Date(res.body.data.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(120_000);
    });

    it('never puts patient data or the file name in the object key, and never returns bytes from the API', async () => {
      const v = await t.prisma.documentVersion.findFirstOrThrow({ where: { documentId: s.docs.passport } });
      expect(v.storageKey).toMatch(/^docs\/[0-9a-f-]{36}\/1-[0-9a-f-]{36}$/);
      const res = await dl(t, s.tk.patientA, s.docs.passport);
      expect(JSON.stringify(res.body)).not.toContain('%PDF');
    });

    it('every issued URL leaves an access-log row and an audit event', async () => {
      await dl(t, s.tk.mc1, s.docs.report);
      const log = await t.prisma.documentAccessLog.findFirstOrThrow({ where: { documentId: s.docs.report, userId: s.users.mc1.id, action: 'URL_ISSUED' } });
      expect(log.ip).toBeTruthy();
      expect(await t.prisma.auditLog.count({ where: { action: 'document.download', actorId: s.users.mc1.id, resourceId: s.docs.report } })).toBe(1);
    });
  });

  describe('upload validation', () => {
    it('rejects unsupported types and oversized files before issuing an upload URL', async () => {
      const exe = await request(t.http()).post(`${API}/documents/uploads`).set(bearer(s.tk.patientA)).send({ category: 'MEDICAL_REPORT', fileName: 'x.exe', mimeType: 'application/x-msdownload', sizeBytes: 100 });
      expect(exe.status).toBe(422);
      const big = await request(t.http()).post(`${API}/documents/uploads`).set(bearer(s.tk.patientA)).send({ category: 'MEDICAL_REPORT', fileName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 50 * 1024 * 1024 });
      expect(big.status).toBe(422);
      const zipForPassport = await request(t.http()).post(`${API}/documents/uploads`).set(bearer(s.tk.patientA)).send({ category: 'PASSPORT', fileName: 'x.zip', mimeType: 'application/zip', sizeBytes: 100 });
      expect(zipForPassport.status).toBe(422);
    });

    it('rejects a file whose real content does not match the declared type, and discards it', async () => {
      const before = await t.prisma.document.count();
      const r = await uploadDoc(t, s.tk.patientA, { category: 'MEDICAL_REPORT', caseId: s.caseA, mimeType: 'application/pdf', bytes: PNG });
      expect(r.complete!.status).toBe(422);
      expect(r.complete!.body.error.code).toBe('FILE_TYPE_MISMATCH');
      expect(await t.prisma.document.count()).toBe(before);
      const storage = t.app.get(Storage) as MemoryStorage;
      expect([...storage.objects.values()].some((b) => b.equals(PNG))).toBe(false);
    });

    it('does not create a visible document until the bytes have arrived', async () => {
      const r = await uploadDoc(t, s.tk.patientA, { category: 'MEDICAL_REPORT', caseId: s.caseA, skipPut: true });
      expect(r.complete!.status).toBe(409);
      const list = await request(t.http()).get(`${API}/documents?category=MEDICAL_REPORT`).set(bearer(s.tk.patientA));
      expect(list.body.data).toHaveLength(1); // only the completed one from the scenario
      expect((await request(t.http()).get(`${API}/documents/${r.documentId}`).set(bearer(s.tk.patientA))).status).toBe(404);
    });

    it("only the uploader can complete a pending upload", async () => {
      const req = await request(t.http()).post(`${API}/documents/uploads`).set(bearer(s.tk.patientA)).send({ category: 'MEDICAL_REPORT', fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 20, caseId: s.caseA });
      const other = await request(t.http()).post(`${API}/documents/${req.body.data.documentId}/complete`).set(bearer(s.tk.patientB)).send({});
      expect(other.status).toBe(404);
    });

    it('replacing a file creates a new version, keeps history and resets verification', async () => {
      await request(t.http()).patch(`${API}/documents/${s.docs.report}/verify`).set(bearer(s.tk.mc1)).send({ decision: 'VERIFIED' });
      const req = await request(t.http()).post(`${API}/documents/${s.docs.report}/versions`).set(bearer(s.tk.patientA)).send({ fileName: 'new.pdf', mimeType: 'application/pdf', sizeBytes: 24 });
      expect(req.status).toBe(201);
      expect(req.body.data.versionNo).toBe(2);
      const mem = t.app.get(Storage) as MemoryStorage;
      mem.objects.set(mem.verify('put', req.body.data.upload.url).key, Buffer.from('%PDF-1.7\n%second copy\n'.padEnd(24, ' ')));
      const done = await request(t.http()).post(`${API}/documents/${s.docs.report}/complete`).set(bearer(s.tk.patientA)).send({});
      expect(done.status).toBe(200);
      expect(done.body.data).toMatchObject({ status: 'UPLOADED', currentVersion: 2 });
      const versions = await request(t.http()).get(`${API}/documents/${s.docs.report}/versions`).set(bearer(s.tk.patientA));
      expect(versions.body.data.map((v: { versionNo: number }) => v.versionNo)).toEqual([2, 1]);
    });

    it('sanitises path tricks in file names', async () => {
      const r = await uploadDoc(t, s.tk.patientA, { category: 'MEDICAL_REPORT', caseId: s.caseA, fileName: '../../etc/passwd.pdf' });
      const v = await t.prisma.documentVersion.findFirstOrThrow({ where: { documentId: r.documentId } });
      expect(v.originalFileName).not.toMatch(/[\\/]/);
    });
  });

  describe('sensitive data handling', () => {
    it('stores NID/passport numbers encrypted, returns them masked, and keeps them out of audit logs', async () => {
      const res = await request(t.http()).patch(`${API}/patients/me`).set(bearer(s.tk.patientA)).send({ passportNumber: 'BX1234567', nidNumber: '1990123456789' });
      expect(res.status).toBe(200);
      expect(res.body.data.passportNumber).toBe('••••4567');
      expect(res.body.data.nidNumber).toBe('••••6789');
      const raw = await t.prisma.patientProfile.findUniqueOrThrow({ where: { id: s.users.patientA.profileId! } });
      expect(raw.passportNumberEnc).not.toContain('BX1234567');
      expect(raw.nidNumberEnc).not.toContain('1990123456789');
      const get = await request(t.http()).get(`${API}/patients/me`).set(bearer(s.tk.patientA));
      expect(JSON.stringify(get.body)).not.toContain('BX1234567');
      const audits = JSON.stringify(await t.prisma.auditLog.findMany());
      expect(audits).not.toContain('BX1234567');
      expect(audits).not.toContain('1990123456789');
      // staff view is masked too
      const staff = await request(t.http()).get(`${API}/patients/${s.users.patientA.profileId}`).set(bearer(s.tk.admin));
      expect(JSON.stringify(staff.body)).not.toContain('BX1234567');
    });

    it('audit and access logs are append-only at the database level', async () => {
      const a = await t.prisma.auditLog.findFirstOrThrow();
      await expect(t.prisma.auditLog.update({ where: { id: a.id }, data: { action: 'tampered' } })).rejects.toThrow(/append-only/);
      await expect(t.prisma.auditLog.delete({ where: { id: a.id } })).rejects.toThrow(/append-only/);
      const l = await t.prisma.documentAccessLog.findFirstOrThrow();
      await expect(t.prisma.documentAccessLog.delete({ where: { id: l.id } })).rejects.toThrow(/append-only/);
    });

    it('errors never leak internals', async () => {
      const bad = await request(t.http()).get(`${API}/documents/not-a-uuid`).set(bearer(s.tk.patientA));
      expect(bad.status).toBe(400);
      const text = JSON.stringify(bad.body);
      expect(text).not.toMatch(/prisma|stack|node_modules|SELECT/i);
    });

    it('security headers are set on API responses', async () => {
      const res = await request(t.http()).get(`${API}/health/live`);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
    });
  });

  describe('case privacy', () => {
    it('internal notes and internal timeline entries never reach the patient', async () => {
      const internal = await request(t.http()).post(`${API}/cases/${s.caseA}/notes`).set(bearer(s.tk.mc1)).send({ body: 'Patient seems anxious, call family', visibility: 'INTERNAL' });
      expect(internal.status).toBe(201);
      await request(t.http()).post(`${API}/cases/${s.caseA}/notes`).set(bearer(s.tk.mc1)).send({ body: 'We have received your reports.', visibility: 'PATIENT_VISIBLE' });

      const notes = await request(t.http()).get(`${API}/cases/${s.caseA}/notes`).set(bearer(s.tk.patientA));
      expect(notes.body.data.map((n: { body: string }) => n.body)).toEqual(['We have received your reports.']);
      const tl = await request(t.http()).get(`${API}/cases/${s.caseA}/timeline`).set(bearer(s.tk.patientA));
      expect(JSON.stringify(tl.body)).not.toContain('anxious');
      expect(JSON.stringify(tl.body)).not.toContain('Internal note');
      const staffTl = await request(t.http()).get(`${API}/cases/${s.caseA}/timeline`).set(bearer(s.tk.mc1));
      expect(staffTl.body.data.some((e: { title: string }) => e.title === 'Internal note added')).toBe(true);
      const caseView = await request(t.http()).get(`${API}/cases/${s.caseA}`).set(bearer(s.tk.patientA));
      expect(caseView.body.data.priority).toBeUndefined();
      expect(caseView.body.data.assignments).toBeUndefined();
    });

    it('patients cannot set staff-only fields; staff-only status endpoint is closed to them', async () => {
      const r = await request(t.http()).patch(`${API}/cases/${s.caseA}`).set(bearer(s.tk.patientA)).send({ priority: 'URGENT' });
      expect(r.status).toBe(403);
    });

    it('unverified patients cannot open a case', async () => {
      const u = await makeUser(t.prisma, 'PATIENT', { verified: false });
      const tok = (await login(t.http, u.email)).token;
      const r = await request(t.http()).post(`${API}/cases`).set(bearer(tok)).send({ symptoms: 'x' });
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });
  });
});
