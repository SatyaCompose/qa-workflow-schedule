import { NextRequest, NextResponse } from "next/server";

// Protect /api/admin/* with HTTP Basic Auth. The browser prompts the user
// on first request and remembers the credentials for the session.
//
// Note on the username: we deliberately ignore it. Only the password (the
// part after the first ':') is checked against ADMIN_PASSWORD. Users can
// type anything in the username field (or leave it blank).
//
// We use timingSafeEqual to compare so that a wrong password can't leak
// information about how close it was via response-time differences.
export function middleware(req: NextRequest) {
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
    headers: { "WWW-Authenticate": 'Basic realm="QA Work Allotment Admin"' },
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

export const config = {
  matcher: ["/api/admin/:path*"],
};
