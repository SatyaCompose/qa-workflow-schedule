import { NextRequest, NextResponse } from "next/server";
import { isWeekendIst } from "@/lib/ist";
import { runSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel Cron / our GitHub Actions workflow send Authorization: Bearer <CRON_SECRET>.
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Weekends in IST: the team doesn't work, so we skip the sync entirely.
  // Friday's data stays visible; Monday morning's first sync picks things up
  // again. Returns 200 so GitHub Actions / cron doesn't flag the no-op as failure.
  if (isWeekendIst()) {
    return NextResponse.json(
      { ok: true, skipped: "weekend (IST)" },
      { status: 200 },
    );
  }

  const result = await runSync();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
