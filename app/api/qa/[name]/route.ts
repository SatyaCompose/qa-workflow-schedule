import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

// Returns active + archived tickets currently/historically assigned to a
// target person, plus their completion history. Used by the per-person
// modal on the dashboard.
export async function GET(
  _req: NextRequest,
  { params }: { params: { name: string } },
) {
  const name = decodeURIComponent(params.name);
  const db = supabase();

  const [{ data: active, error: ae }, { data: archived, error: re }, { data: completed, error: ce }, { data: penalties, error: pe }] =
    await Promise.all([
      db
        .from("tickets")
        .select("task_gid, task_name, task_url, dev_status, sprint, priority, due_on, first_seen, asana_status, original_assignee, manual_override")
        .eq("assigned_to", name)
        .eq("archived", false)
        .order("first_seen", { ascending: true })
        .limit(200),
      db
        .from("tickets")
        .select("task_gid, task_name, task_url, dev_status, sprint, priority, due_on, first_seen, last_seen, asana_status, original_assignee")
        .eq("assigned_to", name)
        .eq("archived", true)
        .order("last_seen", { ascending: false })
        .limit(200),
      db
        .from("completions")
        .select("task_gid, task_name, task_url, completed_at, completed_date, from_priority, to_priority, from_dev_status, to_dev_status, sprint")
        .eq("completed_by", name)
        .order("completed_at", { ascending: false })
        .limit(200),
      db
        .from("penalties")
        .select("task_gid, task_name, task_url, penalized_at, penalized_date, priority, reason")
        .eq("penalized_to", name)
        .order("penalized_at", { ascending: false })
        .limit(200),
    ]);

  if (ae) return NextResponse.json({ error: ae.message }, { status: 500 });
  if (re) return NextResponse.json({ error: re.message }, { status: 500 });
  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });
  if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });

  return NextResponse.json({
    name,
    active: active ?? [],
    archived: archived ?? [],
    completed: completed ?? [],
    penalties: penalties ?? [],
  });
}
