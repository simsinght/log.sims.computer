import { NextRequest, NextResponse } from "next/server";
import { Agent } from "@atproto/api";
import { getOAuthClient, resolveClientTagFromState } from "@/lib/atproto/oauth";
import { resolveIdentity } from "@/lib/atproto/identity";
import { initSpacesForSession } from "@/lib/atproto/spaces";
import { isSpacesPdsUrl } from "@/lib/atproto/spaces-hosts";
import { fetchPublicProfile } from "@/lib/atproto/publicProfile";
import { getSession } from "@/lib/session";
import { BASE_URL } from "@/config/baseUrl";
import { NEXT_COOKIE, safeNextPath } from "@/lib/authGate";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  // The wire `state` is the SDK's nonce; recover (single-use) which client
  // started this flow so the code is exchanged — and the session later restored
  // — with that same client_id.
  const tag = resolveClientTagFromState(params.get("state"));

  try {
    const client = await getOAuthClient(tag);
    const { session: oauthSession } = await client.callback(params);
    const did = oauthSession.did;

    let handle: string | null = null;
    let pdsUrl: string | null = null;
    try {
      ({ handle, pdsUrl } = await resolveIdentity(did));
    } catch {
      handle = null;
    }

    const session = await getSession();
    session.did = did;
    session.handle = handle ?? did;
    session.method = "oauth";
    session.oauthClient = tag;
    // Drop any capability cached under a previous identity on this cookie before
    // re-probing, so a stale flag (or a stale "needs re-auth") can never cross
    // accounts or survive a re-login through the spaces client.
    session.spacesCapable = undefined;
    session.spacesUnauthorized = undefined;
    // Allowlisted spaces host (by the resolved PDS, or by the login route having
    // picked the spaces client for it): routing fails closed for this account.
    session.spacesExpected = tag === "spaces" || isSpacesPdsUrl(pdsUrl);
    const [profile] = await Promise.all([
      fetchPublicProfile(did),
      initSpacesForSession(new Agent(oauthSession), session),
    ]);
    session.displayName = profile.displayName;
    session.avatar = profile.avatar;
    await session.save();

    // Back to where the auth gate sent us from (same-origin path only).
    const next = safeNextPath(request.cookies.get(NEXT_COOKIE)?.value) ?? "/";
    const res = NextResponse.redirect(new URL(next, BASE_URL), { status: 302 });
    res.cookies.delete({ name: NEXT_COOKIE, path: "/api/auth/" });
    return res;
  } catch (err) {
    const e = err as { status?: number; error?: string; message?: string };
    console.error("[callback] oauth callback failed", {
      status: e?.status,
      error: e?.error,
      message: e?.message,
    });
    return NextResponse.redirect(new URL("/login?error=oauth", BASE_URL), {
      status: 302,
    });
  }
}
