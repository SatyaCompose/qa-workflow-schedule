import { NextRequest, NextResponse } from "next/server";
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

  // Note: sync runs all 7 days. The team is *nominally* off on Sat/Sun, but
  // if any QA person works a weekend their completions should still be
  // tracked. Use target_status (leave/regression) on individual rows to
  // reflect who's actually unavailable.
  const result = await runSync();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
