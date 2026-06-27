import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabase } from "@/lib/db";
import { istDateString } from "@/lib/ist";
import { requireSameOrigin } from "@/lib/origin";
import { loadStatuses } from "@/lib/target-status";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const originErr = requireSameOrigin(req);
  if (originErr) return originErr;

  let body: { task_gid?: string; target_gid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { task_gid, target_gid } = body;
  if (!task_gid || !target_gid) {
    return NextResponse.json(
      { error: "task_gid and target_gid are required" },
      { status: 400 },
    );
  }

  // Resolve the target from the authoritative source — env config — instead
  // of guessing from existing rows. Prevents "Unknown" or stale names when
  // the chosen target hasn't received any tickets before.
  let target: { gid: string; name: string } | undefined;
  try {
    const { targets } = config();
    target = targets.find((t) => t.gid === target_gid);
  } catch (e) {
    return NextResponse.json(
      { error: `Server config invalid: ${(e as Error).message}` },
      { status: 500 },
    );
  }
  if (!target) {
    return NextResponse.json(
      { error: `target_gid '${target_gid}' is not in TARGET_USERS` },
      { status: 400 },
    );
  }

  // Refuse to reassign onto a target who's currently on leave. Otherwise the
  // ticket would pin to them indefinitely (manual override beats the leave
  // bypass in the splitter).
  const statuses = await loadStatuses([target.name]);
  if (statuses.get(target.name)?.status === "leave") {
    return NextResponse.json(
      {
        error: `Cannot reassign to '${target.name}' — they are on leave. Reassign to someone available, or change their status first.`,
      },
      { status: 400 },
    );
  }

  const db = supabase();
  const now = new Date().toISOString();

  const { data: updated, error } = await db
    .from("tickets")
    .update({
      assigned_to_gid: target.gid,
      assigned_to: target.name,
      manual_override: true,
      override_at: now,
      updated_at: now,
    })
    .eq("task_gid", task_gid)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "ticket not found" }, { status: 404 });

  // Mirror into today's snapshot so the daily Excel sheet stays consistent.
  const today = istDateString();
  await db
    .from("daily_snapshots")
    .update({ assigned_to_gid: target.gid, assigned_to: target.name })
    .eq("snapshot_date", today)
    .eq("task_gid", task_gid);

  return NextResponse.json({ ok: true, ticket: updated });
}
