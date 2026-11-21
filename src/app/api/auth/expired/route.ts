import { NextRequest, NextResponse } from "next/server";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import { loginPath, safeNextPath } from "@/lib/authGate";
import { BASE_URL } from "@/config/baseUrl";

export const runtime = "nodejs";

// Landing spot for a page that found a well-formed cookie the server can't
// back (session revoked, unrefreshable, or wiped by a restart when
// TVLOG_DATA_DIR is unset). Clears the cookie only if it really is
// dead — a live session just continues to `next` — so a stray link here can't
// sign anyone out.
export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next")) ?? "/";
  const agent = await getAuthedAgent().catch(() => null);
  if (agent?.did) {
    return NextResponse.redirect(new URL(next, BASE_URL), { status: 302 });
  }
  const session = await getSession();
  session.destroy();
  return NextResponse.redirect(new URL(loginPath(next), BASE_URL), {
    status: 302,
  });
}
