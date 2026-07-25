import { NextRequest, NextResponse } from "next/server";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { WATCH_COLLECTION, listAllRecords } from "@/lib/atproto/records";

export const runtime = "nodejs";

function sortKey(value: Record<string, unknown>): string {
  const created = value.createdAt;
  const added = value.addedAt;
  if (typeof created === "string") return created;
  if (typeof added === "string") return added;
  return "";
}

export async function GET(request: NextRequest) {
  const agent = await getAuthedAgent();
  if (!agent || !agent.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const did = agent.did;

  const url = new URL(request.url);
  const collection = url.searchParams.get("collection");
  const tmdbId = url.searchParams.get("tmdbId");
  if (!collection || !tmdbId) {
    return NextResponse.json(
      { error: "collection and tmdbId are required" },
      { status: 400 },
    );
  }

  const records = await listAllRecords(agent, did, collection);
  const matches = records.filter((r) => {
    if (collection === WATCH_COLLECTION) {
      return String(r.value.tmdbId) === tmdbId;
    }
    const ids = r.value.identifiers as Record<string, unknown> | undefined;
    if (!ids) return false;
    return String(ids.tmdbId) === tmdbId || String(ids.tmdbTvSeriesId) === tmdbId;
  });

  matches.sort((a, b) => (sortKey(a.value) < sortKey(b.value) ? 1 : -1));

  if (matches.length === 0) {
    return NextResponse.json({ found: false }, { status: 404 });
  }
  return NextResponse.json({ found: true, count: matches.length, record: matches[0] });
}
