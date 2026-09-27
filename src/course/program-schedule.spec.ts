import {
  describeScheduleProblems,
  earliestStartFor,
  latestSubmitAt,
  programSalesPhase,
} from './program-schedule';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const day = (offset: number) =>
  new Date(Date.UTC(2026, 9, 1) + offset * MS_PER_DAY);

describe('programSalesPhase', () => {
  const dates = { enrollmentClosesAt: day(10), endsAt: day(40) };

  it('is open until enrollment closes', () => {
    expect(programSalesPhase(dates, day(9))).toBe('OPEN');
  });

  it('is closed while running after the cutoff', () => {
    expect(programSalesPhase(dates, day(10))).toBe('CLOSED');
  });

  it('sells as a rewatch once it has ended', () => {
    expect(programSalesPhase(dates, day(40))).toBe('REWATCH');
  });

  it('keeps unscheduled programs open', () => {
    expect(
      programSalesPhase({ enrollmentClosesAt: null, endsAt: null }, day(0)),
    ).toBe('OPEN');
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

describe('describeScheduleProblems', () => {
  it('asks for all three dates', () => {
    expect(describeScheduleProblems({ startsAt: day(0) })).toEqual([
      'set the start date, enrollment cutoff and end date',
    ]);
  });

  it('accepts a late-join cutoff after the start', () => {
    expect(
      describeScheduleProblems({
        startsAt: day(0),
        enrollmentClosesAt: day(5),
        endsAt: day(30),
      }),
    ).toEqual([]);
  });

  it('rejects an end before the start and a cutoff after the end', () => {
    expect(
      describeScheduleProblems({
        startsAt: day(10),
        enrollmentClosesAt: day(12),
        endsAt: day(9),
      }),
    ).toHaveLength(2);
  });
});
