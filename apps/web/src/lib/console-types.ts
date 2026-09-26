export interface Ref { id: string; name: string; slug?: string }
export interface PersonRef { id: string; fullName: string }

export interface CaseRow {
  id: string; caseNumber: string; status: string; statusLabel: string; priority: string; symptoms: string | null; medicalHistory: string | null; currentDiagnosis: string | null;
  previousTreatment: string | null; currentMedications: string | null; emergencyInformation: string | null; preferredTravelDate: string | null;
  budgetMin: number | null; budgetMax: number | null; budgetCurrency: string | null; treatment: Ref | null; preferredCountry: Ref | null; preferredHospital: Ref | null; selectedHospital: Ref | null;
  selectedDoctor: { id: string; fullName: string; slug: string } | null; familyMember: { id: string; fullName: string; relationship: string } | null;
  patient: PersonRef; assignments: { id: string; role: string; staff: PersonRef; assignedAt: string }[]; createdAt: string; updatedAt: string; closedAt: string | null;
}
export interface TimelineRow { id: string; type: string; title: string; description: string | null; occurredAt: string; visibility?: 'INTERNAL' | 'PATIENT_VISIBLE'; actor?: string | null; toStatus: string | null }
export interface NoteRow { id: string; body: string; createdAt: string; author: string; visibility?: 'INTERNAL' | 'PATIENT_VISIBLE' }

export interface DocRow {
  id: string; category: string; categoryLabel: string; sensitivity: string; title: string | null; status: string; statusLabel: string; rejectionReason: string | null; expiresAt: string | null;
  caseId: string | null; caseNumber?: string | null; patient?: PersonRef; currentVersion: number; createdAt: string;
  file: { fileName: string; mimeType: string; sizeBytes: number; uploadedAt: string; scanStatus: string } | null;
}

export interface ApptRow {
  id: string; scheduledAt: string; durationMinutes: number; timezone: string; type: string; method: string; status: string; notes: string | null; internalNotes?: string | null; meetingUrl: string | null;
  doctor: { id: string; fullName: string; slug: string; photoKey: string | null; title: string | null } | null; hospital: { id: string; name: string; slug: string } | null;
  case: { id: string; caseNumber: string; status: string }; patient?: PersonRef;
}

export interface VisaRow {
  id: string; status: string; statusLabel: string; country: { id: string; name: string; slug: string; isoCode: string }; case: { id: string; caseNumber: string }; referenceNumber: string | null;
  applicationDate: string | null; decisionDate: string | null; expectedProcessingInfo: string | null; patientRemarks: string | null; internalRemarks?: string | null; officer?: PersonRef | null;
  patient?: PersonRef; missingCount: number; disclaimer: string; updatedAt: string;
  checklist: { id: string; name: string; description: string | null; isMandatory: boolean; status: string; remarks: string | null; documentId: string | null; documentStatus: string | null }[];
}

export interface TravelRow {
  id: string; caseId: string; case: { id: string; caseNumber: string; hospital: string | null }; patient?: PersonRef; travelerCount: number; localCoordinatorName: string | null; localCoordinatorPhone: string | null;
  emergencyContactName: string | null; emergencyContactPhone: string | null; notes: string | null; nextMilestone: string | null; updatedAt: string;
  flights: { id: string; direction: string; airline: string | null; flightNumber: string | null; departureAirport: string; arrivalAirport: string; departureAt: string; arrivalAt: string | null; bookingReference: string | null }[];
  hotels: { id: string; name: string; address: string | null; phone: string | null; checkInDate: string; checkOutDate: string | null; bookingReference: string | null; roomInfo: string | null }[];
  transports: { id: string; type: string; pickupLocation: string | null; dropLocation: string | null; scheduledAt: string | null; driverName: string | null; driverPhone: string | null; vehicleInfo: string | null }[];
}

export interface InvoiceRow {
  id: string; invoiceNumber: string; status: string; currency: string; case: { id: string; caseNumber: string }; patient?: PersonRef; subtotal: number; discount: number; tax: number; total: number; paid: number; balance: number;
  issuedAt: string; dueDate: string | null; notes: string | null; overdue: boolean;
  items: { id: string; description: string; quantity: number; unitPrice: number; amount: number }[];
  payments: { id: string; amount: number; currency: string; method: string; status: string; transactionId: string | null; receiptNumber: string | null; paidAt: string | null }[];
}

