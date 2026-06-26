import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabase } from "@/lib/db";
import { buildCurrentStateWorkbook } from "@/lib/excel";

export const dynamic = "force-dynamic";

// Returns one .xlsx with every ticket ever seen (active + archived) and its
// current status. One sheet, sorted by sprint age then priority. Use this as
// the always-up-to-date snapshot. Historical daily snapshots remain in the
// `daily_snapshots` table — query them separately if needed.
export async function GET(_req: NextRequest) {
  const db = supabase();

  const { data, error } = await db.from("tickets").select("*");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sprintOrder: string[] = [];
  try {
    sprintOrder = config().sprintPrefixes;
  } catch {
    /* env not loaded — that's fine for the download */
  }

  const buffer = await buildCurrentStateWorkbook(data ?? [], sprintOrder);
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
