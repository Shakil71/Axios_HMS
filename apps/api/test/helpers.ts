import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from '@node-rs/argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/prisma.service';
import { syncRbac } from '../src/rbac/rbac-seed';
import { MemoryStorage, Storage } from '../src/storage/storage.service';

export const PASSWORD = 'Correct-Horse-9!';

export async function createApp() {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService), http: () => app.getHttpServer() };
}

/** Wipes all data except the migration table, then re-syncs the RBAC catalog. */
export async function resetDb(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations')`;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  await syncRbac(prisma);
}

let counter = 0;
export async function makeUser(
  prisma: PrismaClient,
  role: string,
  opts: { email?: string; verified?: boolean; withProfile?: boolean; extraRoles?: string[] } = {},
) {
  const n = ++counter;
  const email = opts.email ?? `${role.toLowerCase()}${n}@example.test`;
  const roleNames = [role, ...(opts.extraRoles ?? [])];
  const roles = await prisma.role.findMany({ where: { name: { in: roleNames } } });
  const user = await prisma.user.create({
    data: {
      email,
      phone: `+88017000${String(10000 + n)}`,
      fullName: `Test ${role} ${n}`,
      passwordHash: await argon2.hash(PASSWORD, { memoryCost: 8192, timeCost: 2, parallelism: 1 }),
      status: opts.verified === false ? 'PENDING_VERIFICATION' : 'ACTIVE',
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      roles: { create: roles.map((r) => ({ roleId: r.id })) },
      ...(role === 'PATIENT' && opts.withProfile !== false ? { patientProfile: { create: {} } } : {}),
    },
    include: { patientProfile: true },
  });
  return { ...user, email, profileId: user.patientProfile?.id ?? null };
}

export async function login(http: () => any, email: string, password = PASSWORD) {
  const res = await request(http()).post('/api/v1/auth/login').send({ email, password });
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  return { res, token: res.body?.data?.accessToken as string, cookie: cookies?.[0] };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function tokenFor(http: () => any, email: string) {
  const { token, res } = await login(http, email);
  if (!token) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  return token;
}

export type TestApp = { app: INestApplication; prisma: PrismaService; http: () => any };

// ───────────── scenario builders ─────────────
export const PDF = Buffer.from('%PDF-1.4\n%test document\n');
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
export const API = '/api/v1';

export async function uploadDoc(
  t: TestApp,
  token: string,
  o: { category: string; caseId?: string; mimeType?: string; bytes?: Buffer; fileName?: string; skipPut?: boolean },
) {
  const storage = t.app.get(Storage) as MemoryStorage;
  const bytes = o.bytes ?? PDF;
  const mimeType = o.mimeType ?? 'application/pdf';
  const req = await request(t.http())
    .post(`${API}/documents/uploads`)
    .set(bearer(token))
    .send({ category: o.category, fileName: o.fileName ?? 'scan.pdf', mimeType, sizeBytes: bytes.length, caseId: o.caseId });
  if (req.status !== 201) return { req, complete: undefined, documentId: undefined as unknown as string };
  const { documentId, upload } = req.body.data;
  if (!o.skipPut) storage.objects.set(storage.verify('put', upload.url).key, bytes);
  const complete = await request(t.http()).post(`${API}/documents/${documentId}/complete`).set(bearer(token)).send({});
  return { req, complete, documentId: documentId as string };
}

export async function buildScenario(t: TestApp) {
  const { prisma } = t;
  const users = {
    patientA: await makeUser(prisma, 'PATIENT'),
    patientB: await makeUser(prisma, 'PATIENT'),
    admin: await makeUser(prisma, 'ADMIN'),
    mc1: await makeUser(prisma, 'MEDICAL_COORDINATOR'),
    mc2: await makeUser(prisma, 'MEDICAL_COORDINATOR'),
    visa: await makeUser(prisma, 'VISA_OFFICER'),
    travel: await makeUser(prisma, 'TRAVEL_COORDINATOR'),
    finance: await makeUser(prisma, 'FINANCE'),
    doctor: await makeUser(prisma, 'DOCTOR'),
  };
  const tk: Record<keyof typeof users, string> = {} as never;
  for (const [k, u] of Object.entries(users)) tk[k as keyof typeof users] = await tokenFor(t.http, u.email);

  const created = await request(t.http()).post(`${API}/cases`).set(bearer(tk.patientA)).send({ symptoms: 'Chest pain when walking' });
  if (created.status !== 201) throw new Error(`case create failed: ${JSON.stringify(created.body)}`);
  const caseA = created.body.data.id as string;

  for (const [who, role] of [['mc1', 'MEDICAL_COORDINATOR'], ['visa', 'VISA_OFFICER'], ['travel', 'TRAVEL_COORDINATOR'], ['finance', 'FINANCE']] as const) {
    const r = await request(t.http()).post(`${API}/cases/${caseA}/assignments`).set(bearer(tk.admin)).send({ staffId: users[who].id, role });
    if (r.status !== 201) throw new Error(`assign ${who} failed: ${JSON.stringify(r.body)}`);
  }

  const docs = {
    passport: (await uploadDoc(t, tk.patientA, { category: 'PASSPORT', caseId: caseA })).documentId,
    report: (await uploadDoc(t, tk.patientA, { category: 'MEDICAL_REPORT', caseId: caseA })).documentId,
    insurance: (await uploadDoc(t, tk.patientA, { category: 'INSURANCE', caseId: caseA })).documentId,
    visaDoc: (await uploadDoc(t, tk.patientA, { category: 'VISA', caseId: caseA })).documentId,
  };
  return { users, tk, caseA, docs };
}

export const dl = (t: TestApp, token: string, id: string, purpose: 'view' | 'download' = 'download') =>
  request(t.http()).post(`${API}/documents/${id}/download-url`).set(bearer(token)).send({ purpose });
