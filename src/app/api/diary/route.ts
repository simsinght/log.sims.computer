import { NextResponse } from "next/server";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { buildDiary } from "@/lib/diary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const agent = await getAuthedAgent();
  if (!agent || !agent.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const days = await buildDiary(agent, agent.did);
    return NextResponse.json({ days });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load diary";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
