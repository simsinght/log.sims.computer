import { NextResponse } from "next/server";
import { spacesClientMetadata } from "@/lib/atproto/oauth";

export async function GET() {
  return NextResponse.json(spacesClientMetadata());
}
