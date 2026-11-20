import { NextResponse, type NextRequest } from "next/server";
import { unsealData } from "iron-session";
import { SESSION_COOKIE, sessionOptions } from "@/lib/sessionOptions";
import { PATH_HEADER, isPublicPath, loginPath } from "@/lib/authGate";

// Default-deny gate: everything except the public allowlist in
// @/lib/authGate needs a session cookie that unseals with the server's
// SESSION_SECRET and carries a DID. A forged or garbage cookie fails the
// unseal and is treated as signed out.
//
// What this cannot see: whether the OAuth token behind a well-formed cookie
// still exists (the OAuth store is in-memory and wiped on restart). Pages and
// API routes do that real check themselves via getAuthedAgent().

async function sessionDid(request: NextRequest): Promise<string | null> {
  const seal = request.cookies.get(SESSION_COOKIE)?.value;
  if (!seal) return null;
  try {
    const data = await unsealData<{ did?: unknown }>(seal, {
      password: sessionOptions.password,
      ttl: sessionOptions.ttl,
    });
    return typeof data.did === "string" && data.did ? data.did : null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  if (await sessionDid(request)) {
    const headers = new Headers(request.headers);
    headers.set(PATH_HEADER, `${pathname}${search}`);
    return NextResponse.next({ request: { headers } });
  }

  // Data and the image optimizer answer 401 rather than an HTML redirect.
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.redirect(
    new URL(loginPath(`${pathname}${search}`), request.url),
    { status: 307 },
  );
}

export const config = {
  // Node runtime (stable in Next 15.5): SESSION_SECRET is read at runtime from
  // the container env, exactly as the route handlers read it.
  runtime: "nodejs",
  matcher: ["/((?!_next/static/).*)"],
};
