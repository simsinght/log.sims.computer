import type { Agent } from "@atproto/api";
import {
  listCurrentlyWatching,
  listWatches,
  type CurrentlyWatchingItem,
} from "@/lib/atproto/records";
import { PUBLIC_REPO, type WriteDestination } from "@/lib/atproto/write";
import { getSeasonEpisodes, type TmdbEpisode } from "@/lib/tmdb";

export interface NextEpisode {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  airDate: string | null;
}

export interface WatchingShow {
  tmdbId: number;
  title: string;
  year: string | null;
  posterUrl: string | null;
  next: NextEpisode;
}

export interface WatchingResult {
  shows: WatchingShow[];
  // Total shows in the currently-watching list, before caught-up shows are
  // filtered out — lets the home tell "all caught up" apart from "no shows".
  inProgressCount: number;
}

const MAX_CARDS = 12;
// Compute next episodes for more than we show so that caught-up shows, which
// get filtered out, don't leave the grid short of MAX_CARDS.
const CANDIDATE_POOL = 24;

function hasAired(ep: TmdbEpisode, today: string): boolean {
  return ep.airDate !== null && ep.airDate <= today;
}

// The successor of the latest watched episode: the next number in that season,
// or episode 1 of the following season when the finale is already watched. A
// successor that exists on TMDB but hasn't aired yet counts as caught up
// (null), as does a show with no real (non-special) watched episodes.
async function computeNext(
  item: CurrentlyWatchingItem,
  today: string,
): Promise<NextEpisode | null> {
  const real = item.watchedEpisodes.filter((e) => e.seasonNumber >= 1);
  if (real.length === 0) return null;

  let latest = real[0];
  for (const e of real) {
    if (
      e.seasonNumber > latest.seasonNumber ||
      (e.seasonNumber === latest.seasonNumber &&
        e.episodeNumber > latest.episodeNumber)
    ) {
      latest = e;
    }
  }

  const season = await getSeasonEpisodes(
    item.tmdbId,
    latest.seasonNumber,
  ).catch(() => [] as TmdbEpisode[]);
  const maxEp = season.reduce((m, e) => Math.max(m, e.episodeNumber), 0);

  if (latest.episodeNumber < maxEp) {
    const candidate = season.find(
      (e) => e.episodeNumber === latest.episodeNumber + 1,
    );
    if (candidate && hasAired(candidate, today)) {
      return {
        seasonNumber: latest.seasonNumber,
        episodeNumber: candidate.episodeNumber,
        name: candidate.name,
        airDate: candidate.airDate,
      };
    }
    return null;
  }

  const nextSeason = await getSeasonEpisodes(
    item.tmdbId,
    latest.seasonNumber + 1,
  ).catch(() => [] as TmdbEpisode[]);
  const first = nextSeason.find((e) => e.episodeNumber === 1);
  if (first && hasAired(first, today)) {
    return {
      seasonNumber: latest.seasonNumber + 1,
      episodeNumber: 1,
      name: first.name,
      airDate: first.airDate,
    };
  }
  return null;
}

export async function getWatching(
  agent: Agent,
  did: string,
  diaryDest: WriteDestination = PUBLIC_REPO,
): Promise<WatchingResult> {
  const [items, recent] = await Promise.all([
    // Currently-watching is the public Popfeed shelf — unchanged. Only the
    // diary watch records follow the space routing.
    listCurrentlyWatching(agent, did),
    // listWatches over-fetches limit*2 (capped at the 100-record listRecords
    // page), so 50 keeps that request within bounds while covering the shows
    // with recent activity.
    listWatches(agent, did, 50, diaryDest),
  ]);

  // Imported list items share a single addedAt, so rank by the most recent
  // watchedAt seen in recent logs; shows without a recent log fall behind,
  // ordered by addedAt.
  const lastWatched = new Map<number, string>();
  for (const w of recent) {
    if (w.mediaType !== "tv") continue;
    const id = Number(w.tmdbId);
    if (!Number.isInteger(id)) continue;
    const prev = lastWatched.get(id);
    if (!prev || w.watchedAt > prev) lastWatched.set(id, w.watchedAt);
  }

  const ranked = [...items].sort((a, b) => {
    const aw = lastWatched.get(a.tmdbId) ?? "";
    const bw = lastWatched.get(b.tmdbId) ?? "";
    if (aw !== bw) return aw < bw ? 1 : -1;
    return a.addedAt < b.addedAt ? 1 : -1;
  });

  const today = new Date().toISOString().slice(0, 10);
  const candidates = await Promise.all(
    ranked.slice(0, CANDIDATE_POOL).map(async (item) => {
      const next = await computeNext(item, today);
      if (!next) return null;
      return {
        tmdbId: item.tmdbId,
        title: item.title,
        year: item.year,
        posterUrl: item.posterUrl,
        next,
      } satisfies WatchingShow;
    }),
  );

  const shows = candidates
    .filter((s): s is WatchingShow => s !== null)
    .slice(0, MAX_CARDS);

  return { shows, inProgressCount: items.length };
}
