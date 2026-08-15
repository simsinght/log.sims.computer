import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/atproto/oauth";

export const runtime = "nodejs";

async function startLogin(handle: string | null) {
  if (!handle || !handle.trim()) {
    return NextResponse.json({ error: "handle is required" }, { status: 400 });
  }

  try {
    const client = await getOAuthClient();
    const url = await client.authorize(handle.trim(), {
      state: crypto.randomUUID(),
    });
    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth login failed";
    return NextResponse.json(
      { error: `OAuth login unavailable: ${message}` },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const handle = new URL(request.url).searchParams.get("handle");
  return startLogin(handle);
}

export async function POST(request: NextRequest) {
  let handle: string | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    handle = typeof body.handle === "string" ? body.handle : null;
  } else {
    const form = await request.formData();
    const value = form.get("handle");
    handle = typeof value === "string" ? value : null;
  }
  return startLogin(handle);
}
