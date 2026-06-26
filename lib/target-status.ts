import { supabase } from "./db";

// Each ticket is assumed to take this many minutes of work. Used to convert a
// person's available hours into a ticket-count capacity.
export const MINUTES_PER_TICKET = 45;

export type TargetStatus = {
  name: string;
  status: "available" | "regression" | "leave";
  hours: number;
  notes: string | null;
  updated_at: string;
};

export function defaultStatus(name: string): TargetStatus {
  return {
    name,
    status: "available",
    hours: 8,
    notes: null,
    updated_at: new Date(0).toISOString(),
  };
}

// floor(hours * 60 / MINUTES_PER_TICKET). leave → 0 regardless of hours.
export function capacityOf(s: TargetStatus): number {
  if (s.status === "leave") return 0;
  return Math.floor((s.hours * 60) / MINUTES_PER_TICKET);
}

// Load a status row per target name. Missing rows default to available/8.
export async function loadStatuses(
  names: string[],
): Promise<Map<string, TargetStatus>> {
  const out = new Map<string, TargetStatus>();
  for (const n of names) out.set(n, defaultStatus(n));

  if (names.length === 0) return out;

  const db = supabase();
  const { data, error } = await db
    .from("target_status")
    .select("*")
    .in("name", names);
  if (error) throw error;
  for (const r of data ?? []) out.set(r.name, r as TargetStatus);

  return out;
}
