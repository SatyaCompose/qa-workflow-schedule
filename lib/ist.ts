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