export interface Slot { id?: string; dayOfWeek: number; startTime: string; endTime: string; timezone: string; method: 'IN_PERSON' | 'VIDEO' | 'PHONE'; notes?: string | null }

export interface Workspace {
  kind: 'staff' | 'doctor'; roles: string[];
  cases: { active: number; urgent: number; byStatus: { status: string; label: string; count: number }[]; recent: { id: string; caseNumber: string; status: string; statusLabel: string; priority: string; treatment: string | null; country: string | null; patient: PersonRef; updatedAt: string; createdAt: string }[] };
  documents: { total: number; items: DocRow[] };
  appointments: { upcoming: ApptRow[]; upcomingTotal: number; todayTotal: number };
  visa: { open: number; items: VisaRow[] } | null;
  travel: { total: number; items: TravelRow[] } | null;
  invoices: { pending: number; partial: number; items: InvoiceRow[] } | null;
  unreadNotifications: number;
  doctor: null | {
    id: string; slug: string; fullName: string; title: string | null; designation: string | null; photoKey: string | null; isVerified: boolean; status: string; isDemo: boolean; yearsOfExperience: number | null; bio: string | null;
    specialties: { isPrimary: boolean; specialty: { name: string } }[]; hospitals: { isPrimary: boolean; hospital: { name: string; city: { name: string } | null; country: { name: string } } }[]; availability: Slot[];
    stats: { appointmentsNext7Days: number; completedLast30Days: number; activePatients: number };
  };
}

export interface AdminOverview {
  kpis: {
    totalPatients: number; newPatients30d: number; activeCases: number; pendingDocuments: number; pendingVisaCases: number; upcomingAppointments: number; treatmentInProgress: number;
    urgentCases: number; unassignedCases: number; rejectedDocuments: number; revenue: { currency: string; total: number }[]; revenueThisMonth: { currency: string; total: number }[];
    outstanding: { currency: string; total: number }[]; overdueInvoices: number;
  };
  casesByStatus: { status: string; count: number }[]; casesPerDay: { date: string; count: number }[]; revenueByMonth: { month: string; currency: string; total: number }[];
  casesByCountry: { name: string; count: number }[]; topTreatments: { name: string; count: number }[]; documentsByStatus: { status: string; count: number }[];
  staffWorkload: { staffId: string; fullName: string; roles: string[]; activeCases: number }[];
  recentActivity: { id: string; action: string; resourceType: string; at: string; actor: string | null; role: string | null }[]; generatedAt: string;
}

export interface UserRow { id: string; fullName: string; email: string; phone: string | null; status: string; roles: string[]; lastLoginAt: string | null; createdAt: string; emailVerified: boolean; doctor: { id: string; slug: string } | null }
export interface RoleRow { id: string; name: string; description: string | null; isSystem: boolean; userCount: number; permissions: string[] }
export interface AuditRow { id: string; action: string; resourceType: string; resourceId: string | null; actor: { id: string; fullName: string; email: string } | null; actorRole: string | null; ip: string | null; userAgent: string | null; before: unknown; after: unknown; metadata: unknown; createdAt: string }
export interface PatientRow {
  id: string; fullName: string; email: string; phone: string | null; emailVerified: boolean; dateOfBirth: string | null; gender: string; city: string | null; address: string | null; createdAt: string;
  emergencyContactName: string | null; emergencyContactPhone: string | null; emergencyContactRelation: string | null; passportNumber: string | null; passportExpiry: string | null; nidNumber: string | null;
  bloodGroup: string | null; allergies: string | null; chronicConditions: string | null; preferredLanguage: string | null;
}
export interface NotifRow { id: string; type: string; title: string; body: string | null; entityType: string | null; entityId: string | null; readAt: string | null; createdAt: string }
export interface StaffPick { id: string; fullName: string; roles: string[]; activeCases: number }
