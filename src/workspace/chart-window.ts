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
