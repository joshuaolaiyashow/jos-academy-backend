// The JOS Workspace asks every Overview chart for ?from=&to=&interval=day|month (ISO dates, `to` exclusive).
export const CHART_INTERVALS = ['day', 'month'] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];

// Stops a hand-made query from asking for decades of daily points.
export const CHART_MAX_BUCKETS = 400;

export interface ChartWindow {
  from: Date;
  to: Date;
  interval: ChartInterval;
}

export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

const startOf = (date: Date, interval: ChartInterval): Date =>
  interval === 'month'
    ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    : new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      );

const nextBucket = (date: Date, interval: ChartInterval): Date =>
  interval === 'month'
    ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
    : new Date(
        Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate() + 1,
        ),
      );

// Every UTC day or month start in [from, to), so a quiet day still gets a zero point instead of a gap in the line.
export const bucketStarts = ({ from, to, interval }: ChartWindow): string[] => {
  const starts: string[] = [];
  for (
    let cursor = startOf(from, interval);
    cursor < to;
    cursor = nextBucket(cursor, interval)
  ) {
    starts.push(isoDate(cursor));
  }
  return starts;
};

/** The window of the same length just before this one, for a stat's `previous`. */
export const previousWindow = ({
  from,
  to,
  interval,
}: ChartWindow): ChartWindow => ({
  from: new Date(from.getTime() - (to.getTime() - from.getTime())),
  to: from,
  interval,
});

/** Null when the window is usable, otherwise the message for a 400. */
export const windowProblem = (window: ChartWindow): string | null => {
  if (window.from >= window.to) return '`from` must be before `to`';
  if (bucketStarts(window).length > CHART_MAX_BUCKETS) {
    return `Ask for at most ${CHART_MAX_BUCKETS} points`;
  }
  return null;
};

export const toSeries = (
  window: ChartWindow,
  rows: { bucket: Date; value: number }[],
): { date: string; value: number }[] => {
  const values = new Map(rows.map((row) => [isoDate(row.bucket), row.value]));
  return bucketStarts(window).map((date) => ({
    date,
    value: values.get(date) ?? 0,
  }));
};

export const percent = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

// The Overview's range switch (ANALYTICS_RANGES in jos-workspace lib/analytics.ts), for broadcast audiences, which
// take a range key instead of dates so a scheduled send still means "the last 30 days" when it goes out.
export const CHART_RANGES = {
  '7d': { label: '7 days', span: 7, interval: 'day' },
  '30d': { label: '30 days', span: 30, interval: 'day' },
  '12m': { label: '12 months', span: 12, interval: 'month' },
} as const satisfies Record<
  string,
  { label: string; span: number; interval: ChartInterval }
>;
export type ChartRange = keyof typeof CHART_RANGES;
export const CHART_RANGE_KEYS = Object.keys(CHART_RANGES) as ChartRange[];

/** UTC days ending today, or UTC months ending this month, the same window the Overview asks for. */
export const rangeWindow = (
  range: ChartRange,
  now: Date = new Date(),
): ChartWindow => {
  const { span, interval } = CHART_RANGES[range];
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (interval === 'month') {
    return {
      from: new Date(Date.UTC(year, month - span + 1, 1)),
      to: new Date(Date.UTC(year, month + 1, 1)),
      interval,
    };
  }
  const to = new Date(Date.UTC(year, month, now.getUTCDate() + 1));
  return {
    from: new Date(Date.UTC(year, month, now.getUTCDate() + 1 - span)),
    to,
    interval,
  };
};
