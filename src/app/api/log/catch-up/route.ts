import { NextRequest, NextResponse } from "next/server";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import { resolveRouting } from "@/lib/atproto/routing";
import {
  createWatches,
  getShowListItem,
  upsertListItem,
  type CreateWatchInput,
  type WatchedEpisode,
} from "@/lib/atproto/records";
import { getSeasonEpisodes, getShowDetail } from "@/lib/tmdb";

export const runtime = "nodejs";

// bsky.social allows roughly 1,666 record creates an hour, so a single catch-up
// is capped well under that rather than throttled.
const MAX_CATCH_UP = 600;

interface CatchUpBody {
  tmdbId?: unknown;
  title?: unknown;
  season?: unknown;
  episode?: unknown;
  watchedAt?: unknown;
  dryRun?: unknown;
}

interface Candidate {
  season: number;
  episode: number;
  tmdbId: string | null;
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

function requiredInt(raw: unknown, min: number): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < min) return null;
  return n;
}

function positionOf(c: Candidate | undefined) {
  return c ? { season: c.season, episode: c.episode } : null;
}

export async function POST(request: NextRequest) {
  const agent = await getAuthedAgent();
  if (!agent || !agent.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const did = agent.did;

  let body: CatchUpBody;
  try {
    body = (await request.json()) as CatchUpBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tmdbId = requiredInt(body.tmdbId, 1);
  if (tmdbId === null) {
    return NextResponse.json({ error: "Invalid tmdbId" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const season = requiredInt(body.season, 0);
  if (season === null) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
  }

  const episode = requiredInt(body.episode, 1);
  if (episode === null) {
    return NextResponse.json({ error: "Invalid episode" }, { status: 400 });
  }

  const watchedAt = normalizeWatchedAt(body.watchedAt);
  if (!watchedAt) {
    return NextResponse.json({ error: "Invalid watchedAt" }, { status: 400 });
  }

  const dryRun = body.dryRun === true;

  try {
    const [listItem, detail] = await Promise.all([
      getShowListItem(agent, did, tmdbId),
      getShowDetail(tmdbId),
    ]);

    const watched = new Set(
      (listItem?.watchedEpisodes ?? []).map(
        (e) => `${e.seasonNumber}-${e.episodeNumber}`,
      ),
    );

    // Specials (season 0) are never backfilled, and a season TMDB doesn't list
    // is never fetched — that keeps this to real seasons up to the target's.
    const seasonNumbers = detail.seasons
      .map((s) => s.seasonNumber)
      .filter((n) => n >= 1 && n <= season)
      .sort((a, b) => a - b);

    const today = new Date().toISOString().slice(0, 10);
    const candidates: Candidate[] = [];
    for (const s of seasonNumbers) {
      const episodes = await getSeasonEpisodes(tmdbId, s);
      for (const ep of episodes) {
        if (s === season && ep.episodeNumber >= episode) continue;
        if (ep.airDate === null || ep.airDate > today) continue;
        if (watched.has(`${s}-${ep.episodeNumber}`)) continue;
        candidates.push({
          season: s,
          episode: ep.episodeNumber,
          tmdbId: ep.tmdbId,
        });
      }
    }
    candidates.sort((a, b) =>
      a.season !== b.season ? a.season - b.season : a.episode - b.episode,
    );

    if (candidates.length > MAX_CATCH_UP) {
      return NextResponse.json(
        {
          error: `Catching up would log ${candidates.length} episodes, over the ${MAX_CATCH_UP} limit. Log a later episode first, then catch up in smaller steps.`,
        },
        { status: 400 },
      );
    }

    const first = positionOf(candidates[0]);
    const last = positionOf(candidates[candidates.length - 1]);

    if (dryRun) {
      return NextResponse.json({ count: candidates.length, first, last });
    }

    if (candidates.length === 0) {
      return NextResponse.json({ added: 0, first: null, last: null });
    }

    const episodes: WatchedEpisode[] = candidates.map((c) => {
      const entry: WatchedEpisode = {
        seasonNumber: c.season,
        episodeNumber: c.episode,
      };
      if (c.tmdbId) entry.tmdbId = c.tmdbId;
      return entry;
    });

    const subject = await upsertListItem(agent, did, {
      tmdbId,
      mediaType: "tv",
      title,
      watchedAt,
      season,
      episode,
      episodes,
    });

    // Each backfilled episode lands one second earlier than the next, so the
    // whole run sorts before the target watch and stays in episode order.
    const base = new Date(watchedAt).getTime();
    const inputs: CreateWatchInput[] = candidates.map((c, i) => ({
      subject,
      tmdbId,
      mediaType: "tv",
      watchedAt: new Date(base - (candidates.length - i) * 1000).toISOString(),
      season: c.season,
      episode: c.episode,
    }));

    const routing = await resolveRouting(agent, await getSession());
    const added = await createWatches(agent, did, inputs, routing.diary);
    return NextResponse.json({ added, first, last });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDS write failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
