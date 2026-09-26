import { CohortStatus } from '../generated/prisma/client';
import {
  cohortSalesPhase,
  contentLockingCohortsWhere,
  describeCohortDateProblems,
  describeScheduleProblems,
  earliestStartFor,
  latestSubmitAt,
} from './cohort-phase';
import { MS_PER_DAY } from './cohort.constants';

const day = (offset: number) =>
  new Date(Date.UTC(2026, 9, 1) + offset * MS_PER_DAY);

describe('cohortSalesPhase', () => {
  const cohort = { enrollmentClosesAt: day(10), endsAt: day(40) };

  it('is open until enrollment closes', () => {
    expect(cohortSalesPhase(cohort, day(9))).toBe('OPEN');
  });

  it('is closed while running after the cutoff', () => {
    expect(cohortSalesPhase(cohort, day(10))).toBe('CLOSED');
  });

  it('sells as a rewatch once it has ended', () => {
    expect(cohortSalesPhase(cohort, day(40))).toBe('REWATCH');
  });
});

describe('review lead time', () => {
  it('must be submitted 7 days before it starts', () => {
    expect(latestSubmitAt(day(10))).toEqual(day(3));
  });

  it('suggests a start 7 days from now', () => {
    expect(earliestStartFor(day(0))).toEqual(day(7));
  });
});

describe('describeCohortDateProblems', () => {
  it('accepts a late-join cutoff after the start', () => {
    expect(
      describeCohortDateProblems({
        startsAt: day(0),
        enrollmentClosesAt: day(5),
        endsAt: day(30),
      }),
    ).toEqual([]);
  });

  it('rejects an end before the start and a cutoff after the end', () => {
    expect(
      describeCohortDateProblems({
        startsAt: day(10),
        enrollmentClosesAt: day(12),
        endsAt: day(9),
      }),
    ).toHaveLength(2);
  });
});

describe('describeScheduleProblems', () => {
  const dates = {
    startsAt: day(0),
    enrollmentClosesAt: day(5),
    endsAt: day(30),
  };
  const modules = [
    { id: 'm1', title: 'Basics' },
    { id: 'm2', title: 'Sensors' },
  ];

  it('names undated modules and dates outside the cohort', () => {
    expect(
      describeScheduleProblems(dates, modules, [
        { moduleId: 'm1', startsAt: day(31) },
      ]),
    ).toEqual([
      '"Basics" must start within the cohort\'s dates',
      '"Sensors" has no start date',
    ]);
  });

  it('passes a complete schedule inside the cohort', () => {
    expect(
      describeScheduleProblems(dates, modules, [
        { moduleId: 'm1', startsAt: day(0) },
        { moduleId: 'm2', startsAt: day(14) },
      ]),
    ).toEqual([]);
  });
});

describe('contentLockingCohortsWhere', () => {
  it('locks for cohorts in review or approved and not ended', () => {
    const now = day(0);
    expect(contentLockingCohortsWhere('c1', now)).toEqual({
      courseId: 'c1',
      OR: [
        { status: CohortStatus.IN_REVIEW },
        { status: CohortStatus.APPROVED, endsAt: { gt: now } },
      ],
    });
  });
});
