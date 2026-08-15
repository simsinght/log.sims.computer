import { NextResponse } from "next/server";
import { getPublicJwks } from "@/lib/atproto/oauth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getPublicJwks());
}
