import { NextRequest, NextResponse } from "next/server";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { createWatch, upsertListItem } from "@/lib/atproto/records";

export const runtime = "nodejs";

interface LogBody {
  tmdbId?: unknown;
  mediaType?: unknown;
  title?: unknown;
  watchedAt?: unknown;
  tags?: unknown;
  note?: unknown;
  rewatch?: unknown;
  season?: unknown;
  episode?: unknown;
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const tag = t.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function normalizeWatchedAt(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") {
    return new Date().toISOString();
  }
  if (typeof raw !== "string") return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function optionalInt(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

export async function POST(request: NextRequest) {
  const agent = await getAuthedAgent();
  if (!agent || !agent.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const did = agent.did;

  let body: LogBody;
  try {
    body = (await request.json()) as LogBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tmdbId =
    typeof body.tmdbId === "number" ? body.tmdbId : Number(body.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return NextResponse.json({ error: "Invalid tmdbId" }, { status: 400 });
  }

  const mediaType = body.mediaType;
  if (mediaType !== "movie" && mediaType !== "tv") {
    return NextResponse.json({ error: "Invalid mediaType" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const watchedAt = normalizeWatchedAt(body.watchedAt);
  if (!watchedAt) {
    return NextResponse.json({ error: "Invalid watchedAt" }, { status: 400 });
  }

  const tags = normalizeTags(body.tags);
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim()
      : undefined;
  const rewatch = body.rewatch === true;
  const season = optionalInt(body.season);
  const episode = optionalInt(body.episode);

  try {
    const subject = await upsertListItem(agent, did, {
      tmdbId,
      mediaType,
      title,
      watchedAt,
      season,
      episode,
    });

    const watch = await createWatch(agent, did, {
      subject,
      tmdbId,
      mediaType,
      watchedAt,
      rewatch,
      season,
      episode,
      tags,
      note,
    });

    return NextResponse.json({
      listItemUri: subject.uri,
      watchUri: watch.uri,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDS write failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
