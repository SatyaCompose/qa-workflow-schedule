import { NextRequest, NextResponse } from "next/server";

// Reject state-changing requests whose Origin / Referer doesn't match the
// host the server is serving from. Defense in depth on top of Basic Auth:
// browsers send cached Basic credentials with every same-origin request, so
// a cross-origin attacker page could trigger an admin POST if we relied on
// auth alone.
//
// We trust same-origin if EITHER the Origin header OR the Referer header
// matches the request host. We allow missing headers ONLY for non-browser
// callers (no Sec-Fetch-Site set), so cron / scripts still work.
export function requireSameOrigin(req: NextRequest): NextResponse | null {
  const host = req.headers.get("host");
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const fetchSite = req.headers.get("sec-fetch-site");

  if (!host) {
    return NextResponse.json({ error: "missing host header" }, { status: 400 });
  }

  // If the browser told us this is a same-origin request, trust it.
  if (fetchSite === "same-origin") return null;

  // Non-browser caller (curl, server-to-server). No Origin/Referer headers
  // is fine — those clients aren't subject to CSRF.
  if (!origin && !referer && !fetchSite) return null;

  const matchesHost = (raw: string | null): boolean => {
    if (!raw) return false;
    try {
      return new URL(raw).host === host;
    } catch {
      return false;
    }
  };

  if (matchesHost(origin) || matchesHost(referer)) return null;

  return NextResponse.json(
    { error: "cross-origin request rejected" },
    { status: 403 },
  );
}
