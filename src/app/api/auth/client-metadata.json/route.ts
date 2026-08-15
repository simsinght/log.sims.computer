import { NextResponse } from "next/server";
import { clientMetadata } from "@/lib/atproto/oauth";

export async function GET() {
  return NextResponse.json(clientMetadata());
}
