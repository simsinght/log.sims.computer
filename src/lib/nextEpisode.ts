/**
 * The "next episode" rule for a show in progress, as a pure function: no
 * network, no TMDB/atproto imports, so scripts/next-episode-check.mjs can load
 * this exact file under Node's native type-stripping and exercise it offline.
 *
 * Rule: take every aired, non-special (season >= 1) episode in (season,
 * episode) order. Find the earliest watched episode; the next episode is the
 * first unwatched one after it. Gaps after where the viewer started are filled
 * before moving past them (watched S1E1 + S1E6 -> S1E2), while seasons before
 * where they started are never suggested (watched S3E1 + S3E2 -> S3E3, not
 * S1E1). When nothing after the earliest watched episode is left unwatched, the
 * show is caught up (null).
 */

export interface EpisodeRef {
  seasonNumber: number;
  episodeNumber: number;
}

export interface NextEpisode {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  airDate: string | null;
}

export interface SeasonEpisodeList {
  seasonNumber: number;
  episodes: { episodeNumber: number; name: string; airDate: string | null }[];
}

// An episode has aired once its YYYY-MM-DD air date is on or before today. A
// missing air date counts as not aired.
export function hasAired(airDate: string | null, today: string): boolean {
  return airDate !== null && airDate <= today;
}

function compare(a: EpisodeRef, b: EpisodeRef): number {
  return a.seasonNumber !== b.seasonNumber
    ? a.seasonNumber - b.seasonNumber
    : a.episodeNumber - b.episodeNumber;
}

// The earliest real (season >= 1) watched episode, or null when there is none
// (empty history, or only specials).
export function earliestWatched(watched: EpisodeRef[]): EpisodeRef | null {
  let earliest: EpisodeRef | null = null;
  for (const e of watched) {
    if (e.seasonNumber < 1) continue;
    if (!earliest || compare(e, earliest) < 0) earliest = e;
  }
  return earliest;
}

/**
 * `seasons` may be any subset of the show's seasons (in any order), as long as
 * every season left out has no unwatched aired episode after the earliest
 * watched one — the caller can skip fetching seasons it already knows are fully
 * watched. Watched entries are a set: a rewatch logged twice counts once.
 */
export function pickNextEpisode(
  watched: EpisodeRef[],
  seasons: SeasonEpisodeList[],
  today: string,
): NextEpisode | null {
  const start = earliestWatched(watched);
  if (!start) return null;

  const seen = new Set(
    watched.map((e) => `${e.seasonNumber}-${e.episodeNumber}`),
  );

  let best: NextEpisode | null = null;
  for (const season of seasons) {
    if (season.seasonNumber < 1 || season.seasonNumber < start.seasonNumber) {
      continue;
    }
    for (const ep of season.episodes) {
      const ref = {
        seasonNumber: season.seasonNumber,
        episodeNumber: ep.episodeNumber,
      };
      if (compare(ref, start) <= 0) continue;
      if (!hasAired(ep.airDate, today)) continue;
      if (seen.has(`${ref.seasonNumber}-${ref.episodeNumber}`)) continue;
      if (best && compare(ref, best) >= 0) continue;
      best = { ...ref, name: ep.name, airDate: ep.airDate };
    }
  }
  return best;
}

/**
 * True when `watched` covers every episode number 1..episodeCount of a season,
 * i.e. the season holds nothing to suggest and needn't be fetched. A season
 * TMDB reports with 0 episodes is never treated as complete (it is cheap to
 * fetch and the count may simply be stale).
 */
export function seasonFullyWatched(
  watched: EpisodeRef[],
  seasonNumber: number,
  episodeCount: number,
): boolean {
  if (episodeCount <= 0) return false;
  const nums = new Set(
    watched
      .filter((e) => e.seasonNumber === seasonNumber)
      .map((e) => e.episodeNumber),
  );
  for (let n = 1; n <= episodeCount; n++) {
    if (!nums.has(n)) return false;
  }
  return true;
}
