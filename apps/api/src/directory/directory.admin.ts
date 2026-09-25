import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { AppError, notFound } from '../common/http/errors';
import { Ctx, ReqCtx } from '../common/http/request-context';
import { Paginated, ZodPipe, pageParams } from '../common/http/response';
import { PrismaService } from '../common/prisma.service';
import { AuthUser, CurrentUser, RequirePermissions, primaryRole } from '../rbac/auth-user';

// ───────────── schemas ─────────────

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const slug = z.string().trim().max(80).regex(slugRe, 'Use lowercase letters, numbers and dashes.');
const text = (n: number) => z.string().trim().max(n);
const uuid = z.uuid();
const status = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
const url = z.url().max(500);

const countrySchema = z.object({
  slug: slug.optional(), name: text(100).min(2), isoCode: z.string().length(2).toUpperCase(), flagUrl: url.nullish(),
  coverImageKey: text(300).nullish(), description: text(4000).nullish(), whyChoose: text(4000).nullish(),
  startingConsultationInfo: text(1000).nullish(), visaInformation: text(4000).nullish(), travelInformation: text(4000).nullish(),
  accommodationInformation: text(4000).nullish(), isMedicalDestination: z.boolean().optional(), isFeatured: z.boolean().optional(), sortOrder: z.number().int().optional(),
  status: status.optional(), metaTitle: text(160).nullish(), metaDescription: text(300).nullish(),
  visaRequirements: z.array(z.object({ name: text(200).min(1), description: text(1000).nullish(), isMandatory: z.boolean().default(true) })).max(50).optional(),
}).strict();

const hospitalSchema = z.object({
  slug: slug.optional(), name: text(150).min(2), countryId: uuid, cityId: uuid.nullish(), logoKey: text(300).nullish(), coverImageKey: text(300).nullish(),
  address: text(300).nullish(), website: url.nullish(), phone: text(40).nullish(), email: z.email().nullish(), emergencyPhone: text(40).nullish(),
  description: text(5000).nullish(), patientInformation: text(5000).nullish(), internationalDeptInfo: text(5000).nullish(), medicalTourismServices: text(5000).nullish(),
  isFeatured: z.boolean().optional(), status: status.optional(), metaTitle: text(160).nullish(), metaDescription: text(300).nullish(),
  specialtyIds: z.array(uuid).max(60).optional(), languageIds: z.array(uuid).max(30).optional(), treatmentIds: z.array(uuid).max(200).optional(),
  accreditations: z.array(z.object({ accreditationId: uuid, validUntil: z.coerce.date().nullish() })).max(20).optional(),
  departments: z.array(z.object({ name: text(150).min(1), description: text(1000).nullish() })).max(80).optional(),
  facilities: z.array(text(150).min(1)).max(80).optional(),
}).strict();

const doctorSchema = z.object({
  slug: slug.optional(), fullName: text(120).min(2), title: text(20).nullish(), designation: text(150).nullish(), photoKey: text(300).nullish(),
  bio: text(5000).nullish(), yearsOfExperience: z.number().int().min(0).max(80).nullish(), consultationInfo: text(2000).nullish(),
  isFeatured: z.boolean().optional(), status: status.optional(), userId: uuid.nullish(), metaTitle: text(160).nullish(), metaDescription: text(300).nullish(),
  specialties: z.array(z.object({ specialtyId: uuid, isPrimary: z.boolean().default(false), isSubSpecialty: z.boolean().default(false) })).max(20).optional(),
  hospitals: z.array(z.object({ hospitalId: uuid, isPrimary: z.boolean().default(false), designation: text(150).nullish() })).max(20).optional(),
  languageIds: z.array(uuid).max(20).optional(), treatmentIds: z.array(uuid).max(200).optional(),
  appointmentTypes: z.array(z.enum(['ONLINE_CONSULTATION', 'HOSPITAL_CONSULTATION', 'FOLLOW_UP', 'DIAGNOSTIC', 'SURGERY', 'SECOND_OPINION'])).max(6).optional(),
  qualifications: z.array(z.object({
    kind: z.enum(['DEGREE', 'CERTIFICATION', 'MEMBERSHIP', 'PUBLICATION', 'AWARD', 'EXPERTISE']),
    title: text(300).min(1), institution: text(200).nullish(), year: z.number().int().min(1900).max(2100).nullish(), url: url.nullish(),
  })).max(100).optional(),
}).strict();

