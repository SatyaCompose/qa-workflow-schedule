import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await runSync();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
