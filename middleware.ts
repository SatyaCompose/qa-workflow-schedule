import { NextRequest, NextResponse } from "next/server";

// Gate the whole app behind HTTP Basic Auth using ADMIN_PASSWORD. The
// dashboard pages and JSON APIs all expose the same data and the same
// reassign / status-edit controls, so there's no useful "viewer" tier to
// carve out — anyone with the dashboard URL effectively has admin.
//
// Exempted paths:
//   - /api/cron/*  uses CRON_SECRET (Bearer token), checked in the route.
//   - Next.js static assets (/_next, favicon) are excluded via `matcher`.
//
// Only the password (the part after the first ':') is compared — users can
// type anything as the username. constantTimeEqual avoids leaking length /
// match progress via response timing.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/cron")) {
    return NextResponse.next();
  }

  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD not configured on the server" },
      { status: 500 },
    );
  }

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice("Basic ".length));
    const idx = decoded.indexOf(":");
    const submittedPw = idx === -1 ? decoded : decoded.slice(idx + 1);
    if (constantTimeEqual(submittedPw, adminPw)) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="QA Work Allotment"' },
  });
}

// Edge runtime can't import `crypto`. This is a plain JS constant-time
// compare: always touches every byte of the longer string and never
// short-circuits.
function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// Match every request except Next.js static assets and the favicon.
// /api/cron is still matched (we handle the bypass above) so that a
// misconfiguration there can't accidentally expose other routes.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
