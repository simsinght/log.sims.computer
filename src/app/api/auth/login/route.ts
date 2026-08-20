import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/atproto/oauth";
import { BASE_URL } from "@/config/baseUrl";

export const runtime = "nodejs";

function loginError(code: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${code}`, BASE_URL), {
    status: 302,
  });
}

// Accepts a handle (you.bsky.social / sim.pds.sims.computer), a DID
// (did:plc:… / did:web:…), or a PDS/entryway URL (https://pds.sims.computer).
// The oauth client's authorize() resolves all three shapes itself.
async function startLogin(identifier: string | null) {
  if (!identifier || !identifier.trim()) {
    return loginError("missing");
  }

  try {
    const client = await getOAuthClient();
    const url = await client.authorize(identifier.trim(), {
      state: crypto.randomUUID(),
    });
    return NextResponse.redirect(url, { status: 302 });
  } catch {
    return loginError("resolve");
  }
}

export async function GET(request: NextRequest) {
  const identifier = new URL(request.url).searchParams.get("handle");
  return startLogin(identifier);
}

export async function POST(request: NextRequest) {
  let identifier: string | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    identifier = typeof body.handle === "string" ? body.handle : null;
  } else {
    const form = await request.formData();
    const value = form.get("handle");
    identifier = typeof value === "string" ? value : null;
  }
  return startLogin(identifier);
}
