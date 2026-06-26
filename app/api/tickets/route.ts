import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabase();

  // Read sprint + target ordering from env. If env is misconfigured, fall
  // back to deriving from the data so the dashboard still renders.
  let sprintOrder: string[] = [];
  let configuredTargets: { gid: string; name: string }[] = [];
  try {
    const c = config();
    sprintOrder = c.sprints;
    configuredTargets = c.targets;
  } catch {
    /* missing env vars — return derived targets below */
  }

  const [{ data: tickets, error: tErr }, { data: lastRun, error: rErr }] =
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
    ]);

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  // Fall back to deriving target list from data if env wasn't readable.
  const targets =
    configuredTargets.length > 0
      ? configuredTargets
      : (() => {
          const m = new Map<string, string>();
          for (const t of tickets ?? []) {
            if (t.assigned_to_gid && !m.has(t.assigned_to_gid)) {
              m.set(t.assigned_to_gid, t.assigned_to);
            }
          }
          return [...m.entries()].map(([gid, name]) => ({ gid, name }));
        })();

  return NextResponse.json({
    tickets: tickets ?? [],
    lastRun,
    targets,
    sprints: sprintOrder, // older first; client uses index for sort rank
  });
}
