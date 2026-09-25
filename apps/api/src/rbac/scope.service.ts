import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { forbidden, notFound } from '../common/http/errors';
import { AuthUser, can } from './auth-user';

/**
 * Object-level authorization. Every access to an individual patient/case/document goes
 * through here — controller-level permission checks alone are never enough.
 *
 * Model:  patient  -> only records they own
 *         staff    -> `<module>.<action>.all` sees everything, `<module>.<action>` sees only
 *                     cases they are actively assigned to (or, for doctors, linked to)
 */
@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  isStaff(user: AuthUser) {
    return user.permissions.size > 0;
  }

  assignedWhere(user: AuthUser): Prisma.MedicalCaseWhereInput {
    return {
      OR: [
        { assignments: { some: { staffId: user.id, unassignedAt: null } } },
        { selectedDoctor: { userId: user.id } },
      ],
    };
  }

  /** Where-clause limiting MedicalCase to what `user` may touch; null = no access at all. */
  caseWhere(user: AuthUser, action: 'view' | 'edit'): Prisma.MedicalCaseWhereInput | null {
    if (this.isStaff(user)) {
      if (can(user, `cases.${action}.all`)) return { deletedAt: null };
      if (can(user, `cases.${action}`)) return { deletedAt: null, ...this.assignedWhere(user) };
      return null;
    }
    if (user.patientProfileId && action === 'view') return { deletedAt: null, patientId: user.patientProfileId };
    return null;
  }

  patientWhere(user: AuthUser, action: 'view' | 'edit'): Prisma.PatientProfileWhereInput | null {
    if (this.isStaff(user)) {
      if (can(user, `patients.${action}.all`)) return { deletedAt: null };
      if (can(user, `patients.${action}`)) {
        return { deletedAt: null, cases: { some: { deletedAt: null, ...this.assignedWhere(user) } } };
      }
      return null;
    }
    if (user.patientProfileId) return { deletedAt: null, id: user.patientProfileId };
    return null;
  }

  /** 404 (not 403) when out of scope, so IDs cannot be probed. */
  async findCase<T extends Prisma.MedicalCaseSelect>(user: AuthUser, id: string, action: 'view' | 'edit', select: T) {
    const where = this.caseWhere(user, action);
    if (!where) throw forbidden();
    const found = await this.prisma.medicalCase.findFirst({ where: { id, ...where }, select });
    if (!found) throw notFound('We could not find this treatment case.');
    return found;
  }

  /** Is this staff user assigned to (or doctor-linked with) a case of the patient (optionally a specific case)? */
  async staffReachesPatient(user: AuthUser, patientId: string, caseId: string | null) {
    const count = await this.prisma.medicalCase.count({
      where: { patientId, deletedAt: null, ...(caseId ? { id: caseId } : {}), ...this.assignedWhere(user) },
    });
    return count > 0;
  }
}

@Global()
@Module({ providers: [ScopeService], exports: [ScopeService] })
export class RbacModule {}