const treatmentSchema = z.object({
  slug: slug.optional(), categoryId: uuid, name: text(150).min(2), summary: text(500).nullish(), description: text(8000).nullish(),
  symptoms: text(4000).nullish(), treatmentOptions: text(6000).nullish(), preparationInfo: text(4000).nullish(), status: status.optional(),
  metaTitle: text(160).nullish(), metaDescription: text(300).nullish(),
  specialtyIds: z.array(uuid).max(20).optional(), relatedTreatmentIds: z.array(uuid).max(20).optional(),
}).strict();

const lookupSchemas = {
  specialties: z.object({ slug: slug.optional(), name: text(100).min(2), description: text(1000).nullish() }).strict(),
  'treatment-categories': z.object({ slug: slug.optional(), name: text(100).min(2), description: text(1000).nullish(), iconKey: text(100).nullish(), sortOrder: z.number().int().default(0) }).strict(),
  cities: z.object({ countryId: uuid, slug: slug.optional(), name: text(100).min(2), isMedicalHub: z.boolean().default(false) }).strict(),
  languages: z.object({ code: z.string().trim().toLowerCase().regex(/^[a-z]{2,3}$/), name: text(60).min(2) }).strict(),
  accreditations: z.object({ slug: slug.optional(), name: text(150).min(2), description: text(1000).nullish(), logoKey: text(300).nullish() }).strict(),
} as const;

const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(100).optional(), status: status.optional(),
});
const verifySchema = z.object({ verified: z.boolean() }).strict();

const invalid = (field: string, message: string) => new AppError(422, 'VALIDATION_FAILED', message, [{ field, message }]);
const strip = <T extends object, K extends string>(o: T, keys: readonly K[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k as K))) as Omit<T, K>;

// ───────────── service ─────────────

