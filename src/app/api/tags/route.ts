import { NextResponse } from "next/server";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import { resolveRouting } from "@/lib/atproto/routing";
import { listWatches } from "@/lib/atproto/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cap the scan: the tag vocabulary only needs recent history, not a full sweep.
const TAG_SCAN_LIMIT = 200;

export async function GET() {
  const agent = await getAuthedAgent();
  if (!agent || !agent.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const routing = await resolveRouting(agent, await getSession());
    const watches = await listWatches(
      agent,
      agent.did,
      TAG_SCAN_LIMIT,
      routing.diary,
    );

    // listWatches is newest-first, so first occurrence == most recently used.
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const w of watches) {
      for (const raw of w.tags) {
        const tag = raw.trim().toLowerCase();
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        tags.push(tag);
      }
    }

    return NextResponse.json({ tags });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load tags";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
