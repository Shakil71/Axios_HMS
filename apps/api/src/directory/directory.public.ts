import { CallHandler, Controller, ExecutionContext, Get, Injectable, Module, NestInterceptor, Param, Query, UseInterceptors } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { z } from 'zod';
import { notFound } from '../common/http/errors';
import { Paginated, ZodPipe, pageParams } from '../common/http/response';
import { PrismaService } from '../common/prisma.service';
import { Public } from '../rbac/auth-user';

const PUBLIC_CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';
/** Public directory data is CDN-cacheable; nothing here is user-specific. */
@Injectable()
class PublicCacheInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    ctx.switchToHttp().getResponse<Response>().setHeader('Cache-Control', PUBLIC_CACHE);
    return next.handle();
  }
}

const published = { status: 'PUBLISHED', deletedAt: null } as const;

const page = { page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(60).optional() };
const slug = z.string().trim().max(120).regex(/^[a-z0-9-]+$/).optional();
const q = z.string().trim().max(100).optional();

const countriesQuery = z.object({ ...page, q, featured: z.enum(['true']).optional() });
const hospitalsQuery = z.object({ ...page, q, country: slug, city: slug, specialty: slug, treatment: slug, accreditation: slug, featured: z.enum(['true']).optional() });
const doctorsQuery = z.object({
  ...page, q, country: slug, hospital: slug, specialty: slug, treatment: slug,
  language: z.string().trim().max(10).optional(), minExperience: z.coerce.number().int().min(0).max(80).optional(), featured: z.enum(['true']).optional(),
});
const treatmentsQuery = z.object({ ...page, q, category: slug, specialty: slug });

const refName = { select: { id: true, slug: true, name: true } } as const;

// Explicit selects: only public fields ever leave the API (no verifier ids, no soft-delete flags).
const hospitalCard = {
  id: true, slug: true, name: true, logoKey: true, coverImageKey: true, description: true, isFeatured: true,
  country: refName, city: refName,
  specialties: { select: { specialty: refName }, take: 6 },
  accreditations: { select: { validUntil: true, accreditation: { select: { id: true, slug: true, name: true, logoKey: true } } } },
} satisfies Prisma.HospitalSelect;

const doctorCard = {
  id: true, slug: true, fullName: true, title: true, designation: true, photoKey: true, yearsOfExperience: true, isFeatured: true,
  specialties: { select: { isPrimary: true, isSubSpecialty: true, specialty: refName } },
  hospitals: { where: { hospital: published }, select: { isPrimary: true, designation: true, hospital: { select: { id: true, slug: true, name: true, country: refName, city: refName } } } },
  languages: { select: { language: { select: { code: true, name: true } } } },
} satisfies Prisma.DoctorSelect;

const publicDoctor = { ...published, isVerified: true } as const;

@Public()
@Controller()
@UseInterceptors(PublicCacheInterceptor)
export class DirectoryPublicController {
  constructor(private readonly prisma: PrismaService) {}

  // ───────── countries ─────────

