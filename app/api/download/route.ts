import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { buildWorkbook } from "@/lib/excel";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabase();
  const { data, error } = await db
    .from("tickets")
    .select("*")
    .order("archived", { ascending: true })
    .order("assigned_to", { ascending: true })
    .order("first_seen", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const buffer = await buildWorkbook(data ?? []);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="qa-allotment-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
