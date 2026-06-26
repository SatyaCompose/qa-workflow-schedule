import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { istDateString } from "@/lib/ist";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

  const db = supabase();

  // Resolve the new target's name from existing rows (any ticket currently
  // assigned to them). Falls back to "Unknown" only if no other ticket has
  // ever been assigned to them yet.
  const { data: anyRow } = await db
    .from("tickets")
    .select("assigned_to, assigned_to_gid")
    .eq("assigned_to_gid", target_gid)
    .limit(1)
    .maybeSingle();

  const targetName = anyRow?.assigned_to ?? "Unknown";
  const now = new Date().toISOString();

  const { data: updated, error } = await db
    .from("tickets")
    .update({
      assigned_to_gid: target_gid,
      assigned_to: targetName,
      manual_override: true,
      override_at: now,
      updated_at: now,
    })
    .eq("task_gid", task_gid)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }

  // Reflect the override into today's snapshot immediately, so the daily
  // Excel sheet stays consistent with the dashboard.
  const today = istDateString();
  await db
    .from("daily_snapshots")
    .update({ assigned_to_gid: target_gid, assigned_to: targetName })
    .eq("snapshot_date", today)
    .eq("task_gid", task_gid);

  return NextResponse.json({ ok: true, ticket: updated });
}
