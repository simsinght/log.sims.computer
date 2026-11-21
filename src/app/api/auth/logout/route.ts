import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/atproto/oauth";
import { forgetPasswordSession } from "@/lib/atproto/passwordTokens";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();

  if (session.method === "oauth" && session.did) {
    try {
      const client = await getOAuthClient(session.oauthClient ?? "default");
      await client.revoke(session.did);
    } catch {
      // best-effort revocation; clear local session regardless
    }
  }

  if (session.method === "app_password" && session.did) {
    forgetPasswordSession(session.did);
  }

  // Only the session cookie: the device's remembered account (localStorage,
  // see @/lib/rememberedAccounts) is kept so /login can offer "Continue as".
  session.destroy();
  return NextResponse.json({ ok: true });
}
