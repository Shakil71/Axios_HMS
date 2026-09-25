import { PrismaClient } from '@prisma/client';
import * as argon2 from '@node-rs/argon2';
import { DEMO_ACCOUNTS, DEMO_PASSWORD_DEFAULT, seedDemoWorld } from '../src/demo/demo';
import { demoDatabase } from '../src/demo/demo-db';
import { syncRbac } from '../src/rbac/rbac-seed';

/** The demo world must build on the in-memory database (no external Postgres) and stay internally consistent. */
describe('demo world (in-memory Postgres)', () => {
  let prisma: PrismaClient;
  const files = new Map<string, Buffer>();

  beforeAll(async () => {
    const db = demoDatabase();
    await db.ready;
    prisma = new PrismaClient({ adapter: db.adapter } as never);
    await syncRbac(prisma);
    await seedDemoWorld(prisma, { putObject: (k, b) => files.set(k, b) });
  }, 120_000);
  afterAll(() => prisma.$disconnect());

  it('creates an account for every role that all accept the published demo password', async () => {
    for (const a of DEMO_ACCOUNTS) {
      const u = await prisma.user.findUniqueOrThrow({ where: { email: a.email }, include: { roles: { include: { role: true } }, patientProfile: true } });
      expect(u.status).toBe('ACTIVE');
      expect(u.emailVerifiedAt).not.toBeNull();
      expect(u.roles.map((r) => r.role.name)).toEqual([a.role]);
      expect(await argon2.verify(u.passwordHash, DEMO_PASSWORD_DEFAULT)).toBe(true);
      expect(!!u.patientProfile).toBe(a.role === 'PATIENT');
    }
  });

  it('links the doctor accounts to published, verified sample doctors', async () => {
    const linked = await prisma.doctor.findMany({ where: { userId: { not: null } }, include: { availability: true } });
    expect(linked.map((d) => d.slug).sort()).toEqual(['dr-ananya-sen', 'dr-farid-rahman', 'dr-rohan-iyer']);
    for (const d of linked) {
      expect(d).toMatchObject({ isDemo: true, isVerified: true, status: 'PUBLISHED' });
      expect(d.availability.length).toBeGreaterThan(0);
    }
    expect(await prisma.doctor.count({ where: { isDemo: true, verifiedById: null } })).toBe(0);
  });

  it('has cases in many statuses, each with a readable number and a timeline', async () => {
    const cases = await prisma.medicalCase.findMany({ include: { timeline: true } });
    expect(cases.length).toBeGreaterThanOrEqual(15);
    expect(new Set(cases.map((c) => c.status)).size).toBeGreaterThanOrEqual(10);
    for (const c of cases) {
      expect(c.caseNumber).toMatch(/^MC-\d{4}-\d{6}$/);
      expect(c.timeline.length).toBeGreaterThan(0);
    }
    expect(new Set(cases.map((c) => c.caseNumber)).size).toBe(cases.length);
    expect(await prisma.medicalCase.count({ where: { status: { in: ['COMPLETED', 'CANCELLED'] }, closedAt: null } })).toBe(0);
  });

  it('stores real, valid PDF files for every document and never plaintext identity numbers', async () => {
    const versions = await prisma.documentVersion.findMany();
    expect(versions.length).toBeGreaterThan(30);
    for (const v of versions) {
      const bytes = files.get(v.storageKey);
      expect(bytes?.subarray(0, 5).toString()).toBe('%PDF-');
      expect(bytes?.length).toBe(Number(v.sizeBytes));
    }
    const identity = JSON.stringify(await prisma.patientProfile.findMany({ select: { passportNumberEnc: true, nidNumberEnc: true } }));
    expect(identity).not.toContain('BX1234567');
    expect(identity).not.toContain('1990123456789');
  });

  it('covers appointments, visas with checklists, travel plans and invoices in varied states', async () => {
    expect(new Set((await prisma.appointment.findMany()).map((a) => a.status)).size).toBeGreaterThanOrEqual(3);
    expect(await prisma.appointment.count({ where: { scheduledAt: { gt: new Date() }, status: { in: ['CONFIRMED', 'REQUESTED'] } } })).toBeGreaterThan(3);
    const visas = await prisma.visaCase.findMany({ include: { documents: true } });
    expect(visas.length).toBeGreaterThanOrEqual(5);
    expect(visas.every((v) => v.documents.length > 0)).toBe(true);
    expect(await prisma.travelPlan.count()).toBeGreaterThanOrEqual(4);
    expect(await prisma.flight.count()).toBeGreaterThanOrEqual(8);
    const invoices = await prisma.invoice.findMany({ include: { payments: true } });
    expect(new Set(invoices.map((i) => i.status))).toEqual(new Set(['PAID', 'PARTIAL', 'PENDING']));
    for (const i of invoices) {
      const paid = i.payments.filter((p) => p.status === 'SUCCEEDED').reduce((s, p) => s + Number(p.amount), 0);
      expect(paid).toBeLessThanOrEqual(Number(i.total));
      if (i.status === 'PAID') expect(paid).toBe(Number(i.total));
    }
  });

  it('is idempotent and keeps the append-only audit trail intact', async () => {
    const before = await prisma.user.count();
    await seedDemoWorld(prisma, { putObject: (k, b) => files.set(k, b) });
    expect(await prisma.user.count()).toBe(before);
    expect(await prisma.auditLog.count()).toBeGreaterThan(100);
    const a = await prisma.auditLog.findFirstOrThrow();
    await expect(prisma.auditLog.delete({ where: { id: a.id } })).rejects.toThrow(/append-only/);
  });
});
