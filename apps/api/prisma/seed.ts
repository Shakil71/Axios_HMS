/**
 * Idempotent seed.
 *  - Always: permission catalog + system roles.
 *  - Demo data (only when SEED_DEMO=true): clearly labelled sample records so the UI has something to render.
 *    Nothing here is a real doctor, hospital claim or credential. Never run demo seeding in production.
 *
 * Required env: DATABASE_URL. For demo users: SEED_DEMO_PASSWORD (min 12 chars).
 * Optional: SEED_SUPERADMIN_EMAIL + SEED_SUPERADMIN_PASSWORD to create the first SUPER_ADMIN.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from '@node-rs/argon2';
import { syncRbac } from '../src/rbac/rbac-seed';

const prisma = new PrismaClient();
const hash = (pw: string) => argon2.hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
const DEMO = 'DEMO';

async function upsertUser(email: string, fullName: string, role: string, password: string, phone: string) {
  const r = await prisma.role.findUniqueOrThrow({ where: { name: role } });
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName, phone, passwordHash: await hash(password), status: 'ACTIVE', emailVerifiedAt: new Date(), roles: { create: { roleId: r.id } } },
  });
  if (role === 'PATIENT') await prisma.patientProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  return user;
}

async function seedDemo() {
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 12) throw new Error('SEED_DEMO_PASSWORD (min 12 chars) is required for demo seeding');
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_DEMO_IN_PRODUCTION !== 'true') throw new Error('Refusing to seed demo data in production');

  const admin = await upsertUser('admin@demo.hms.test', `${DEMO} Admin`, 'ADMIN', password, '+8801000000001');
  await upsertUser('coordinator@demo.hms.test', `${DEMO} Medical Coordinator`, 'MEDICAL_COORDINATOR', password, '+8801000000002');
  await upsertUser('patient@demo.hms.test', `${DEMO} Patient`, 'PATIENT', password, '+8801000000003');

  const languages = await Promise.all(
    [['en', 'English'], ['bn', 'Bangla'], ['hi', 'Hindi'], ['th', 'Thai'], ['tr', 'Turkish'], ['ar', 'Arabic']].map(([code, name]) =>
      prisma.language.upsert({ where: { code }, update: {}, create: { code, name } }),
    ),
  );
  const lang = (c: string) => languages.find((l) => l.code === c)!.id;

  const specialtyNames = ['Cardiology', 'Oncology', 'Neurology', 'Neurosurgery', 'Orthopedics', 'Nephrology', 'Hepatology', 'Gastroenterology', 'Urology', 'Reproductive Medicine', 'Ophthalmology', 'Dentistry', 'Pediatrics', 'Transplant Surgery', 'Plastic Surgery'];
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const specialties: Record<string, string> = {};
  for (const name of specialtyNames) {
    const s = await prisma.specialty.upsert({ where: { slug: slugify(name) }, update: {}, create: { slug: slugify(name), name } });
    specialties[name] = s.id;
  }

  const categoryDefs: [string, string][] = [
    ['Cardiology', 'Cardiology'], ['Oncology', 'Oncology'], ['Neurology', 'Neurology'], ['Neurosurgery', 'Neurosurgery'], ['Orthopedics', 'Orthopedics'],
    ['Kidney Treatment', 'Nephrology'], ['Liver Treatment', 'Hepatology'], ['Gastroenterology', 'Gastroenterology'], ['Urology', 'Urology'],
    ['IVF & Fertility', 'Reproductive Medicine'], ['Eye Treatment', 'Ophthalmology'], ['Dental', 'Dentistry'], ['Pediatrics', 'Pediatrics'],
    ['Transplant', 'Transplant Surgery'], ['Cosmetic Surgery', 'Plastic Surgery'],
  ];
  const categories: Record<string, string> = {};
  for (const [i, [name]] of categoryDefs.entries()) {
    const c = await prisma.treatmentCategory.upsert({ where: { slug: slugify(name) }, update: {}, create: { slug: slugify(name), name, sortOrder: i } });
    categories[name] = c.id;
  }

  const accreditation = await prisma.accreditation.upsert({
    where: { slug: 'demo-accreditation' }, update: {},
    create: { slug: 'demo-accreditation', name: `${DEMO} Accreditation (sample)`, description: 'Placeholder. Replace with real accreditations entered and verified by staff.' },
  });

  const countryDefs: [string, string, string, string | null][] = [
    ['India', 'IN', 'Chennai', 'Delhi'], ['Thailand', 'TH', 'Bangkok', null], ['Singapore', 'SG', 'Singapore', null],
    ['Malaysia', 'MY', 'Kuala Lumpur', null], ['Turkey', 'TR', 'Istanbul', null], ['United Arab Emirates', 'AE', 'Dubai', null],
    ['United Kingdom', 'GB', 'London', null], ['Germany', 'DE', 'Berlin', null], ['South Korea', 'KR', 'Seoul', null],
  ];
  const sample = 'Sample text for demonstration. Replace with verified content from the admin panel.';
  const countries: Record<string, { id: string; cityId: string }> = {};
  for (const [i, [name, iso, cityName, cityB]] of countryDefs.entries()) {
    const slug = slugify(name);
    const c = await prisma.country.upsert({
      where: { slug }, update: {},
      create: {
        slug, name, isoCode: iso, status: 'PUBLISHED', isFeatured: i < 5, sortOrder: i,
        description: `${DEMO}: ${sample}`, whyChoose: sample, startingConsultationInfo: 'Contact us for consultation information.',
        visaInformation: 'General guidance only. Requirements change; confirm with the embassy. No outcome is guaranteed.',
        travelInformation: sample, accommodationInformation: sample,
        visaRequirements: { create: [{ name: 'Passport valid for at least 6 months', sortOrder: 0 }, { name: 'Hospital appointment or invitation letter', sortOrder: 1 }, { name: 'Recent passport-size photograph', sortOrder: 2 }, { name: 'Medical reports', sortOrder: 3, isMandatory: false }] },
      },
    });
    const city = await prisma.city.upsert({ where: { countryId_slug: { countryId: c.id, slug: slugify(cityName) } }, update: {}, create: { countryId: c.id, slug: slugify(cityName), name: cityName, isMedicalHub: true } });
    if (cityB) await prisma.city.upsert({ where: { countryId_slug: { countryId: c.id, slug: slugify(cityB) } }, update: {}, create: { countryId: c.id, slug: slugify(cityB), name: cityB, isMedicalHub: true } });
    countries[name] = { id: c.id, cityId: city.id };
  }

  const treatmentDefs: [string, string, string][] = [
    ['Coronary Artery Bypass (CABG)', 'Cardiology', 'A surgical procedure to improve blood flow to the heart.'],
    ['Angioplasty & Stenting', 'Cardiology', 'A procedure to open narrowed heart arteries.'],
    ['Cancer Treatment Planning', 'Oncology', 'Consultation and treatment planning with an oncology team.'],
    ['Spine Surgery', 'Neurosurgery', 'Surgical treatment of spine conditions.'],
    ['Knee Replacement', 'Orthopedics', 'Replacement of a damaged knee joint.'],
    ['Kidney Transplant Evaluation', 'Transplant', 'Assessment for kidney transplantation.'],
    ['IVF Consultation', 'IVF & Fertility', 'Fertility assessment and assisted reproduction options.'],
    ['Cataract Surgery', 'Eye Treatment', 'Surgery to replace a clouded lens.'],
  ];
  const treatments: Record<string, string> = {};
  for (const [name, cat, summary] of treatmentDefs) {
    const slug = slugify(name);
    const t = await prisma.treatment.upsert({
      where: { slug }, update: {},
      create: {
        slug, name, summary: `${DEMO}: ${summary}`, description: sample, symptoms: sample, treatmentOptions: sample, preparationInfo: sample,
        status: 'PUBLISHED', categoryId: categories[cat], specialties: { create: [{ specialtyId: specialties[categoryDefs.find((c) => c[0] === cat)![1]] }] },
      },
    });
    treatments[name] = t.id;
  }

  const hospitalCountries = ['India', 'Thailand', 'Singapore', 'Malaysia', 'Turkey'];
  const hospitals: Record<string, string> = {};
  for (const [i, cn] of hospitalCountries.entries()) {
    const name = `${DEMO} General Hospital — ${countryDefs.find((c) => c[0] === cn)![2]} (sample)`;
    const slug = slugify(name);
    const h = await prisma.hospital.upsert({
      where: { slug }, update: {},
      create: {
        slug, name, countryId: countries[cn].id, cityId: countries[cn].cityId, status: 'PUBLISHED', isFeatured: i < 3,
        description: `${DEMO} hospital record for demonstration only. This is not a real hospital.`, patientInformation: sample,
        internationalDeptInfo: sample, medicalTourismServices: sample,
        specialties: { create: [{ specialtyId: specialties['Cardiology'] }, { specialtyId: specialties['Orthopedics'] }] },
        languages: { create: [{ languageId: lang('en') }] },
        treatments: { create: Object.values(treatments).slice(0, 4).map((treatmentId) => ({ treatmentId })) },
        accreditations: { create: [{ accreditationId: accreditation.id }] },
        departments: { create: [{ name: 'Cardiac Sciences', sortOrder: 0 }, { name: 'Orthopedics', sortOrder: 1 }] },
        facilities: { create: [{ name: 'Intensive care unit', sortOrder: 0 }, { name: 'International patient desk', sortOrder: 1 }] },
      },
    });
    hospitals[cn] = h.id;
  }

  // ── Sample doctors: FICTIONAL profiles for demonstration (flagged isDemo → "Sample profile" label in the UI). ──
  // Photos are generic stock portraits (see apps/web/public/images/doctors/CREDITS.md), not real doctors.
  type Slot = [days: number[], start: string, end: string, method: 'VIDEO' | 'IN_PERSON' | 'PHONE'];
  const doctorDefs: {
    name: string; designation: string; country: string; tz: string; years: number; languages: string[]; specialty: string; sub?: string;
    treatments: string[]; expertise: string[]; bio: string; slots: Slot[];
  }[] = [
    {
      name: 'Rohan Iyer', designation: 'Consultant Interventional Cardiologist', country: 'India', tz: 'Asia/Kolkata', years: 18, languages: ['en', 'hi'],
      specialty: 'Cardiology', treatments: ['Coronary Artery Bypass (CABG)', 'Angioplasty & Stenting'],
      expertise: ['Coronary artery disease', 'Heart failure follow-up', 'Second opinions before heart surgery'],
      bio: 'Interventional cardiologist who reviews reports before treatment is planned and explains the options in plain language.',
      slots: [[[1, 3, 5], '10:00', '13:00', 'VIDEO'], [[2, 4], '15:00', '17:00', 'IN_PERSON']],
    },
    {
      name: 'Ananya Sen', designation: 'Consultant in Reproductive Medicine', country: 'India', tz: 'Asia/Kolkata', years: 14, languages: ['en', 'hi', 'bn'],
      specialty: 'Reproductive Medicine', treatments: ['IVF Consultation'],
      expertise: ['Fertility assessment', 'Assisted reproduction planning', 'Bangla-speaking consultations'],
      bio: 'Fertility specialist who speaks Bangla and English and helps couples understand each stage of assessment before they travel.',
      slots: [[[1, 2, 3, 4], '11:00', '14:00', 'VIDEO'], [[6], '10:00', '12:00', 'IN_PERSON']],
    },
    {
      name: 'Farid Rahman', designation: 'Consultant Neurosurgeon', country: 'Malaysia', tz: 'Asia/Kuala_Lumpur', years: 21, languages: ['en', 'bn'],
      specialty: 'Neurosurgery', treatments: ['Spine Surgery'],
      expertise: ['Spine conditions', 'Brain and nerve surgery consultations', 'Review of MRI and CT reports'],
      bio: 'Neurosurgeon who reviews scans remotely and advises whether travel for surgery is needed, with Bangla and English consultations.',
      slots: [[[0, 2, 4], '09:00', '12:00', 'VIDEO'], [[3], '14:00', '17:00', 'IN_PERSON']],
    },
    {
      name: 'Daniel Weber', designation: 'Senior Consultant Orthopedic Surgeon', country: 'Singapore', tz: 'Asia/Singapore', years: 16, languages: ['en'],
      specialty: 'Orthopedics', treatments: ['Knee Replacement'],
      expertise: ['Joint replacement', 'Sports injuries', 'Rehabilitation planning'],
      bio: 'Orthopedic surgeon focused on joint replacement and recovery planning, including what rehabilitation to expect after returning home.',
      slots: [[[1, 2, 3, 4, 5], '09:30', '12:30', 'IN_PERSON'], [[6], '10:00', '12:00', 'VIDEO']],
    },
    {
      name: 'Marcus Lindqvist', designation: 'Consultant Medical Oncologist', country: 'Thailand', tz: 'Asia/Bangkok', years: 19, languages: ['en', 'th'],
      specialty: 'Oncology', treatments: ['Cancer Treatment Planning'],
      expertise: ['Treatment planning', 'Second opinions', 'Coordination with the patient’s home doctor'],
      bio: 'Medical oncologist who provides second opinions and treatment planning, and works with your doctor at home on follow-up care.',
      slots: [[[2, 4], '13:00', '16:00', 'VIDEO'], [[5], '09:00', '11:00', 'IN_PERSON']],
    },
    {
      name: 'Leyla Demir', designation: 'Consultant Nephrologist', country: 'Turkey', tz: 'Europe/Istanbul', years: 15, languages: ['en', 'tr', 'ar'],
      specialty: 'Nephrology', sub: 'Transplant Surgery', treatments: ['Kidney Transplant Evaluation'],
      expertise: ['Kidney disease', 'Transplant evaluation', 'Long-term kidney care'],
      bio: 'Nephrologist who guides patients and families through transplant evaluation and explains what preparation and follow-up involve.',
      slots: [[[1, 3], '10:00', '13:00', 'VIDEO'], [[4], '14:00', '16:00', 'IN_PERSON']],
    },
  ];

  const doctorSlug = (n: string) => `dr-${slugify(n)}`;
  // Replace the earlier placeholder doctors and refresh these on every seed run.
  await prisma.doctor.deleteMany({
    where: { OR: [{ slug: { in: doctorDefs.map((d) => doctorSlug(d.name)) } }, { slug: { startsWith: 'demo-', endsWith: '-sample-profile' } }] },
  });
  for (const d of doctorDefs) {
    const slug = doctorSlug(d.name);
    await prisma.doctor.create({
      data: {
        slug, fullName: d.name, title: 'Dr.', designation: `${d.designation} (sample)`, photoKey: `/images/doctors/${slug}.jpg`,
        bio: `${d.bio} SAMPLE PROFILE: this is a fictional profile for demonstration and does not describe a real doctor.`,
        yearsOfExperience: d.years, consultationInfo: 'Sample consultation information. Real fees and available slots are confirmed by your coordinator.',
        status: 'PUBLISHED', isVerified: true, isDemo: true, verifiedAt: new Date(), verifiedById: admin.id, isFeatured: true,
        specialties: { create: [{ specialtyId: specialties[d.specialty], isPrimary: true }, ...(d.sub ? [{ specialtyId: specialties[d.sub], isSubSpecialty: true }] : [])] },
        hospitals: { create: [{ hospitalId: hospitals[d.country], isPrimary: true }] },
        languages: { create: d.languages.map((c) => ({ languageId: lang(c) })) },
        treatments: { create: d.treatments.map((t) => ({ treatmentId: treatments[t] })) },
        appointmentTypes: { create: [{ type: 'ONLINE_CONSULTATION' }, { type: 'HOSPITAL_CONSULTATION' }, { type: 'SECOND_OPINION' }] },
        availability: { create: d.slots.flatMap(([days, start, end, method]) => days.map((dayOfWeek) => ({ dayOfWeek, startTime: start, endTime: end, timezone: d.tz, method }))) },
        qualifications: {
          create: [
            { kind: 'DEGREE', title: 'Doctor of Medicine (sample entry)', institution: 'Sample University of Medicine', sortOrder: 0 },
            { kind: 'CERTIFICATION', title: `Board certification in ${d.specialty} (sample entry)`, sortOrder: 1 },
            ...d.expertise.map((title, i) => ({ kind: 'EXPERTISE' as const, title, sortOrder: 10 + i })),
          ],
        },
      },
    });
  }

  const faqs: [string, string][] = [
    ['How does the process work?', 'You share your medical information, our team reviews it, and we help you with doctor and hospital options, appointments, visa documents and travel planning.'],
    ['Do you provide medical advice?', 'No. We coordinate care and paperwork. Medical advice comes only from licensed doctors.'],
    ['Are my documents safe?', 'Your documents are stored privately and only shared with staff who need them to help you. Every access is recorded.'],
  ];
  for (const [i, [question, answer]] of faqs.entries()) {
    const exists = await prisma.faq.findFirst({ where: { question } });
    if (!exists) await prisma.faq.create({ data: { question, answer, sortOrder: i, status: 'PUBLISHED' } });
  }
  const settings: [string, string][] = [
    ['contact.email', 'info@example.test'],
    ['contact.phone', '+880 0000-000000 (demo placeholder)'],
    ['contact.whatsapp', '+880 0000-000000 (demo placeholder)'],
    ['office.dhaka.address', 'Demo address, Dhaka, Bangladesh (placeholder — replace in admin settings)'],
    ['office.dhaka.hours', 'Sat–Thu, 10:00–18:00'],
  ];
  for (const [key, value] of settings) {
    await prisma.systemSetting.upsert({ where: { key }, update: {}, create: { key, value, isPublic: true, description: 'Demo placeholder' } });
  }
  console.log('Demo data seeded (admin/coordinator/patient @demo.hms.test).');
}

async function main() {
  await syncRbac(prisma);
  console.log('RBAC catalog and system roles synced.');

  const email = process.env.SEED_SUPERADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 12) throw new Error('SEED_SUPERADMIN_PASSWORD must be at least 12 characters');
    await upsertUser(email, 'Super Admin', 'SUPER_ADMIN', password, '+8801000000000');
    console.log(`SUPER_ADMIN ensured: ${email}`);
  }
  if (process.env.SEED_DEMO === 'true') await seedDemo();
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
