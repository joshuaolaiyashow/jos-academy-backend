import {
  bucketStarts,
  percent,
  previousWindow,
  rangeWindow,
  toSeries,
  windowProblem,
} from './chart-window';

const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

describe('chart-window', () => {
  const week = {
    from: day('2026-11-01'),
    to: day('2026-11-04'),
    interval: 'day' as const,
  };

  it('lists every day in the window, `to` exclusive', () => {
    expect(bucketStarts(week)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
  });

  it('starts monthly buckets on the first of the month', () => {
    expect(
      bucketStarts({
        from: day('2026-01-15'),
        to: day('2026-04-01'),
        interval: 'month',
      }),
    ).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  it('fills quiet buckets with zero', () => {
    expect(toSeries(week, [{ bucket: day('2026-11-02'), value: 4 }])).toEqual([
      { date: '2026-11-01', value: 0 },
      { date: '2026-11-02', value: 4 },
      { date: '2026-11-03', value: 0 },
    ]);
  });

  it('compares against the window of the same length just before', () => {
    const previous = previousWindow(week);
    expect(previous.from).toEqual(day('2026-10-29'));
    expect(previous.to).toEqual(day('2026-11-01'));
  });

  it('rejects backwards and oversized windows', () => {
    expect(windowProblem(week)).toBeNull();
    expect(windowProblem({ ...week, from: week.to, to: week.from })).toMatch(
      /before/,
    );
    expect(windowProblem({ ...week, from: day('2000-01-01') })).toMatch(
      /at most/,
    );
  });

  it('reads 0 of 0 as 0%', () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(1, 3)).toBe(33);
  });

  it('turns an Overview range into the same UTC window the workspace asks for', () => {
    const now = new Date('2026-11-27T22:30:00Z');
    expect(rangeWindow('7d', now)).toEqual({
      from: day('2026-11-21'),
      to: day('2026-11-28'),
      interval: 'day',
    });
    expect(rangeWindow('12m', now)).toEqual({
      from: day('2025-12-01'),
      to: day('2026-12-01'),
      interval: 'month',
    });
  });
});
