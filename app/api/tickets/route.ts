import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabase } from "@/lib/db";
import { istDateString } from "@/lib/ist";
import { capacityOf, defaultStatus, loadStatuses, MINUTES_PER_TICKET } from "@/lib/target-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabase();

  let sprintOrder: string[] = [];
  let configuredTargets: { gid: string; name: string; asana_gid: string | null }[] = [];
  try {
    const c = config();
    sprintOrder = c.sprintPrefixes;
    configuredTargets = c.targets;
  } catch (e) {
    // Surface the failure to logs so debugging "why is sprintOrder empty?" is easy.
    console.warn("[api/tickets] config() failed; sprint order will fall back to numeric extraction. Reason:", (e as Error).message);
  }

  const [{ data: tickets, error: tErr }, { data: lastRun, error: rErr }, { data: comps, error: cErr }, { data: pens, error: pErr }] =
    await Promise.all([
      db
        .from("tickets")
        .select("*")
        .order("archived", { ascending: true })
        .order("assigned_to", { ascending: true })
        .order("first_seen", { ascending: true }),
      db
        .from("sync_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("completions")
        .select("completed_by, completed_date")
        .order("completed_at", { ascending: false })
        .limit(2000),
      db
        .from("penalties")
        .select("penalized_to, penalized_date")
        .order("penalized_at", { ascending: false })
        .limit(2000),
    ]);

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const targets =
    configuredTargets.length > 0
      ? configuredTargets.map((t) => ({ gid: t.gid, name: t.name }))
      : (() => {
          const m = new Map<string, string>();
          for (const t of tickets ?? []) {
            if (t.assigned_to_gid && !m.has(t.assigned_to_gid)) {
              m.set(t.assigned_to_gid, t.assigned_to);
            }
          }
          return [...m.entries()].map(([gid, name]) => ({ gid, name }));
        })();

  const statuses = await loadStatuses(targets.map((t) => t.name));

  const today = istDateString();
  const monthPrefix = today.slice(0, 7); // YYYY-MM

  const activeByName = new Map<string, number>();
  for (const t of tickets ?? []) {
    if (!t.archived) activeByName.set(t.assigned_to, (activeByName.get(t.assigned_to) ?? 0) + 1);
  }

  const compTotalByName = new Map<string, number>();
  const compTodayByName = new Map<string, number>();
  const compMonthByName = new Map<string, number>();
  for (const c of comps ?? []) {
    compTotalByName.set(c.completed_by, (compTotalByName.get(c.completed_by) ?? 0) + 1);
    if (c.completed_date === today)
      compTodayByName.set(c.completed_by, (compTodayByName.get(c.completed_by) ?? 0) + 1);
    if (typeof c.completed_date === "string" && c.completed_date.startsWith(monthPrefix))
      compMonthByName.set(c.completed_by, (compMonthByName.get(c.completed_by) ?? 0) + 1);
  }

  const penTotalByName = new Map<string, number>();
  const penTodayByName = new Map<string, number>();
  const penMonthByName = new Map<string, number>();
  for (const p of pens ?? []) {
    penTotalByName.set(p.penalized_to, (penTotalByName.get(p.penalized_to) ?? 0) + 1);
    if (p.penalized_date === today)
      penTodayByName.set(p.penalized_to, (penTodayByName.get(p.penalized_to) ?? 0) + 1);
    if (typeof p.penalized_date === "string" && p.penalized_date.startsWith(monthPrefix))
      penMonthByName.set(p.penalized_to, (penMonthByName.get(p.penalized_to) ?? 0) + 1);
  }

  const teamStatus = targets.map((t) => {
    const s = statuses.get(t.name) ?? defaultStatus(t.name);
    return {
      name: t.name,
      gid: t.gid,
      status: s.status,
      hours: s.hours,
      notes: s.notes,
      capacity: capacityOf(s),
      active: activeByName.get(t.name) ?? 0,
      completedToday: compTodayByName.get(t.name) ?? 0,
      completedMonth: compMonthByName.get(t.name) ?? 0,
      completedTotal: compTotalByName.get(t.name) ?? 0,
      penaltyToday: penTodayByName.get(t.name) ?? 0,
      penaltyMonth: penMonthByName.get(t.name) ?? 0,
      penaltyTotal: penTotalByName.get(t.name) ?? 0,
      updated_at: s.updated_at,
    };
  });

  return NextResponse.json({
    tickets: tickets ?? [],
    lastRun,
    targets,
    sprints: sprintOrder,
    teamStatus,
    minutesPerTicket: MINUTES_PER_TICKET,
  });
}