@Injectable()
export class DirectoryAdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private log(user: AuthUser, ctx: ReqCtx, action: string, type: string, id: string, before?: unknown, after?: unknown, tx?: Prisma.TransactionClient) {
    return this.audit.log({ actorId: user.id, actorRole: primaryRole(user), action, resourceType: type, resourceId: id, before, after, ...ctx }, tx);
  }

  private async assertExist(model: 'specialty' | 'language' | 'treatment' | 'hospital' | 'accreditation', ids: string[], field: string) {
    if (!ids.length) return;
    const unique = [...new Set(ids)];
    const n = await (this.prisma[model] as unknown as { count(a: unknown): Promise<number> }).count({ where: { id: { in: unique } } });
    if (n !== unique.length) throw invalid(field, 'One or more selections no longer exist.');
  }

  // ─── countries ───
  async createCountry(u: AuthUser, dto: z.infer<typeof countrySchema>, ctx: ReqCtx) {
    const { visaRequirements, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.country.create({
        data: { ...data, slug: data.slug ?? slugify(data.name), visaRequirements: { create: (visaRequirements ?? []).map((v, i) => ({ ...v, sortOrder: i })) } },
      });
      await this.log(u, ctx, 'directory.country.create', 'Country', c.id, undefined, { name: c.name, status: c.status }, tx);
      return { id: c.id, slug: c.slug };
    });
  }

  async updateCountry(u: AuthUser, id: string, dto: Partial<z.infer<typeof countrySchema>>, ctx: ReqCtx) {
    const { visaRequirements, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.country.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw notFound();
      const c = await tx.country.update({ where: { id }, data });
      if (visaRequirements) {
        await tx.visaRequirement.deleteMany({ where: { countryId: id, documents: { none: {} } } });
        await tx.visaRequirement.createMany({ data: visaRequirements.map((v, i) => ({ ...v, countryId: id, sortOrder: i })) });
      }
      await this.log(u, ctx, 'directory.country.update', 'Country', id, { name: before.name, status: before.status }, { name: c.name, status: c.status }, tx);
      return { id: c.id, slug: c.slug };
    });
  }

  // ─── hospitals ───
  private async hospitalRelations(tx: Prisma.TransactionClient, id: string, dto: Partial<z.infer<typeof hospitalSchema>>) {
    if (dto.specialtyIds) { await tx.hospitalSpecialty.deleteMany({ where: { hospitalId: id } }); await tx.hospitalSpecialty.createMany({ data: [...new Set(dto.specialtyIds)].map((specialtyId) => ({ hospitalId: id, specialtyId })) }); }
    if (dto.languageIds) { await tx.hospitalLanguage.deleteMany({ where: { hospitalId: id } }); await tx.hospitalLanguage.createMany({ data: [...new Set(dto.languageIds)].map((languageId) => ({ hospitalId: id, languageId })) }); }
    if (dto.treatmentIds) { await tx.hospitalTreatment.deleteMany({ where: { hospitalId: id } }); await tx.hospitalTreatment.createMany({ data: [...new Set(dto.treatmentIds)].map((treatmentId) => ({ hospitalId: id, treatmentId })) }); }
    if (dto.accreditations) { await tx.hospitalAccreditation.deleteMany({ where: { hospitalId: id } }); await tx.hospitalAccreditation.createMany({ data: dto.accreditations.map((a) => ({ hospitalId: id, accreditationId: a.accreditationId, validUntil: a.validUntil })), skipDuplicates: true }); }
    if (dto.departments) { await tx.hospitalDepartment.deleteMany({ where: { hospitalId: id } }); await tx.hospitalDepartment.createMany({ data: dto.departments.map((d, i) => ({ ...d, hospitalId: id, sortOrder: i })) }); }
    if (dto.facilities) { await tx.hospitalFacility.deleteMany({ where: { hospitalId: id } }); await tx.hospitalFacility.createMany({ data: dto.facilities.map((name, i) => ({ hospitalId: id, name, sortOrder: i })) }); }
  }

  private async checkHospital(dto: Partial<z.infer<typeof hospitalSchema>>) {
    await this.assertExist('specialty', dto.specialtyIds ?? [], 'specialtyIds');
    await this.assertExist('language', dto.languageIds ?? [], 'languageIds');
    await this.assertExist('treatment', dto.treatmentIds ?? [], 'treatmentIds');
    await this.assertExist('accreditation', (dto.accreditations ?? []).map((a) => a.accreditationId), 'accreditations');
    if (dto.cityId && dto.countryId) {
      if ((await this.prisma.city.count({ where: { id: dto.cityId, countryId: dto.countryId } })) === 0) throw invalid('cityId', 'This city is not in the selected country.');
    }
  }

  async createHospital(u: AuthUser, dto: z.infer<typeof hospitalSchema>, ctx: ReqCtx) {
    await this.checkHospital(dto);
    const scalars = strip(dto, ['specialtyIds', 'languageIds', 'treatmentIds', 'accreditations', 'departments', 'facilities'] as const);
    return this.prisma.$transaction(async (tx) => {
      const h = await tx.hospital.create({ data: { ...scalars, slug: dto.slug ?? slugify(dto.name) } });
      await this.hospitalRelations(tx, h.id, dto);
      await this.log(u, ctx, 'directory.hospital.create', 'Hospital', h.id, undefined, { name: h.name, status: h.status }, tx);
      return { id: h.id, slug: h.slug };
    });
  }

  async updateHospital(u: AuthUser, id: string, dto: Partial<z.infer<typeof hospitalSchema>>, ctx: ReqCtx) {
    const before = await this.prisma.hospital.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound();
    await this.checkHospital({ ...dto, countryId: dto.countryId ?? before.countryId });
    const scalars = strip(dto, ['specialtyIds', 'languageIds', 'treatmentIds', 'accreditations', 'departments', 'facilities'] as const);
    return this.prisma.$transaction(async (tx) => {
      const h = await tx.hospital.update({ where: { id }, data: scalars });
      await this.hospitalRelations(tx, id, dto);
      await this.log(u, ctx, 'directory.hospital.update', 'Hospital', id, { name: before.name, status: before.status }, { name: h.name, status: h.status }, tx);
      return { id: h.id, slug: h.slug };
    });
  }

  // ─── doctors ───
  private async doctorRelations(tx: Prisma.TransactionClient, id: string, dto: Partial<z.infer<typeof doctorSchema>>) {
    if (dto.specialties) { await tx.doctorSpecialty.deleteMany({ where: { doctorId: id } }); await tx.doctorSpecialty.createMany({ data: dto.specialties.map((s) => ({ doctorId: id, ...s })), skipDuplicates: true }); }
    if (dto.hospitals) { await tx.doctorHospital.deleteMany({ where: { doctorId: id } }); await tx.doctorHospital.createMany({ data: dto.hospitals.map((h) => ({ doctorId: id, ...h })), skipDuplicates: true }); }
    if (dto.languageIds) { await tx.doctorLanguage.deleteMany({ where: { doctorId: id } }); await tx.doctorLanguage.createMany({ data: [...new Set(dto.languageIds)].map((languageId) => ({ doctorId: id, languageId })) }); }
    if (dto.treatmentIds) { await tx.doctorTreatment.deleteMany({ where: { doctorId: id } }); await tx.doctorTreatment.createMany({ data: [...new Set(dto.treatmentIds)].map((treatmentId) => ({ doctorId: id, treatmentId })) }); }
    if (dto.appointmentTypes) { await tx.doctorAppointmentType.deleteMany({ where: { doctorId: id } }); await tx.doctorAppointmentType.createMany({ data: [...new Set(dto.appointmentTypes)].map((type) => ({ doctorId: id, type })) }); }
    if (dto.qualifications) { await tx.doctorQualification.deleteMany({ where: { doctorId: id } }); await tx.doctorQualification.createMany({ data: dto.qualifications.map((q, i) => ({ ...q, doctorId: id, sortOrder: i })) }); }
  }

  private async checkDoctor(dto: Partial<z.infer<typeof doctorSchema>>) {
    await this.assertExist('specialty', (dto.specialties ?? []).map((s) => s.specialtyId), 'specialties');
    await this.assertExist('hospital', (dto.hospitals ?? []).map((h) => h.hospitalId), 'hospitals');
    await this.assertExist('language', dto.languageIds ?? [], 'languageIds');
    await this.assertExist('treatment', dto.treatmentIds ?? [], 'treatmentIds');
  }

  async createDoctor(u: AuthUser, dto: z.infer<typeof doctorSchema>, ctx: ReqCtx) {
    // A profile is public only after staff verify it against source documents.
    if (dto.status === 'PUBLISHED') throw invalid('status', 'Verify the doctor first, then publish.');
    await this.checkDoctor(dto);
    const scalars = strip(dto, ['specialties', 'hospitals', 'languageIds', 'treatmentIds', 'appointmentTypes', 'qualifications'] as const);
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.doctor.create({ data: { ...scalars, slug: dto.slug ?? slugify(dto.fullName) } });
      await this.doctorRelations(tx, d.id, dto);
      await this.log(u, ctx, 'directory.doctor.create', 'Doctor', d.id, undefined, { fullName: d.fullName, status: d.status }, tx);
      return { id: d.id, slug: d.slug };
    });
  }

  async updateDoctor(u: AuthUser, id: string, dto: Partial<z.infer<typeof doctorSchema>>, ctx: ReqCtx) {
    const before = await this.prisma.doctor.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound();
    if (dto.status === 'PUBLISHED' && !before.isVerified) throw invalid('status', 'Verify the doctor first, then publish.');
    await this.checkDoctor(dto);
    const scalars = strip(dto, ['specialties', 'hospitals', 'languageIds', 'treatmentIds', 'appointmentTypes', 'qualifications'] as const);
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.doctor.update({ where: { id }, data: scalars });
      await this.doctorRelations(tx, id, dto);
      await this.log(u, ctx, 'directory.doctor.update', 'Doctor', id, { fullName: before.fullName, status: before.status }, { fullName: d.fullName, status: d.status }, tx);
      return { id: d.id, slug: d.slug };
    });
  }

  async verifyDoctor(u: AuthUser, id: string, verified: boolean, ctx: ReqCtx) {
    const before = await this.prisma.doctor.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound();
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.doctor.update({
        where: { id },
        data: verified
          ? { isVerified: true, verifiedAt: new Date(), verifiedById: u.id }
          : { isVerified: false, verifiedAt: null, verifiedById: null, status: before.status === 'PUBLISHED' ? 'DRAFT' : before.status },
      });
      await this.log(u, ctx, 'directory.doctor.verify', 'Doctor', id, { isVerified: before.isVerified }, { isVerified: d.isVerified }, tx);
      return { id: d.id, isVerified: d.isVerified, status: d.status };
    });
  }

  // ─── treatments ───
  async createTreatment(u: AuthUser, dto: z.infer<typeof treatmentSchema>, ctx: ReqCtx) {
    await this.checkTreatment(dto);
    const { specialtyIds, relatedTreatmentIds, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.treatment.create({ data: { ...data, slug: data.slug ?? slugify(data.name) } });
      await this.treatmentRelations(tx, t.id, dto);
      await this.log(u, ctx, 'directory.treatment.create', 'Treatment', t.id, undefined, { name: t.name, status: t.status }, tx);
      return { id: t.id, slug: t.slug };
    });
  }

  private async checkTreatment(dto: Partial<z.infer<typeof treatmentSchema>>) {
    await this.assertExist('specialty', dto.specialtyIds ?? [], 'specialtyIds');
    await this.assertExist('treatment', dto.relatedTreatmentIds ?? [], 'relatedTreatmentIds');
    if (dto.categoryId && (await this.prisma.treatmentCategory.count({ where: { id: dto.categoryId } })) === 0) throw invalid('categoryId', 'Choose an existing category.');
  }

  private async treatmentRelations(tx: Prisma.TransactionClient, id: string, dto: Partial<z.infer<typeof treatmentSchema>>) {
    if (dto.specialtyIds) { await tx.treatmentSpecialty.deleteMany({ where: { treatmentId: id } }); await tx.treatmentSpecialty.createMany({ data: [...new Set(dto.specialtyIds)].map((specialtyId) => ({ treatmentId: id, specialtyId })) }); }
    if (dto.relatedTreatmentIds) { await tx.treatmentRelation.deleteMany({ where: { treatmentId: id } }); await tx.treatmentRelation.createMany({ data: [...new Set(dto.relatedTreatmentIds)].filter((r) => r !== id).map((relatedTreatmentId) => ({ treatmentId: id, relatedTreatmentId })) }); }
  }

  async updateTreatment(u: AuthUser, id: string, dto: Partial<z.infer<typeof treatmentSchema>>, ctx: ReqCtx) {
    const before = await this.prisma.treatment.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound();
    await this.checkTreatment(dto);
    const { specialtyIds, relatedTreatmentIds, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.treatment.update({ where: { id }, data });
      await this.treatmentRelations(tx, id, dto);
      await this.log(u, ctx, 'directory.treatment.update', 'Treatment', id, { name: before.name, status: before.status }, { name: t.name, status: t.status }, tx);
      return { id: t.id, slug: t.slug };
    });
  }

  // ─── archive (soft delete) ───
  async archive(u: AuthUser, entity: 'country' | 'hospital' | 'doctor' | 'treatment', id: string, ctx: ReqCtx) {
    const model = this.prisma[entity] as unknown as {
      findFirst(a: unknown): Promise<{ id: string } | null>; update(a: unknown): Promise<unknown>;
    };
    const row = await model.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      await (tx[entity] as unknown as { update(a: unknown): Promise<unknown> }).update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
      await this.log(u, ctx, `directory.${entity}.archive`, entity, id, undefined, undefined, tx);
    });
  }

  // ─── lookups & admin lists ───
  async createLookup(u: AuthUser, kind: keyof typeof lookupSchemas, dto: Record<string, unknown>, ctx: ReqCtx) {
    const d = dto as { slug?: string; name?: string };
    const withSlug = 'slug' in lookupSchemas[kind].shape ? { ...dto, slug: d.slug ?? slugify(d.name ?? '') } : dto;
    const delegate: Record<keyof typeof lookupSchemas, { create(a: unknown): Promise<{ id: string }> }> = {
      specialties: this.prisma.specialty as never, 'treatment-categories': this.prisma.treatmentCategory as never,
      cities: this.prisma.city as never, languages: this.prisma.language as never, accreditations: this.prisma.accreditation as never,
    };
    const row = await delegate[kind].create({ data: withSlug });
    await this.log(u, ctx, `directory.${kind}.create`, kind, row.id);
    return row;
  }

  async lookups() {
    const [specialties, categories, languages, accreditations, cities, countries] = await Promise.all([
      this.prisma.specialty.findMany({ select: { id: true, slug: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.treatmentCategory.findMany({ select: { id: true, slug: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.language.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.accreditation.findMany({ select: { id: true, slug: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.city.findMany({ select: { id: true, slug: true, name: true, countryId: true }, orderBy: { name: 'asc' } }),
      this.prisma.country.findMany({ where: { deletedAt: null }, select: { id: true, slug: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return { specialties, categories, languages, accreditations, cities, countries };
  }

  async list(entity: 'country' | 'hospital' | 'doctor' | 'treatment', q: z.infer<typeof listQuery>) {
    const { page, pageSize, skip, take } = pageParams(q);
    const nameField = entity === 'doctor' ? 'fullName' : 'name';
    const where = { deletedAt: null, ...(q.status ? { status: q.status } : {}), ...(q.q ? { [nameField]: { contains: q.q, mode: 'insensitive' } } : {}) };
    const delegate = this.prisma[entity] as unknown as { findMany(a: unknown): Promise<unknown[]>; count(a: unknown): Promise<number> };
    const select = { id: true, slug: true, [nameField]: true, status: true, updatedAt: true, ...(entity === 'doctor' ? { isVerified: true } : {}) };
    const [rows, total] = await Promise.all([delegate.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' }, select }), delegate.count({ where })]);
    return new Paginated(rows, { page, pageSize, total });
  }

  async getOne(entity: 'country' | 'hospital' | 'doctor' | 'treatment', id: string) {
    const include: Record<typeof entity, unknown> = {
      country: { visaRequirements: true },
      hospital: { departments: true, facilities: true, accreditations: true, specialties: true, languages: true, treatments: true },
      doctor: { qualifications: true, specialties: true, hospitals: true, languages: true, treatments: true, appointmentTypes: true },
      treatment: { specialties: true, related: true },
    };
    const delegate = this.prisma[entity] as unknown as { findFirst(a: unknown): Promise<unknown> };
    const row = await delegate.findFirst({ where: { id, deletedAt: null }, include: include[entity] });
    if (!row) throw notFound();
    return row;
  }
}

// ───────────── controller ─────────────

const uuidPipe = () => new ParseUUIDPipe();
const partial = <T extends z.ZodObject<z.ZodRawShape>>(s: T) => new ZodPipe(s.partial());

@Controller('admin/directory')
@RequirePermissions('directory.manage')
export class DirectoryAdminController {
  constructor(private readonly svc: DirectoryAdminService) {}

  @Get('lookups') lookups() { return this.svc.lookups(); }

  @Get('countries') countries(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) { return this.svc.list('country', q); }
  @Get('countries/:id') country(@Param('id', uuidPipe()) id: string) { return this.svc.getOne('country', id); }
  @Post('countries') createCountry(@CurrentUser() u: AuthUser, @Body(new ZodPipe(countrySchema)) d: z.infer<typeof countrySchema>, @Ctx() c: ReqCtx) { return this.svc.createCountry(u, d, c); }
  @Patch('countries/:id') updateCountry(@CurrentUser() u: AuthUser, @Param('id', uuidPipe()) id: string, @Body(partial(countrySchema)) d: Partial<z.infer<typeof countrySchema>>, @Ctx() c: ReqCtx) { return this.svc.updateCountry(u, id, d, c); }
  @Delete('countries/:id') @HttpCode(204) async archiveCountry(@CurrentUser() u: AuthUser, @Param('id', uuidPipe()) id: string, @Ctx() c: ReqCtx) { await this.svc.archive(u, 'country', id, c); }

  @Get('hospitals') hospitals(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) { return this.svc.list('hospital', q); }
  @Get('hospitals/:id') hospital(@Param('id', uuidPipe()) id: string) { return this.svc.getOne('hospital', id); }
  @Post('hospitals') createHospital(@CurrentUser() u: AuthUser, @Body(new ZodPipe(hospitalSchema)) d: z.infer<typeof hospitalSchema>, @Ctx() c: ReqCtx) { return this.svc.createHospital(u, d, c); }
  @Patch('hospitals/:id') updateHospital(@CurrentUser() u: AuthUser, @Param('id', uuidPipe()) id: string, @Body(partial(hospitalSchema)) d: Partial<z.infer<typeof hospitalSchema>>, @Ctx() c: ReqCtx) { return this.svc.updateHospital(u, id, d, c); }
  @Delete('hospitals/:id') @HttpCode(204) async archiveHospital(@CurrentUser() u: AuthUser, @Param('id', uuidPipe()) id: string, @Ctx() c: ReqCtx) { await this.svc.archive(u, 'hospital', id, c); }

  @Get('doctors') doctors(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) { return this.svc.list('doctor', q); }
  @Get('doctors/:id') doctor(@Param('id', uuidPipe()) id: string) { return this.svc.getOne('doctor', id); }
  @Post('doctors') createDoctor(@CurrentUser() u: AuthUser, @Body(new ZodPipe(doctorSchema)) d: z.infer<typeof doctorSchema>, @Ctx() c: ReqCtx) { return this.svc.createDoctor(u, d, c); }
  @Patch('doctors/:id') updateDoctor(@CurrentUser() u: AuthUser, @Param('id', uuidPipe()) id: string, @Body(partial(doctorSchema)) d: Partial<z.infer<typeof doctorSchema>>, @Ctx() c: ReqCtx) { return this.svc.updateDoctor(u, id, d, c); }
  @Post('doctors/:id/verify') @HttpCode(200) verifyDoctor(@CurrentUser() u: AuthUser, @Param('id', uuidPipe()) id: string, @Body(new ZodPipe(verifySchema)) d: { verified: boolean }, @Ctx() c: ReqCtx) { return this.svc.verifyDoctor(u, id, d.verified, c); }
  @Delete('doctors/:id') @HttpCode(204) async archiveDoctor(@CurrentUser() u: AuthUser, @Param('id', uuidPipe()) id: string, @Ctx() c: ReqCtx) { await this.svc.archive(u, 'doctor', id, c); }

  @Get('treatments') treatments(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) { return this.svc.list('treatment', q); }
  @Get('treatments/:id') treatment(@Param('id', uuidPipe()) id: string) { return this.svc.getOne('treatment', id); }
  @Post('treatments') createTreatment(@CurrentUser() u: AuthUser, @Body(new ZodPipe(treatmentSchema)) d: z.infer<typeof treatmentSchema>, @Ctx() c: ReqCtx) { return this.svc.createTreatment(u, d, c); }
  @Patch('treatments/:id') updateTreatment(@CurrentUser() u: AuthUser, @Param('id', uuidPipe()) id: string, @Body(partial(treatmentSchema)) d: Partial<z.infer<typeof treatmentSchema>>, @Ctx() c: ReqCtx) { return this.svc.updateTreatment(u, id, d, c); }
  @Delete('treatments/:id') @HttpCode(204) async archiveTreatment(@CurrentUser() u: AuthUser, @Param('id', uuidPipe()) id: string, @Ctx() c: ReqCtx) { await this.svc.archive(u, 'treatment', id, c); }

  @Post('specialties') specialty(@CurrentUser() u: AuthUser, @Body(new ZodPipe(lookupSchemas.specialties)) d: Record<string, unknown>, @Ctx() c: ReqCtx) { return this.svc.createLookup(u, 'specialties', d, c); }
  @Post('treatment-categories') category(@CurrentUser() u: AuthUser, @Body(new ZodPipe(lookupSchemas['treatment-categories'])) d: Record<string, unknown>, @Ctx() c: ReqCtx) { return this.svc.createLookup(u, 'treatment-categories', d, c); }
  @Post('cities') city(@CurrentUser() u: AuthUser, @Body(new ZodPipe(lookupSchemas.cities)) d: Record<string, unknown>, @Ctx() c: ReqCtx) { return this.svc.createLookup(u, 'cities', d, c); }
  @Post('languages') language(@CurrentUser() u: AuthUser, @Body(new ZodPipe(lookupSchemas.languages)) d: Record<string, unknown>, @Ctx() c: ReqCtx) { return this.svc.createLookup(u, 'languages', d, c); }
  @Post('accreditations') accreditation(@CurrentUser() u: AuthUser, @Body(new ZodPipe(lookupSchemas.accreditations)) d: Record<string, unknown>, @Ctx() c: ReqCtx) { return this.svc.createLookup(u, 'accreditations', d, c); }
}

@Module({ controllers: [DirectoryAdminController], providers: [DirectoryAdminService] })
export class DirectoryAdminModule {}
