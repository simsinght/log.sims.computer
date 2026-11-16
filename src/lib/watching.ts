import type { Agent } from "@atproto/api";
import {
  listCurrentlyWatching,
  listWatches,
  type CurrentlyWatchingItem,
} from "@/lib/atproto/records";
import { PUBLIC_REPO, type WriteDestination } from "@/lib/atproto/write";
import { getSeasonEpisodes, getShowDetail } from "@/lib/tmdb";
import {
  earliestWatched,
  pickNextEpisode,
  seasonFullyWatched,
  type EpisodeRef,
  type NextEpisode,
  type SeasonEpisodeList,
} from "@/lib/nextEpisode";

export type { NextEpisode };

export interface WatchingShow {
  tmdbId: number;
  title: string;
  year: string | null;
  posterUrl: string | null;
  next: NextEpisode;
  // What the log sheet needs to tell whether "Catch up" would backfill
  // anything, without a request: the watched episodes and TMDB's per-season
  // episode counts (real seasons only).
  watched: EpisodeRef[];
  seasonEpisodeCounts: Record<number, number>;
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

// The show's next episode under the shared rule in ./nextEpisode (first
// unwatched aired episode after the earliest watched one; gaps are filled
// before moving past them). Seasons are fetched in order from the earliest
// watched season and the walk stops at the first season holding a pick, so a
// typical show costs one season fetch; seasons whose every episode is already
// watched are skipped without a fetch. null means caught up (or no real
// watched episodes, or TMDB failed — the card is dropped either way, as before).
async function computeNext(
  item: CurrentlyWatchingItem,
  today: string,
): Promise<{
  next: NextEpisode;
  seasonEpisodeCounts: Record<number, number>;
} | null> {
  const start = earliestWatched(item.watchedEpisodes);
  if (!start) return null;

  try {
    const detail = await getShowDetail(item.tmdbId);
    const seasonsToWalk = detail.seasons
      .filter((s) => s.seasonNumber >= 1 && s.seasonNumber >= start.seasonNumber)
      .sort((a, b) => a.seasonNumber - b.seasonNumber);
    const seasonEpisodeCounts: Record<number, number> = {};
    for (const s of detail.seasons) {
      if (s.seasonNumber >= 1) seasonEpisodeCounts[s.seasonNumber] = s.episodeCount;
    }

    const loaded: SeasonEpisodeList[] = [];
    for (const summary of seasonsToWalk) {
      if (
        seasonFullyWatched(
          item.watchedEpisodes,
          summary.seasonNumber,
          summary.episodeCount,
        )
      ) {
        continue;
      }
      const episodes = await getSeasonEpisodes(
        item.tmdbId,
        summary.seasonNumber,
      );
      loaded.push({ seasonNumber: summary.seasonNumber, episodes });
      const next = pickNextEpisode(item.watchedEpisodes, loaded, today);
      if (next) return { next, seasonEpisodeCounts };
    }
    return null;
  } catch {
    return null;
  }
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
      const computed = await computeNext(item, today);
      if (!computed) return null;
      return {
        tmdbId: item.tmdbId,
        title: item.title,
        year: item.year,
        posterUrl: item.posterUrl,
        next: computed.next,
        watched: item.watchedEpisodes,
        seasonEpisodeCounts: computed.seasonEpisodeCounts,
      } satisfies WatchingShow;
    }),
  );

  const shows = candidates
    .filter((s): s is WatchingShow => s !== null)
    .slice(0, MAX_CARDS);

  return { shows, inProgressCount: items.length };
}
