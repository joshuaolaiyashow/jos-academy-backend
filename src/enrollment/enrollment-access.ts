import { EnrollmentStatus } from '../generated/prisma/client';

/** Finishing a course must not lock a learner out of the lessons they paid for. */
export const ENROLLMENT_ACCESS_STATUSES: EnrollmentStatus[] = [
  EnrollmentStatus.ACTIVE,
  EnrollmentStatus.COMPLETED,
];

export const hasEnrollmentAccess = (status: EnrollmentStatus): boolean =>
  ENROLLMENT_ACCESS_STATUSES.includes(status);
