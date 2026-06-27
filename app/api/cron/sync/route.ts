import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Constant-time compare so a wrong CRON_SECRET can't leak via timing.
function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;

  // Fail closed: if the secret isn't configured we refuse to run rather than
  // serving a public endpoint that anyone could hammer. Set CRON_SECRET in
  // your env (locally) or as a Vercel env var (production).
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server" },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!constantTimeEqual(supplied, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Sync runs every day — including weekends. The team is *nominally* off
  // Sat/Sun, but if anyone works a weekend their completions get tracked.
  // Per-user `leave` status (managed in the dashboard) governs assignments.
  const result = await runSync();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
