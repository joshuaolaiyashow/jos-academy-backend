/** Admins get at least this long to review a program before it starts. */
export const PROGRAM_REVIEW_LEAD_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** OPEN takes new seats; CLOSED is running with enrollment closed; REWATCH has ended and sells as a replay. */
export type ProgramSalesPhase = 'OPEN' | 'CLOSED' | 'REWATCH';

type ProgramDates = {
  startsAt: Date;
  enrollmentClosesAt: Date;
  endsAt: Date;
};

/** Programs without a schedule (created before programs ran as cohorts) are always open. */
export const programSalesPhase = (
  dates: { enrollmentClosesAt: Date | null; endsAt: Date | null },
  now: Date,
): ProgramSalesPhase => {
  if (dates.endsAt && now >= dates.endsAt) return 'REWATCH';
  if (dates.enrollmentClosesAt && now >= dates.enrollmentClosesAt) {
    return 'CLOSED';
  }
  return 'OPEN';
};

/** The last moment a program starting at `startsAt` can be submitted for review. */
export const latestSubmitAt = (startsAt: Date): Date =>
  new Date(startsAt.getTime() - PROGRAM_REVIEW_LEAD_DAYS * MS_PER_DAY);

/** The earliest start date a program submitted `now` may have. */
export const earliestStartFor = (now: Date): Date =>
  new Date(now.getTime() + PROGRAM_REVIEW_LEAD_DAYS * MS_PER_DAY);

/** Human-readable problems with a program's dates; empty when they are in order. */
export const describeScheduleProblems = (
  dates: Partial<Record<keyof ProgramDates, Date | null>>,
): string[] => {
  const { startsAt, enrollmentClosesAt, endsAt } = dates;
  if (!startsAt || !enrollmentClosesAt || !endsAt) {
    return ['set the start date, enrollment cutoff and end date'];
  }
  const problems: string[] = [];
  if (startsAt >= endsAt) problems.push('the program must end after it starts');
  if (enrollmentClosesAt > endsAt) {
    problems.push('enrollment must close on or before the end date');
  }
  return problems;
};
