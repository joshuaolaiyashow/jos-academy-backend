import { CohortStatus, Prisma } from '../generated/prisma/client';
import { COHORT_REVIEW_LEAD_DAYS, MS_PER_DAY } from './cohort.constants';

/** OPEN takes new seats; CLOSED is running with seats closed; REWATCH has ended and sells as a replay. */
export type CohortSalesPhase = 'OPEN' | 'CLOSED' | 'REWATCH';

type CohortDates = {
  startsAt: Date;
  enrollmentClosesAt: Date;
  endsAt: Date;
};

export const cohortSalesPhase = (
  cohort: Pick<CohortDates, 'enrollmentClosesAt' | 'endsAt'>,
  now: Date,
): CohortSalesPhase => {
  if (now >= cohort.endsAt) return 'REWATCH';
  if (now >= cohort.enrollmentClosesAt) return 'CLOSED';
  return 'OPEN';
};

/** The last moment a cohort starting at `startsAt` can be submitted for review. */
export const latestSubmitAt = (startsAt: Date): Date =>
  new Date(startsAt.getTime() - COHORT_REVIEW_LEAD_DAYS * MS_PER_DAY);

/** The earliest start date a cohort submitted `now` may have. */
export const earliestStartFor = (now: Date): Date =>
  new Date(now.getTime() + COHORT_REVIEW_LEAD_DAYS * MS_PER_DAY);

/** Creators may change a cohort until an admin picks it up, and again after changes are requested. */
export const CREATOR_EDITABLE_COHORT_STATUSES: readonly CohortStatus[] = [
  CohortStatus.DRAFT,
  CohortStatus.PENDING_REVIEW,
  CohortStatus.CHANGES_REQUESTED,
];

/** Human-readable problems with a cohort's own dates; empty when they are in order. */
export const describeCohortDateProblems = (dates: CohortDates): string[] => {
  const problems: string[] = [];
  if (dates.startsAt >= dates.endsAt) {
    problems.push('the cohort must end after it starts');
  }
  if (dates.enrollmentClosesAt > dates.endsAt) {
    problems.push('enrollment must close on or before the end date');
  }
  return problems;
};

/** Problems with the module schedule: every module dated, each date inside the cohort. */
export const describeScheduleProblems = (
  dates: CohortDates,
  modules: { id: string; title: string }[],
  schedule: { moduleId: string; startsAt: Date }[],
): string[] => {
  const startsByModule = new Map(
    schedule.map((entry) => [entry.moduleId, entry.startsAt]),
  );
  return modules.flatMap((module) => {
    const startsAt = startsByModule.get(module.id);
    if (!startsAt) return [`"${module.title}" has no start date`];
    if (startsAt < dates.startsAt || startsAt >= dates.endsAt) {
      return [`"${module.title}" must start within the cohort's dates`];
    }
    return [];
  });
};

/** Cohorts that freeze their program's content: in review, or approved and not yet ended. */
export const contentLockingCohortsWhere = (
  courseId: Prisma.CohortWhereInput['courseId'],
  now: Date,
): Prisma.CohortWhereInput => ({
  courseId,
  OR: [
    { status: CohortStatus.IN_REVIEW },
    { status: CohortStatus.APPROVED, endsAt: { gt: now } },
  ],
});
