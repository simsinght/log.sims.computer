import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/atproto/oauth";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();

  if (session.method === "oauth" && session.did) {
    try {
      const client = await getOAuthClient();
      await client.revoke(session.did);
    } catch {
      // best-effort revocation; clear local session regardless
    }
  }

  session.destroy();
  return NextResponse.json({ ok: true });
}
