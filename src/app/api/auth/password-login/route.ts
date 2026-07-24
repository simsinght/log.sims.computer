import { NextRequest, NextResponse } from "next/server";
import { establishPasswordSession } from "@/lib/atproto/passwordSession";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { handle?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const handle = typeof body.handle === "string" ? body.handle.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!handle || !password) {
    return NextResponse.json(
      { error: "handle and password are required" },
      { status: 400 },
    );
  }

  try {
    const result = await establishPasswordSession(handle, password);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid credentials";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
