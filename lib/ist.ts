// Helpers for working with dates in Asia/Kolkata (IST = UTC+5:30, no DST).

const IST = "en-CA"; // en-CA formats dates as YYYY-MM-DD which is what we want

function partsInIst(d: Date): { year: string; month: string; day: string } {
  const fmt = new Intl.DateTimeFormat(IST, {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { year: get("year"), month: get("month"), day: get("day") };
}

// "2026-06-26" — the date in IST corresponding to instant `d`.
export function istDateString(d: Date = new Date()): string {
  const { year, month, day } = partsInIst(d);
  return `${year}-${month}-${day}`;
}

// "2026-06" — the month in IST.
export function istMonthString(d: Date = new Date()): string {
  const { year, month } = partsInIst(d);
  return `${year}-${month}`;
}

// Day-of-week in IST. 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
export function istDayOfWeek(d: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  });
  const m: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return m[fmt.format(d)];
}

// True if it's Saturday or Sunday in IST.
export function isWeekendIst(d: Date = new Date()): boolean {
  const dow = istDayOfWeek(d);
  return dow === 0 || dow === 6;
}

// IST date string of "yesterday" relative to `d`. India has no DST so subtracting
// 24 hours and reformatting in IST is reliable.
export function istYesterdayString(d: Date = new Date()): string {
  return istDateString(new Date(d.getTime() - 24 * 60 * 60 * 1000));
}

// Hour (0..23) in IST.
export function istHour(d: Date = new Date()): number {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hour12: false,
  }).format(d);
  return parseInt(s, 10);
}

// All YYYY-MM-DD dates in a given IST month, oldest first.
export function istDatesInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}
