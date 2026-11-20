import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, type OAuthClientTag } from "@/lib/atproto/oauth";
import { resolveIdentity } from "@/lib/atproto/identity";
import { isSpacesHost } from "@/lib/atproto/spaces-hosts";
import { BASE_URL } from "@/config/baseUrl";
import { NEXT_COOKIE, safeNextPath } from "@/lib/authGate";

export const runtime = "nodejs";

// PDS hosts known to speak com.atproto.space.* (the allowlist in
// @/lib/atproto/spaces-hosts) are routed to the spaces client. Everything else
// — bsky.social included — gets the legacy client, so its transition:generic
// scope stays untouched.
//
// This is an allowlist on purpose. An unauthenticated capability probe used to
// live here (401/403 = method exists, 404/501 = unknown method), but mainline
// PDS now auth-gates every com.atproto.* method before routing, so an unknown
// method also answers 401 and the probe classified every bsky.social account as
// spaces-capable. Capability is only knowable with a token, which the callback's
// detectSpacesCapability handles.

// Resolve the target account's PDS host, then choose the client: an allowlisted
// spaces host gets the spaces client; everything else gets the legacy client.
async function chooseClientTag(identifier: string): Promise<OAuthClientTag> {
  let pdsHost: string | null = null;
  if (/^https?:\/\//i.test(identifier)) {
    try {
      pdsHost = new URL(identifier).host;
    } catch {
      pdsHost = null;
    }
  } else {
    try {
      pdsHost = new URL((await resolveIdentity(identifier)).pdsUrl).host;
    } catch {
      pdsHost = null;
    }
  }
  if (!pdsHost) return "default";
  return isSpacesHost(pdsHost) ? "spaces" : "default";
}

function loginError(code: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${code}`, BASE_URL), {
    status: 302,
  });
}

// Classify the identifier without logging the raw value (a handle/DID/PDS URL
// can be privacy-relevant). For a URL we keep only the host.
function identifierShape(identifier: string): { shape: string; host?: string } {
  if (identifier.startsWith("did:")) return { shape: "did" };
  if (/^https?:\/\//i.test(identifier)) {
    try {
      return { shape: "url", host: new URL(identifier).host };
    } catch {
      return { shape: "url" };
    }
  }
  return { shape: "handle" };
}

// Accepts a handle (you.bsky.social / sim.pds.sims.computer), a DID
// (did:plc:… / did:web:…), or a PDS/entryway URL (https://pds.sims.computer).
// The oauth client's authorize() resolves all three shapes itself.
async function startLogin(identifier: string | null, next: string | null) {
  if (!identifier || !identifier.trim()) {
    return loginError("missing");
  }

  const value = identifier.trim();
  try {
    const tag = await chooseClientTag(value);
    const client = await getOAuthClient(tag);
    // No wire-state tagging: the SDK sends its own nonce as `state`, so the
    // client tag is recorded by this client's wrapped state store (nonce -> tag)
    // and recovered in the callback. See ./oauth-store.
    const url = await client.authorize(value);
    const res = NextResponse.redirect(url, { status: 302 });
    // Return path for the callback, parked in a short-lived cookie rather than
    // the OAuth state. Validated here and again in the callback; cleared when
    // absent so a stale one can't redirect a later sign-in.
    const safeNext = safeNextPath(next);
    if (safeNext) {
      res.cookies.set(NEXT_COOKIE, safeNext, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/api/auth/",
        maxAge: 600,
      });
    } else {
      res.cookies.delete({ name: NEXT_COOKIE, path: "/api/auth/" });
    }
    return res;
  } catch (err) {
    const e = err as { status?: number; error?: string; message?: string };
    console.error("[login] authorize failed", {
      ...identifierShape(value),
      status: e?.status,
      error: e?.error,
      message: e?.message,
    });
    return loginError("resolve");
  }
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  return startLogin(params.get("handle"), params.get("next"));
}

export async function POST(request: NextRequest) {
  let identifier: string | null = null;
  let next: string | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    identifier = typeof body.handle === "string" ? body.handle : null;
    next = typeof body.next === "string" ? body.next : null;
  } else {
    const form = await request.formData();
    const value = form.get("handle");
    identifier = typeof value === "string" ? value : null;
    const nextValue = form.get("next");
    next = typeof nextValue === "string" ? nextValue : null;
  }
  return startLogin(identifier, next);
}
