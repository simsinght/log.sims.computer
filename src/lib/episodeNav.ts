import type { EpisodeRef } from "@/lib/nextEpisode";

/**
 * Previous/next episode for an episode page, crossing season boundaries
 * without fetching the neighbouring season: TMDB's per-season episode counts
 * (on the show detail) are enough, with episodes numbered 1..count — the same
 * assumption the catch-up route makes. Real seasons (>= 1) chain into each
 * other; specials (season 0) only step within season 0.
 */
export function adjacentEpisodes(
  seasons: { seasonNumber: number; episodeCount: number }[],
  seasonEpisodeNumbers: number[],
  current: EpisodeRef,
): { prev: EpisodeRef | null; next: EpisodeRef | null } {
  const nums = [...seasonEpisodeNumbers].sort((a, b) => a - b);
  const i = nums.indexOf(current.episodeNumber);
  const s = current.seasonNumber;

  let prev: EpisodeRef | null =
    i > 0 ? { seasonNumber: s, episodeNumber: nums[i - 1] } : null;
  let next: EpisodeRef | null =
    i >= 0 && i < nums.length - 1
      ? { seasonNumber: s, episodeNumber: nums[i + 1] }
      : null;
  if (s < 1) return { prev, next };

  const real = seasons
    .filter((x) => x.seasonNumber >= 1 && x.episodeCount > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
  if (!prev) {
    const before = real.filter((x) => x.seasonNumber < s).at(-1);
    if (before) {
      prev = { seasonNumber: before.seasonNumber, episodeNumber: before.episodeCount };
    }
  }
  if (!next) {
    const after = real.find((x) => x.seasonNumber > s);
    if (after) next = { seasonNumber: after.seasonNumber, episodeNumber: 1 };
  }
  return { prev, next };
}
