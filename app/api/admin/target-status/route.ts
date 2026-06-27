import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabase } from "@/lib/db";
import { requireSameOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

type Body = {
  name?: string;
  status?: "available" | "regression" | "leave";
  hours?: number;
  notes?: string | null;
};

export async function POST(req: NextRequest) {
  const originErr = requireSameOrigin(req);
  if (originErr) return originErr;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim();
  const status = body.status;
  let hours = body.hours;
  const notes = body.notes ?? null;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  // Only configured TARGET_USERS can have a status row — otherwise the table
  // accumulates dead entries that nothing reads.
  let allowedNames: string[];
  try {
    allowedNames = config().targets.map((t) => t.name);
  } catch (e) {
    return NextResponse.json(
      { error: `Server config invalid: ${(e as Error).message}` },
      { status: 500 },
    );
  }
  if (!allowedNames.includes(name)) {
    return NextResponse.json(
      { error: `'${name}' is not in TARGET_USERS` },
      { status: 400 },
    );
  }

  if (!status || !["available", "regression", "leave"].includes(status)) {
    return NextResponse.json({ error: "status must be available|regression|leave" }, { status: 400 });
  }
  if (typeof hours !== "number" || !Number.isInteger(hours) || hours < 0 || hours > 8) {
    // auto-set sensible default for status if hours wasn't sent (or is bad)
    if (status === "leave") hours = 0;
    else if (status === "available") hours = 8;
    else return NextResponse.json({ error: "hours must be an integer 0..8" }, { status: 400 });
  }

  // Force hours to match status for the non-ambiguous cases.
  if (status === "leave") hours = 0;
  if (status === "available" && hours === 0) hours = 8;

  const db = supabase();
  const { data, error } = await db
    .from("target_status")
    .upsert(
      { name, status, hours, notes, updated_at: new Date().toISOString() },
      { onConflict: "name" },
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: data });
}
