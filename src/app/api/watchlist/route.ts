import { NextRequest, NextResponse } from "next/server";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import { resolveRouting } from "@/lib/atproto/routing";
import { addToWatchlist, removeFromWatchlist } from "@/lib/atproto/records";

export const runtime = "nodejs";

function parseTmdbId(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function POST(request: NextRequest) {
  const agent = await getAuthedAgent();
  if (!agent || !agent.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { tmdbId?: unknown; title?: unknown };
  try {
    body = (await request.json()) as { tmdbId?: unknown; title?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tmdbId = parseTmdbId(body.tmdbId);
  if (tmdbId === null) {
    return NextResponse.json({ error: "Invalid tmdbId" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    const routing = await resolveRouting(agent, await getSession());
    const ref = await addToWatchlist(
      agent,
      agent.did,
      { tmdbId, title },
      routing.watchlist,
    );
    return NextResponse.json({ listItemUri: ref.uri });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDS write failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const agent = await getAuthedAgent();
  if (!agent || !agent.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tmdbId = parseTmdbId(request.nextUrl.searchParams.get("tmdbId"));
  if (tmdbId === null) {
    return NextResponse.json({ error: "Invalid tmdbId" }, { status: 400 });
  }

  try {
    const routing = await resolveRouting(agent, await getSession());
    const removed = await removeFromWatchlist(
      agent,
      agent.did,
      tmdbId,
      routing.watchlist,
    );
    return NextResponse.json({ removed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDS write failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
