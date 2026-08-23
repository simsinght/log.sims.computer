import { NextRequest, NextResponse } from "next/server";
import { Agent } from "@atproto/api";
import { getOAuthClient } from "@/lib/atproto/oauth";
import { resolveIdentity } from "@/lib/atproto/identity";
import { initSpacesForSession } from "@/lib/atproto/spaces";
import { getSession } from "@/lib/session";
import { BASE_URL } from "@/config/baseUrl";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;

  try {
    const client = await getOAuthClient();
    const { session: oauthSession } = await client.callback(params);
    const did = oauthSession.did;

    let handle: string | null = null;
    try {
      handle = (await resolveIdentity(did)).handle;
    } catch {
      handle = null;
    }

    const session = await getSession();
    session.did = did;
    session.handle = handle ?? did;
    session.method = "oauth";
    // Drop any capability cached under a previous identity on this cookie before
    // re-probing, so a stale flag can never cross accounts.
    session.spacesCapable = undefined;
    await initSpacesForSession(new Agent(oauthSession), session);
    await session.save();

    return NextResponse.redirect(new URL("/", BASE_URL), { status: 302 });
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
