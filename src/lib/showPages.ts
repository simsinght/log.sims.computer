import {
  tmdbImageUrl,
  type ShowDetail,
  type TmdbEpisode,
  type TmdbSeasonSummary,
} from "@/lib/tmdb";
import type { EpisodeRow } from "@/components/EpisodeList";

// Episode-row thumbnails are ~112 CSS px wide; w300 is the largest listed
// still size short of the (up to 4K) original and covers that at 2-3x.
const ROW_STILL_SIZE = "w300";
// Show-art fallbacks for a row with no still, at thumbnail size.
const ROW_BACKDROP_SIZE = "w300";
const ROW_POSTER_SIZE = "w185";

export function episodeRows(episodes: TmdbEpisode[]): EpisodeRow[] {
  return episodes.map((e) => ({
    episodeNumber: e.episodeNumber,
    name: e.name,
    airDate: e.airDate,
    runtime: e.runtime,
    stillUrl: tmdbImageUrl(e.stillPath, ROW_STILL_SIZE),
  }));
}

export function rowFallbackArt(show: ShowDetail): {
  backdropUrl: string | null;
  posterUrl: string | null;
} {
  return {
    backdropUrl: tmdbImageUrl(show.backdropPath, ROW_BACKDROP_SIZE),
    posterUrl: tmdbImageUrl(show.posterPath, ROW_POSTER_SIZE),
  };
}

// TMDB's per-season episode counts for real seasons — what the log sheet's
// catch-up decision needs (same shape the home cards pass).
export function seasonEpisodeCounts(
  seasons: TmdbSeasonSummary[],
): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const s of seasons) {
    if (s.seasonNumber >= 1) counts[s.seasonNumber] = s.episodeCount;
  }
  return counts;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
