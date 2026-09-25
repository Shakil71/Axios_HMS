import { Injectable } from '@nestjs/common';
import { CaseStatus, TimelineEventType, Visibility } from '@prisma/client';
import { PrismaService, Tx } from '../common/prisma.service';

export interface TimelineInput {
  caseId: string;
  type: TimelineEventType;
  title: string;
  description?: string | null;
  visibility?: Visibility;
  actorId?: string | null;
  fromStatus?: CaseStatus | null;
  toStatus?: CaseStatus | null;
}

/** Timeline events live in the database; pass `tx` so the event commits with the change it records. */
@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: TimelineInput, tx?: Tx) {
    return (tx ?? this.prisma).caseTimeline.create({
      data: {
        caseId: input.caseId,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        visibility: input.visibility ?? 'PATIENT_VISIBLE',
        actorId: input.actorId ?? null,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
      },
    });
  }
}
