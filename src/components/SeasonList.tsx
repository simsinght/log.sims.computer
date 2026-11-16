import Image from "next/image";
import Link from "next/link";
import { SeasonProgress } from "@/components/WatchedMarkers";
import { seasonHref } from "@/lib/routes";
import type { TmdbSeasonSummary } from "@/lib/tmdb";
import type { EpisodeRef } from "@/lib/nextEpisode";

/**
 * The show page's seasons: one flat row per season (small poster, name,
 * episode count, watched progress) linking to that season's page.
 */
export default function SeasonList({
  tmdbId,
  seasons,
  watched,
}: {
  tmdbId: number;
  seasons: TmdbSeasonSummary[];
  watched: EpisodeRef[];
}) {
  const watchedCounts = new Map<number, number>();
  for (const key of new Set(
    watched.map((w) => `${w.seasonNumber}-${w.episodeNumber}`),
  )) {
    const s = Number(key.split("-")[0]);
    watchedCounts.set(s, (watchedCounts.get(s) ?? 0) + 1);
  }

  return (
    <ul className="divide-y divide-gray-800/70">
      {seasons.map((season) => (
        <li key={season.seasonNumber}>
          <Link
            href={seasonHref(tmdbId, season.seasonNumber)}
            prefetch={false}
            className="group flex items-center gap-3 py-2.5"
          >
            <div className="relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded bg-[#1c1c1c]">
              {season.posterUrl && (
                <Image
                  src={season.posterUrl}
                  alt=""
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              )}
            </div>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium group-hover:text-white">
                {season.name}
              </span>
              <span className="block text-sm text-gray-500">
                {[
                  season.airYear,
                  season.episodeCount > 0
                    ? `${season.episodeCount} ${season.episodeCount === 1 ? "episode" : "episodes"}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <SeasonProgress
              watchedCount={watchedCounts.get(season.seasonNumber) ?? 0}
              episodeCount={season.episodeCount}
            />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 shrink-0 text-gray-600"
              aria-hidden="true"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </Link>
        </li>
      ))}
    </ul>
  );
}
