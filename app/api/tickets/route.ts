import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabase();

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

  return NextResponse.json({ tickets: tickets ?? [], lastRun });
}
