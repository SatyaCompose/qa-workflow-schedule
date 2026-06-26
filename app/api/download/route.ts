import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabase } from "@/lib/db";
import { buildMonthlyWorkbook } from "@/lib/excel";
import { istMonthString } from "@/lib/ist";

export const dynamic = "force-dynamic";

function isValidMonth(m: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  // first day of the *next* month, exclusive upper bound
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, end: next };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const month = url.searchParams.get("month") ?? istMonthString();

  if (!isValidMonth(month)) {
    return NextResponse.json(
      { error: "month must be in YYYY-MM format" },
      { status: 400 },
    );
  }

  const { start, end } = monthBounds(month);

  const db = supabase();
  const { data, error } = await db
    .from("daily_snapshots")
    .select("*")
    .gte("snapshot_date", start)
    .lt("snapshot_date", end)
    .order("snapshot_date", { ascending: true })
    .order("assigned_to", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sprintOrder: string[] = [];
  try {
    sprintOrder = config().sprintPrefixes;
  } catch {
    /* fall through with empty sprint order */
  }

  const buffer = await buildMonthlyWorkbook(month, data ?? [], sprintOrder);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="qa-allotment-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
