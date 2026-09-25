export interface Ref { id: string; slug: string; name: string }
export interface Paged<T> { data: T[]; meta: { page: number; pageSize: number; total: number } }

export interface Country {
  id: string; slug: string; name: string; isoCode: string; flagUrl: string | null; description: string | null;
  startingConsultationInfo: string | null; isFeatured: boolean; hospitalCount: number; popularTreatments: Ref[];
}
export interface CountryDetail extends Omit<Country, 'hospitalCount'> {
  whyChoose: string | null; visaInformation: string | null; travelInformation: string | null; accommodationInformation: string | null;
  metaTitle: string | null; metaDescription: string | null;
  cities: Ref[]; visaRequirements: { id: string; name: string; description: string | null; isMandatory: boolean }[];
  faqs: { id: string; question: string; answer: string }[]; hospitals: HospitalCard[]; doctors: DoctorCard[];
}
export interface HospitalCard {
  id: string; slug: string; name: string; logoKey: string | null; description: string | null; isFeatured: boolean;
  country: Ref; city: Ref | null; specialties: { specialty: Ref }[];
  accreditations: { validUntil: string | null; accreditation: { id: string; slug: string; name: string } }[];
}
export interface HospitalDetail extends HospitalCard {
  address: string | null; website: string | null; phone: string | null; email: string | null; emergencyPhone: string | null;
  patientInformation: string | null; internationalDeptInfo: string | null; medicalTourismServices: string | null;
  metaTitle: string | null; metaDescription: string | null;
  departments: { id: string; name: string; description: string | null }[]; facilities: { id: string; name: string }[];
  languages: { language: { code: string; name: string } }[]; treatments: { treatment: Ref }[];
  doctors: { isPrimary: boolean; designation: string | null; doctor: DoctorCard }[];
}
export interface DoctorCard {
  id: string; slug: string; fullName: string; title: string | null; designation: string | null; photoKey: string | null;
  yearsOfExperience: number | null; isFeatured: boolean; isDemo: boolean;
  specialties: { isPrimary: boolean; isSubSpecialty: boolean; specialty: Ref }[];
  hospitals: { isPrimary: boolean; designation: string | null; hospital: Ref & { country: Ref; city: Ref | null } }[];
  languages: { language: { code: string; name: string } }[];
}
export interface DoctorDetail extends DoctorCard {
  bio: string | null; consultationInfo: string | null; metaTitle: string | null; metaDescription: string | null;
  qualifications: { id: string; kind: string; title: string; institution: string | null; year: number | null; url: string | null }[];
  treatments: { treatment: Ref }[]; appointmentTypes: { type: string }[];
  availability: import('./schedule').Slot[];
}
export interface TreatmentCard { id: string; slug: string; name: string; summary: string | null; category: Ref }
export interface TreatmentDetail extends TreatmentCard {
  description: string | null; symptoms: string | null; treatmentOptions: string | null; preparationInfo: string | null;
  metaTitle: string | null; metaDescription: string | null; specialties: { specialty: Ref }[];
  doctors: { doctor: DoctorCard }[]; hospitals: { hospital: HospitalCard }[]; related: { relatedTreatment: Ref }[];
  faqs: { id: string; question: string; answer: string }[]; countries: (Ref & { isoCode: string; flagUrl: string | null })[];
}
export interface TreatmentCategory { id: string; slug: string; name: string; description: string | null; _count: { treatments: number } }
export interface Faq { id: string; question: string; answer: string }

// ─── portal ───
export interface Me {
  id: string; email: string; fullName: string; roles: string[]; permissions: string[]; patientProfileId: string | null; emailVerified: boolean;
}
export interface PatientProfile {
  id: string; fullName: string; email: string; phone: string | null; emailVerified: boolean;
  dateOfBirth: string | null; gender: string; countryId: string | null; city: string | null; address: string | null;
  emergencyContactName: string | null; emergencyContactPhone: string | null; emergencyContactRelation: string | null;
  passportNumber: string | null; passportExpiry: string | null; nidNumber: string | null;
  bloodGroup: string | null; allergies: string | null; chronicConditions: string | null; preferredLanguage: string | null;
  notifyEmail: boolean; notifySms: boolean; notifyWhatsapp: boolean;
}
export interface FamilyMember {
  id: string; fullName: string; relationship: string; dateOfBirth: string | null; gender: string; phone: string | null;
  passportNumber: string | null; passportExpiry: string | null; nidNumber: string | null; medicalNotes: string | null;
}
export interface CaseSummary {
  id: string; caseNumber: string; status: string; statusLabel: string; symptoms: string | null; medicalHistory: string | null;
  currentDiagnosis: string | null; previousTreatment: string | null; currentMedications: string | null; emergencyInformation: string | null;
  preferredTravelDate: string | null; budgetMin: number | null; budgetMax: number | null; budgetCurrency: string | null;
  treatment: Ref | null; preferredCountry: Ref | null; preferredHospital: Ref | null; selectedHospital: Ref | null;
  selectedDoctor: { id: string; fullName: string; slug: string } | null; familyMember: { id: string; fullName: string; relationship: string } | null;
  coordinators: { role: string; name: string }[]; closedAt: string | null; createdAt: string; updatedAt: string;
}
export interface TimelineEvent { id: string; type: string; title: string; description: string | null; occurredAt: string; toStatus: string | null }
export interface DocumentDto {
  id: string; category: string; categoryLabel: string; title: string | null; status: string; statusLabel: string;
  rejectionReason: string | null; expiresAt: string | null; caseId: string | null; familyMemberId: string | null; currentVersion: number;
  file: { fileName: string; mimeType: string; sizeBytes: number; uploadedAt: string; scanStatus: string } | null; createdAt: string;
}
export interface CaseNote { id: string; body: string; createdAt: string; author: string }
