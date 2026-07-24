import { NextResponse } from "next/server";
import { establishPasswordSession } from "@/lib/atproto/passwordSession";
import { BASE_URL } from "@/config/baseUrl";

export const runtime = "nodejs";

export async function GET() {
  const handle = process.env.ATP_TEST_HANDLE;
  const password = process.env.ATP_TEST_APP_PASSWORD;
  if (!handle || !password) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await establishPasswordSession(handle, password);
    return NextResponse.redirect(new URL("/", BASE_URL), { status: 302 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
