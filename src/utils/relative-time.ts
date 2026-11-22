const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

const relativeTimeFormat = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

/** Format a time as "3 days ago", in the largest unit that fits */
export function formatRelativeTime(
  time: string,
  now: number = Date.now(),
): string {
  const diff = new Date(time).getTime() - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) {
      return relativeTimeFormat.format(Math.trunc(diff / ms), unit);
    }
  }
  return "just now";
}
