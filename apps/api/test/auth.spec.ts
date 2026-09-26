import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
import { PASSWORD, bearer, createApp, login, makeUser, resetDb, TestApp } from './helpers';

const API = '/api/v1';
const CSRF = { 'X-Requested-With': 'hms-web' };

describe('auth', () => {
  let t: TestApp;
  let mail: MailService;
  beforeAll(async () => {
    t = await createApp();
    mail = t.app.get(MailService);
  });
  beforeEach(async () => {
    await resetDb(t.prisma);
    mail.outbox.length = 0;
  });
  afterAll(() => t.app.close());

  const registerBody = (over: Record<string, unknown> = {}) => ({
    fullName: 'Rahim Uddin', email: 'Rahim@Example.test', phone: '+8801711111111', password: PASSWORD, ...over,
  });
  const tokenFromMail = () => new URL(/https?:\/\/\S+/.exec(mail.outbox.at(-1)!.text)![0]).searchParams.get('token')!;

  it('registers, verifies email, logs in and reads /me', async () => {
    const reg = await request(t.http()).post(`${API}/auth/register`).send(registerBody());
    expect(reg.status).toBe(201);
    expect(mail.outbox).toHaveLength(1);

    const pending = await t.prisma.user.findUniqueOrThrow({
      where: { email: 'rahim@example.test' },
      include: { patientProfile: true, roles: { include: { role: true } } },
    });
    expect(pending.status).toBe('PENDING_VERIFICATION');
    expect(pending.patientProfile).not.toBeNull();
    expect(pending.roles.map((r) => r.role.name)).toEqual(['PATIENT']);
    expect(pending.passwordHash).toMatch(/^\$argon2id\$/);

    const token0 = tokenFromMail();
    const verify = await request(t.http()).post(`${API}/auth/verify-email`).send({ token: token0 });
    expect(verify.status).toBe(200);
    const again = await request(t.http()).post(`${API}/auth/verify-email`).send({ token: token0 });
    expect(again.status).toBe(409);

    const { token } = await login(t.http, 'rahim@example.test');
    const me = await request(t.http()).get(`${API}/auth/me`).set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ email: 'rahim@example.test', roles: ['PATIENT'], emailVerified: true, permissions: [] });
  });

  it('does not reveal whether an email is already registered', async () => {
    await request(t.http()).post(`${API}/auth/register`).send(registerBody());
    const dup = await request(t.http()).post(`${API}/auth/register`).send(registerBody({ phone: '+8801722222222' }));
    expect(dup.status).toBe(201);
    expect(await t.prisma.user.count()).toBe(1);
  });

  it('enforces the password policy and validates input with 422', async () => {
    const weak = await request(t.http()).post(`${API}/auth/register`).send(registerBody({ password: 'short' }));
    expect(weak.status).toBe(422);
    expect(weak.body).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } });
    expect(weak.body.error.details[0].field).toBe('password');
    const containsEmail = await request(t.http()).post(`${API}/auth/register`).send(registerBody({ password: 'rahim-is-great-1' }));
    expect(containsEmail.status).toBe(422);
  });

  it('rejects wrong credentials generically and locks the account after repeated failures', async () => {
    const u = await makeUser(t.prisma, 'PATIENT');
    const unknown = await login(t.http, 'nobody@example.test');
    const wrong = await login(t.http, u.email, 'Wrong-password-1');
    expect(unknown.res.status).toBe(401);
    expect(wrong.res.status).toBe(401);
    expect(wrong.res.body.error.message).toBe(unknown.res.body.error.message);

    for (let i = 0; i < 4; i++) await login(t.http, u.email, 'Wrong-password-1');
    const locked = await login(t.http, u.email); // correct password, but locked
    expect(locked.res.status).toBe(429);
    expect(await t.prisma.auditLog.count({ where: { action: 'auth.login_failed' } })).toBeGreaterThanOrEqual(5);
  });

  it('rotates refresh tokens and revokes the whole family when an old one is replayed', async () => {
    const u = await makeUser(t.prisma, 'PATIENT');
    const { cookie } = await login(t.http, u.email);
    expect(cookie).toMatch(/hms_rt=.+HttpOnly/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/);

    const r1 = await request(t.http()).post(`${API}/auth/refresh`).set(CSRF).set('Cookie', cookie!);
    expect(r1.status).toBe(200);
    const newCookie = (r1.headers['set-cookie'] as unknown as string[])[0];
    expect(newCookie).not.toEqual(cookie);

    // replay the ORIGINAL (already rotated) token after the grace window
    await t.prisma.refreshToken.updateMany({ data: { revokedAt: new Date(Date.now() - 60_000) }, where: { replacedById: { not: null } } });
    const replay = await request(t.http()).post(`${API}/auth/refresh`).set(CSRF).set('Cookie', cookie!);
    expect(replay.status).toBe(401);
    const afterReuse = await request(t.http()).post(`${API}/auth/refresh`).set(CSRF).set('Cookie', newCookie);
    expect(afterReuse.status).toBe(401);
    expect(await t.prisma.auditLog.count({ where: { action: 'auth.token_reuse' } })).toBeGreaterThanOrEqual(1);
  });

  it('lets a client whose refresh response was lost recover within the grace window, but not after logout', async () => {
    const u = await makeUser(t.prisma, 'PATIENT');
    const { cookie } = await login(t.http, u.email);
    const first = await request(t.http()).post(`${API}/auth/refresh`).set(CSRF).set('Cookie', cookie!);
    expect(first.status).toBe(200);
    const again = await request(t.http()).post(`${API}/auth/refresh`).set(CSRF).set('Cookie', cookie!);
    expect(again.status).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'auth.token_reuse', actorId: u.id } })).toBe(0);

    const latest = (again.headers['set-cookie'] as unknown as string[])[0];
    const out = await request(t.http()).post(`${API}/auth/logout`).set(CSRF).set('Cookie', latest);
    expect(out.status).toBe(204);
    const afterLogout = await request(t.http()).post(`${API}/auth/refresh`).set(CSRF).set('Cookie', cookie!);
    expect(afterLogout.status).toBe(401);
  });

  it('requires the CSRF header and a matching Origin on cookie-authenticated endpoints', async () => {
    const u = await makeUser(t.prisma, 'PATIENT');
    const { cookie } = await login(t.http, u.email);
    const noHeader = await request(t.http()).post(`${API}/auth/refresh`).set('Cookie', cookie!);
    expect(noHeader.status).toBe(403);
    const badOrigin = await request(t.http()).post(`${API}/auth/refresh`).set(CSRF).set('Origin', 'https://evil.example').set('Cookie', cookie!);
    expect(badOrigin.status).toBe(403);
  });

  it('logout revokes the refresh token family', async () => {
    const u = await makeUser(t.prisma, 'PATIENT');
    const { cookie } = await login(t.http, u.email);
    const out = await request(t.http()).post(`${API}/auth/logout`).set(CSRF).set('Cookie', cookie!);
    expect(out.status).toBe(204);
    const refresh = await request(t.http()).post(`${API}/auth/refresh`).set(CSRF).set('Cookie', cookie!);
    expect(refresh.status).toBe(401);
  });

  it('changing the password invalidates existing access tokens immediately', async () => {
    const u = await makeUser(t.prisma, 'PATIENT');
    const { token } = await login(t.http, u.email);
    const change = await request(t.http())
      .post(`${API}/auth/change-password`)
      .set(bearer(token))
      .send({ currentPassword: PASSWORD, newPassword: 'Another-Strong-Pass-7' });
    expect(change.status).toBe(200);
    const old = await request(t.http()).get(`${API}/auth/me`).set(bearer(token));
    expect(old.status).toBe(401);
    expect(old.body.error.code).toBe('SESSION_EXPIRED');
    const fresh = await request(t.http()).get(`${API}/auth/me`).set(bearer(change.body.data.accessToken));
    expect(fresh.status).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'auth.password_change' } })).toBe(1);
  });

  it('password reset works once, kills sessions, and never confirms whether the account exists', async () => {
    const u = await makeUser(t.prisma, 'PATIENT');
    const { token } = await login(t.http, u.email);
    const unknown = await request(t.http()).post(`${API}/auth/forgot-password`).send({ email: 'ghost@example.test' });
    expect(unknown.status).toBe(200);
    expect(mail.outbox).toHaveLength(0);

    const known = await request(t.http()).post(`${API}/auth/forgot-password`).send({ email: u.email });
    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    const resetToken = tokenFromMail();
    const done = await request(t.http()).post(`${API}/auth/reset-password`).send({ token: resetToken, password: 'Brand-New-Password-3' });
    expect(done.status).toBe(200);
    const reuse = await request(t.http()).post(`${API}/auth/reset-password`).send({ token: resetToken, password: 'Brand-New-Password-4' });
    expect(reuse.status).toBe(409);
    expect((await request(t.http()).get(`${API}/auth/me`).set(bearer(token))).status).toBe(401);
    expect((await login(t.http, u.email, 'Brand-New-Password-3')).res.status).toBe(200);
  });

  it('blocks unauthenticated and malformed-token access, and suspended users', async () => {
    expect((await request(t.http()).get(`${API}/auth/me`)).status).toBe(401);
    expect((await request(t.http()).get(`${API}/auth/me`).set(bearer('garbage'))).status).toBe(401);
    const u = await makeUser(t.prisma, 'PATIENT');
    const { token } = await login(t.http, u.email);
    await t.prisma.user.update({ where: { id: u.id }, data: { status: 'SUSPENDED' } });
    expect((await request(t.http()).get(`${API}/auth/me`).set(bearer(token))).status).toBe(401);
  });

  it('exposes health endpoints publicly and a consistent 404 envelope', async () => {
    expect((await request(t.http()).get(`${API}/health/live`)).body.data.status).toBe('ok');
    expect((await request(t.http()).get(`${API}/health/ready`)).status).toBe(200);
    const nf = await request(t.http()).get(`${API}/nope`);
    expect(nf.status).toBe(404);
    expect(nf.body.success).toBe(false);
  });
});
