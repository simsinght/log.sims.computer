import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/atproto/oauth";
import { resolveIdentity } from "@/lib/atproto/identity";
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
    await session.save();

    return NextResponse.redirect(new URL("/", BASE_URL), { status: 302 });
  } catch {
    return NextResponse.redirect(new URL("/login?error=oauth", BASE_URL), {
      status: 302,
    });
  }
}
