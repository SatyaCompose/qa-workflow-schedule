import { NextRequest, NextResponse } from "next/server";

// Protect /api/admin/* with HTTP Basic Auth. The browser will prompt the user
// on first request and remember the credentials for the session.
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
    if (submittedPw === adminPw) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="QA Work Allotment Admin"' },
  });
}

export const config = {
  matcher: ["/api/admin/:path*"],
};
