import request from 'supertest';
import { API, TestApp, bearer, createApp, makeUser, resetDb, tokenFor } from './helpers';

describe('directory (public read + admin write)', () => {
  let t: TestApp;
  let admin: string;
  let patient: string;
  let coordinator: string;
  const post = (path: string, tok: string | undefined, body: unknown) => {
    const r = request(t.http()).post(API + path);
    return (tok ? r.set(bearer(tok)) : r).send(body as object);
  };
  const patch = (path: string, tok: string, body: unknown) => request(t.http()).patch(API + path).set(bearer(tok)).send(body as object);
  const get = (path: string) => request(t.http()).get(API + path);

  async function seedCatalog() {
    const spec = (await post('/admin/directory/specialties', admin, { name: 'Cardiology' })).body.data;
    const cat = (await post('/admin/directory/treatment-categories', admin, { name: 'Heart' })).body.data;
    const lang = (await post('/admin/directory/languages', admin, { code: 'en', name: 'English' })).body.data;
    const lang2 = (await post('/admin/directory/languages', admin, { code: 'bn', name: 'Bangla' })).body.data;
    const acc = (await post('/admin/directory/accreditations', admin, { name: 'DEMO Accreditation Body' })).body.data;
    const country = (await post('/admin/directory/countries', admin, {
      name: 'Demo Country', isoCode: 'zz', status: 'PUBLISHED', isFeatured: true,
      visaRequirements: [{ name: 'Valid passport' }, { name: 'Invitation letter', isMandatory: false }],
    })).body.data;
    const city = (await post('/admin/directory/cities', admin, { countryId: country.id, name: 'Demo City', isMedicalHub: true })).body.data;
    const treatment = (await post('/admin/directory/treatments', admin, { name: 'Demo Bypass', categoryId: cat.id, status: 'PUBLISHED', specialtyIds: [spec.id] })).body.data;
    const hospital = (await post('/admin/directory/hospitals', admin, {
      name: 'Demo General Hospital', countryId: country.id, cityId: city.id, status: 'PUBLISHED', specialtyIds: [spec.id], languageIds: [lang.id],
      treatmentIds: [treatment.id], accreditations: [{ accreditationId: acc.id }], departments: [{ name: 'Cardiac Unit' }], facilities: ['ICU'],
    })).body.data;
    return { spec, cat, lang, lang2, acc, country, city, treatment, hospital };
  }

  async function seedDoctor(c: Awaited<ReturnType<typeof seedCatalog>>, over: Record<string, unknown> = {}) {
    const res = await post('/admin/directory/doctors', admin, {
      fullName: 'Dr. Demo Person', title: 'Dr.', yearsOfExperience: 15,
      specialties: [{ specialtyId: c.spec.id, isPrimary: true }], hospitals: [{ hospitalId: c.hospital.id, isPrimary: true }],
      languageIds: [c.lang.id], treatmentIds: [c.treatment.id], appointmentTypes: ['ONLINE_CONSULTATION'],
      qualifications: [{ kind: 'DEGREE', title: 'DEMO Degree', institution: 'DEMO University', year: 2005 }],
      ...over,
    });
    return res;
  }

  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDb(t.prisma);
    admin = await tokenFor(t.http, (await makeUser(t.prisma, 'ADMIN')).email);
    patient = await tokenFor(t.http, (await makeUser(t.prisma, 'PATIENT')).email);
    coordinator = await tokenFor(t.http, (await makeUser(t.prisma, 'MEDICAL_COORDINATOR')).email);
  });
  afterAll(() => t.app.close());

  it('only staff with directory.manage can write; everyone else is refused', async () => {
    expect((await post('/admin/directory/specialties', undefined, { name: 'X' })).status).toBe(401);
    expect((await post('/admin/directory/specialties', patient, { name: 'X' })).status).toBe(403);
    expect((await post('/admin/directory/specialties', coordinator, { name: 'X' })).status).toBe(403);
    expect((await get('/admin/directory/doctors')).status).toBe(401);
    expect((await request(t.http()).get(`${API}/admin/directory/doctors`).set(bearer(patient))).status).toBe(403);
    expect((await post('/admin/directory/specialties', admin, { name: 'X Specialty' })).status).toBe(201);
  });

  it('serves published data publicly (no login) with CDN cache headers', async () => {
    await seedCatalog();
    const res = await get('/hospitals');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('s-maxage=300');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ slug: 'demo-general-hospital', country: { slug: 'demo-country' }, city: { slug: 'demo-city' } });
    expect(res.body.data[0].accreditations[0].accreditation.name).toBe('DEMO Accreditation Body');
    expect(res.body.meta).toMatchObject({ page: 1, total: 1 });
  });

  it('a doctor is hidden until verified AND published; unverifying hides them again', async () => {
    const c = await seedCatalog();
    const early = await seedDoctor(c, { status: 'PUBLISHED' });
    expect(early.status).toBe(422); // cannot publish an unverified profile

    const created = (await seedDoctor(c)).body.data;
    expect((await get('/doctors')).body.data).toHaveLength(0);
    expect((await get(`/doctors/${created.slug}`)).status).toBe(404);

    expect((await patch(`/admin/directory/doctors/${created.id}`, admin, { status: 'PUBLISHED' })).status).toBe(422);
    expect((await post(`/admin/directory/doctors/${created.id}/verify`, admin, { verified: true })).body.data.isVerified).toBe(true);
    expect((await patch(`/admin/directory/doctors/${created.id}`, admin, { status: 'PUBLISHED' })).status).toBe(200);

    const list = await get('/doctors');
    expect(list.body.data).toHaveLength(1);
    const detail = await get(`/doctors/${created.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.qualifications[0]).toMatchObject({ kind: 'DEGREE', title: 'DEMO Degree' });
    for (const secret of ['verifiedById', 'deletedAt', 'userId', 'isVerified']) expect(detail.body.data[secret]).toBeUndefined();

    const un = await post(`/admin/directory/doctors/${created.id}/verify`, admin, { verified: false });
    expect(un.body.data).toMatchObject({ isVerified: false, status: 'DRAFT' });
    expect((await get('/doctors')).body.data).toHaveLength(0);
    expect(await t.prisma.auditLog.count({ where: { action: 'directory.doctor.verify' } })).toBe(2);
  });

  it('hides drafts and archived records everywhere, including nested lists', async () => {
    const c = await seedCatalog();
    const d = (await seedDoctor(c)).body.data;
    await post(`/admin/directory/doctors/${d.id}/verify`, admin, { verified: true });
    await patch(`/admin/directory/doctors/${d.id}`, admin, { status: 'PUBLISHED' });
    expect((await get('/hospitals/demo-general-hospital')).body.data.doctors).toHaveLength(1);

    await patch(`/admin/directory/hospitals/${c.hospital.id}`, admin, { status: 'DRAFT' });
    expect((await get('/hospitals')).body.data).toHaveLength(0);
    expect((await get('/hospitals/demo-general-hospital')).status).toBe(404);
    expect((await get('/doctors')).body.data).toHaveLength(0); // doctor has no public hospital left
    expect((await get('/countries/demo-country')).body.data.hospitals).toHaveLength(0);

    await patch(`/admin/directory/hospitals/${c.hospital.id}`, admin, { status: 'PUBLISHED' });
    expect((await request(t.http()).delete(`${API}/admin/directory/hospitals/${c.hospital.id}`).set(bearer(admin))).status).toBe(204);
    expect((await get('/hospitals')).body.data).toHaveLength(0);
    expect((await request(t.http()).get(`${API}/admin/directory/hospitals`).set(bearer(admin))).body.data).toHaveLength(0);
  });

  it('supports the documented filters', async () => {
    const c = await seedCatalog();
    const other = (await post('/admin/directory/countries', admin, { name: 'Other Land', isoCode: 'yy', status: 'PUBLISHED' })).body.data;
    await post('/admin/directory/hospitals', admin, { name: 'Other Hospital', countryId: other.id, status: 'PUBLISHED' });
    const d1 = (await seedDoctor(c, { fullName: 'Dr. Senior', yearsOfExperience: 25 })).body.data;
    const d2 = (await seedDoctor(c, { fullName: 'Dr. Junior', yearsOfExperience: 3, languageIds: [c.lang2.id] })).body.data;
    for (const d of [d1, d2]) {
      await post(`/admin/directory/doctors/${d.id}/verify`, admin, { verified: true });
      await patch(`/admin/directory/doctors/${d.id}`, admin, { status: 'PUBLISHED' });
    }
    const names = async (path: string) => (await get(path)).body.data.map((x: { fullName?: string; name?: string }) => x.fullName ?? x.name).sort();

    expect(await names('/hospitals?country=demo-country')).toEqual(['Demo General Hospital']);
    expect(await names('/hospitals?country=other-land')).toEqual(['Other Hospital']);
    expect(await names('/hospitals?specialty=cardiology')).toEqual(['Demo General Hospital']);
    expect(await names('/hospitals?treatment=demo-bypass')).toEqual(['Demo General Hospital']);
    expect(await names('/hospitals?city=demo-city')).toEqual(['Demo General Hospital']);
    expect(await names('/hospitals?q=other')).toEqual(['Other Hospital']);
    expect(await names('/doctors?minExperience=10')).toEqual(['Dr. Senior']);
    expect(await names('/doctors?language=bn')).toEqual(['Dr. Junior']);
    expect(await names('/doctors?hospital=demo-general-hospital&specialty=cardiology')).toEqual(['Dr. Junior', 'Dr. Senior']);
    expect(await names('/doctors?country=other-land')).toEqual([]);
    expect(await names('/treatments?category=heart')).toEqual(['Demo Bypass']);
    expect((await get('/hospitals?pageSize=1&page=1')).body.meta).toMatchObject({ pageSize: 1, total: 2 });
    expect((await get('/hospitals?pageSize=1000')).status).toBe(422);
    expect((await get("/hospitals?country=x'%20OR%201=1")).status).toBe(422); // slug filter rejects junk
  });

  it('country and treatment detail pages assemble related public data', async () => {
    const c = await seedCatalog();
    const country = (await get('/countries/demo-country')).body.data;
    expect(country.cities).toHaveLength(1);
    expect(country.visaRequirements.map((v: { name: string }) => v.name)).toEqual(['Valid passport', 'Invitation letter']);
    expect(country.popularTreatments[0].slug).toBe('demo-bypass');
    const list = (await get('/countries')).body.data[0];
    expect(list).toMatchObject({ slug: 'demo-country', hospitalCount: 1 });
    const treatment = (await get('/treatments/demo-bypass')).body.data;
    expect(treatment.countries.map((x: { slug: string }) => x.slug)).toEqual(['demo-country']);
    expect(treatment.hospitals).toHaveLength(1);
    const visa = (await get('/visa/requirements?country=demo-country')).body.data;
    expect(visa.disclaimer).toMatch(/cannot guarantee/);
    expect(visa.requirements).toHaveLength(2);
    void c;
  });

  it('validates admin input: duplicates, dangling references, mismatched city, unknown fields', async () => {
    const c = await seedCatalog();
    expect((await post('/admin/directory/countries', admin, { name: 'Demo Country', isoCode: 'ab' })).status).toBe(409); // duplicate slug
    expect((await post('/admin/directory/hospitals', admin, { name: 'Bad', countryId: c.country.id, specialtyIds: ['00000000-0000-4000-8000-000000000000'] })).status).toBe(422);
    const other = (await post('/admin/directory/countries', admin, { name: 'Elsewhere', isoCode: 'ee' })).body.data;
    expect((await post('/admin/directory/hospitals', admin, { name: 'Wrong City', countryId: other.id, cityId: c.city.id })).status).toBe(422);
    expect((await post('/admin/directory/hospitals', admin, { name: 'Sneaky', countryId: c.country.id, deletedAt: null })).status).toBe(422);
    expect((await post('/admin/directory/hospitals', admin, { name: 'X', countryId: c.country.id, website: 'javascript:alert(1)' })).status).toBe(422);
  });

  it('PATCH only changes the fields it is given', async () => {
    const c = await seedCatalog();
    await patch(`/admin/directory/hospitals/${c.hospital.id}`, admin, { isFeatured: true, description: 'Updated' });
    const h = (await request(t.http()).get(`${API}/admin/directory/hospitals/${c.hospital.id}`).set(bearer(admin))).body.data;
    expect(h).toMatchObject({ isFeatured: true, description: 'Updated', status: 'PUBLISHED' });
    expect(h.specialties).toHaveLength(1); // relations untouched
    expect(h.departments).toHaveLength(1);
  });

  it('patients cannot pick unpublished treatments/hospitals for a case', async () => {
    const c = await seedCatalog();
    const draft = (await post('/admin/directory/treatments', admin, { name: 'Draft Treatment', categoryId: c.cat.id })).body.data;
    const res = await post('/cases', patient, { treatmentId: draft.id });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].field).toBe('treatmentId');
    const ok = await post('/cases', patient, { treatmentId: c.treatment.id, preferredCountryId: c.country.id, preferredHospitalId: c.hospital.id });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ treatment: { slug: 'demo-bypass' }, preferredHospital: { slug: 'demo-general-hospital' } });
  });
});
