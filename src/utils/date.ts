/** "12 Oct 2026" in UTC, for dates quoted back in error messages. */
export const formatDateOnly = (date: Date): string =>
  date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