  @Get('countries')
  async countries(@Query(new ZodPipe(countriesQuery)) qy: z.infer<typeof countriesQuery>) {
    const { page: p, pageSize, skip, take } = pageParams(qy);
    const where: Prisma.CountryWhereInput = {
      ...published, isMedicalDestination: true,
      ...(qy.featured ? { isFeatured: true } : {}),
      ...(qy.q ? { name: { contains: qy.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.country.findMany({
        where, skip, take, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true, slug: true, name: true, isoCode: true, flagUrl: true, coverImageKey: true, description: true,
          startingConsultationInfo: true, isFeatured: true,
          _count: { select: { hospitals: { where: published } } },
        },
      }),
      this.prisma.country.count({ where }),
    ]);
    const items = await Promise.all(
      rows.map(async ({ _count, ...c }) => ({
        ...c,
        hospitalCount: _count.hospitals,
        popularTreatments: await this.prisma.treatment.findMany({
          where: { ...published, hospitals: { some: { hospital: { ...published, countryId: c.id } } } },
          select: { id: true, slug: true, name: true }, take: 5, orderBy: { name: 'asc' },
        }),
      })),
    );
    return new Paginated(items, { page: p, pageSize, total });
  }

  @Get('countries/:slug')
  async country(@Param('slug') slugParam: string) {
    const c = await this.prisma.country.findFirst({
      where: { slug: slugParam, ...published },
      select: {
        id: true, slug: true, name: true, isoCode: true, flagUrl: true, coverImageKey: true, description: true, whyChoose: true,
        startingConsultationInfo: true, visaInformation: true, travelInformation: true, accommodationInformation: true,
        metaTitle: true, metaDescription: true,
        cities: { where: { isMedicalHub: true }, select: { id: true, slug: true, name: true }, orderBy: { name: 'asc' } },
        visaRequirements: { select: { id: true, name: true, description: true, isMandatory: true }, orderBy: { sortOrder: 'asc' } },
        faqs: { where: { status: 'PUBLISHED' }, select: { id: true, question: true, answer: true }, orderBy: { sortOrder: 'asc' } },
        hospitals: { where: published, select: hospitalCard, orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }], take: 12 },
      },
    });
    if (!c) throw notFound('We could not find this country.');
    const [popularTreatments, doctors] = await Promise.all([
      this.prisma.treatment.findMany({ where: { ...published, hospitals: { some: { hospital: { ...published, countryId: c.id } } } }, select: { id: true, slug: true, name: true }, take: 12, orderBy: { name: 'asc' } }),
      this.prisma.doctor.findMany({ where: { ...publicDoctor, hospitals: { some: { hospital: { ...published, countryId: c.id } } } }, select: doctorCard, take: 8, orderBy: [{ isFeatured: 'desc' }, { fullName: 'asc' }] }),
    ]);
    return { ...c, popularTreatments, doctors };
  }

  // ───────── hospitals ─────────

  @Get('hospitals')
  async hospitals(@Query(new ZodPipe(hospitalsQuery)) qy: z.infer<typeof hospitalsQuery>) {
    const { page: p, pageSize, skip, take } = pageParams(qy);
    const where: Prisma.HospitalWhereInput = {
      ...published,
      country: { ...published },
      ...(qy.featured ? { isFeatured: true } : {}),
      ...(qy.country ? { country: { slug: qy.country, ...published } } : {}),
      ...(qy.city ? { city: { slug: qy.city } } : {}),
      ...(qy.specialty ? { specialties: { some: { specialty: { slug: qy.specialty } } } } : {}),
      ...(qy.treatment ? { treatments: { some: { treatment: { slug: qy.treatment, ...published } } } } : {}),
      ...(qy.accreditation ? { accreditations: { some: { accreditation: { slug: qy.accreditation } } } } : {}),
      ...(qy.q ? { OR: [{ name: { contains: qy.q, mode: 'insensitive' } }, { description: { contains: qy.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.hospital.findMany({ where, skip, take, orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }], select: hospitalCard }),
      this.prisma.hospital.count({ where }),
    ]);
    return new Paginated(rows, { page: p, pageSize, total });
  }

  @Get('hospitals/:slug')
  async hospital(@Param('slug') slugParam: string) {
    const h = await this.prisma.hospital.findFirst({
      where: { slug: slugParam, ...published, country: { ...published } },
      select: {
        ...hospitalCard,
        address: true, website: true, phone: true, email: true, emergencyPhone: true, patientInformation: true,
        internationalDeptInfo: true, medicalTourismServices: true, metaTitle: true, metaDescription: true,
        specialties: { select: { specialty: refName } },
        departments: { select: { id: true, name: true, description: true }, orderBy: { sortOrder: 'asc' } },
        facilities: { select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } },
        gallery: { select: { id: true, imageKey: true, altText: true }, orderBy: { sortOrder: 'asc' } },
        languages: { select: { language: { select: { code: true, name: true } } } },
        treatments: { where: { treatment: published }, select: { treatment: { select: { id: true, slug: true, name: true } } } },
        doctors: { where: { doctor: publicDoctor }, select: { isPrimary: true, designation: true, doctor: { select: { id: true, slug: true, fullName: true, title: true, designation: true, photoKey: true, yearsOfExperience: true, specialties: { select: { isPrimary: true, specialty: refName } } } } } },
      },
    });
    if (!h) throw notFound('We could not find this hospital.');
    return h;
  }

  // ───────── doctors ─────────

  @Get('doctors')
  async doctors(@Query(new ZodPipe(doctorsQuery)) qy: z.infer<typeof doctorsQuery>) {
    const { page: p, pageSize, skip, take } = pageParams(qy);
    const hospitalFilter: Prisma.HospitalWhereInput = {
      ...published,
      ...(qy.country ? { country: { slug: qy.country, ...published } } : {}),
      ...(qy.hospital ? { slug: qy.hospital } : {}),
    };
    const where: Prisma.DoctorWhereInput = {
      ...publicDoctor,
      hospitals: { some: { hospital: hospitalFilter } },
      ...(qy.featured ? { isFeatured: true } : {}),
      ...(qy.specialty ? { specialties: { some: { specialty: { slug: qy.specialty } } } } : {}),
      ...(qy.treatment ? { treatments: { some: { treatment: { slug: qy.treatment, ...published } } } } : {}),
      ...(qy.language ? { languages: { some: { language: { code: qy.language } } } } : {}),
      ...(qy.minExperience !== undefined ? { yearsOfExperience: { gte: qy.minExperience } } : {}),
      ...(qy.q ? { OR: [{ fullName: { contains: qy.q, mode: 'insensitive' } }, { designation: { contains: qy.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.doctor.findMany({ where, skip, take, orderBy: [{ isFeatured: 'desc' }, { fullName: 'asc' }], select: doctorCard }),
      this.prisma.doctor.count({ where }),
    ]);
    return new Paginated(rows, { page: p, pageSize, total });
  }

  @Get('doctors/:slug')
  async doctor(@Param('slug') slugParam: string) {
    const d = await this.prisma.doctor.findFirst({
      where: { slug: slugParam, ...publicDoctor },
      select: {
        ...doctorCard,
        bio: true, consultationInfo: true, metaTitle: true, metaDescription: true,
        qualifications: { select: { id: true, kind: true, title: true, institution: true, year: true, url: true }, orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] },
        treatments: { where: { treatment: published }, select: { treatment: { select: { id: true, slug: true, name: true } } } },
        appointmentTypes: { select: { type: true } },
      },
    });
    if (!d) throw notFound('We could not find this doctor.');
    return d;
  }

  // ───────── treatments ─────────

  @Get('treatment-categories')
  categories() {
    return this.prisma.treatmentCategory.findMany({
      select: { id: true, slug: true, name: true, description: true, iconKey: true, _count: { select: { treatments: { where: published } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  @Get('languages')
  languages() {
    return this.prisma.language.findMany({ select: { code: true, name: true }, orderBy: { name: 'asc' } });
  }

  @Get('accreditations')
  accreditations() {
    return this.prisma.accreditation.findMany({ select: { slug: true, name: true }, orderBy: { name: 'asc' } });
  }

  @Get('specialties')
  specialties() {
    return this.prisma.specialty.findMany({ select: { id: true, slug: true, name: true }, orderBy: { name: 'asc' } });
  }

  @Get('treatments')
  async treatments(@Query(new ZodPipe(treatmentsQuery)) qy: z.infer<typeof treatmentsQuery>) {
    const { page: p, pageSize, skip, take } = pageParams(qy);
    const where: Prisma.TreatmentWhereInput = {
      ...published,
      ...(qy.category ? { category: { slug: qy.category } } : {}),
      ...(qy.specialty ? { specialties: { some: { specialty: { slug: qy.specialty } } } } : {}),
      ...(qy.q ? { OR: [{ name: { contains: qy.q, mode: 'insensitive' } }, { summary: { contains: qy.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.treatment.findMany({ where, skip, take, orderBy: { name: 'asc' }, select: { id: true, slug: true, name: true, summary: true, category: refName } }),
      this.prisma.treatment.count({ where }),
    ]);
    return new Paginated(rows, { page: p, pageSize, total });
  }

  @Get('treatments/:slug')
  async treatment(@Param('slug') slugParam: string) {
    const t = await this.prisma.treatment.findFirst({
      where: { slug: slugParam, ...published },
      select: {
        id: true, slug: true, name: true, summary: true, description: true, symptoms: true, treatmentOptions: true, preparationInfo: true,
        metaTitle: true, metaDescription: true, category: refName,
        specialties: { select: { specialty: refName } },
        doctors: { where: { doctor: publicDoctor }, select: { doctor: { select: doctorCard } }, take: 12 },
        hospitals: { where: { hospital: published }, select: { hospital: { select: hospitalCard } }, take: 12 },
        related: { where: { relatedTreatment: published }, select: { relatedTreatment: { select: { id: true, slug: true, name: true } } } },
        faqs: { where: { status: 'PUBLISHED' }, select: { id: true, question: true, answer: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!t) throw notFound('We could not find this treatment.');
    const countries = await this.prisma.country.findMany({
      where: { ...published, hospitals: { some: { ...published, treatments: { some: { treatmentId: t.id } } } } },
      select: { id: true, slug: true, name: true, isoCode: true, flagUrl: true }, orderBy: { name: 'asc' },
    });
    return { ...t, countries };
  }

  // ───────── content ─────────

  @Get('faqs')
  faqs() {
    return this.prisma.faq.findMany({
      where: { status: 'PUBLISHED', countryId: null, treatmentId: null },
      select: { id: true, question: true, answer: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Only settings explicitly flagged public (contact details, office info). */
  @Get('settings/public')
  async publicSettings() {
    const rows = await this.prisma.systemSetting.findMany({ where: { isPublic: true }, select: { key: true, value: true } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  // ───────── visa checklist (country-specific, admin-managed) ─────────

  @Get('visa/requirements')
  async visaRequirements(@Query('country') country?: string) {
    if (!country || !/^[a-z0-9-]+$/.test(country)) throw notFound('Choose a country to see its visa checklist.');
    const c = await this.prisma.country.findFirst({
      where: { slug: country, ...published },
      select: { name: true, visaInformation: true, visaRequirements: { select: { id: true, name: true, description: true, isMandatory: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!c) throw notFound('We could not find this country.');
    return { country: c.name, information: c.visaInformation, disclaimer: 'This checklist is general guidance. Visa decisions are made by the embassy or consulate, and we cannot guarantee any outcome.', requirements: c.visaRequirements };
  }
}

@Module({ controllers: [DirectoryPublicController] })
export class DirectoryPublicModule {}
