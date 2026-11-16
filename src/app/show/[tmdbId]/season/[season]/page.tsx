import Link from "next/link";
import { notFound } from "next/navigation";
import { getSeasonEpisodes, getShowDetail, isConfigured } from "@/lib/tmdb";
import { errFields } from "@/lib/atproto/spaces";
import EpisodeList from "@/components/EpisodeList";
import { SeasonProgress } from "@/components/WatchedMarkers";
import { getShowWatchState } from "@/lib/showState";
import { parseRouteInt, seasonHref, showHref } from "@/lib/routes";
import {
  episodeRows,
  rowFallbackArt,
  seasonEpisodeCounts,
  todayIso,
} from "@/lib/showPages";

export const dynamic = "force-dynamic";

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ tmdbId: string; season: string }>;
}) {
  const { tmdbId: rawId, season: rawSeason } = await params;
  const tmdbId = parseRouteInt(rawId, 1);
  const seasonNumber = parseRouteInt(rawSeason, 0);
  if (tmdbId === null || seasonNumber === null || !isConfigured()) notFound();

  let show;
  try {
    show = await getShowDetail(tmdbId);
  } catch {
    notFound();
  }
  const season = show.seasons.find((s) => s.seasonNumber === seasonNumber);
  if (!season) notFound();

  const [state, episodes] = await Promise.all([
    getShowWatchState(tmdbId, "season"),
    getSeasonEpisodes(tmdbId, seasonNumber).catch((err) => {
      console.error("[season] episodes failed; rendering error state", {
        tmdbId,
        season: seasonNumber,
        ...errFields(err),
      });
      return null;
    }),
  ]);

  const watchedHere = new Set(
    state.watched
      .filter((w) => w.seasonNumber === seasonNumber)
      .map((w) => w.episodeNumber),
  ).size;

  // Neighbouring seasons in the show's own order (specials last).
  const index = show.seasons.indexOf(season);
  const prevSeason = index > 0 ? show.seasons[index - 1] : null;
  const nextSeason =
    index < show.seasons.length - 1 ? show.seasons[index + 1] : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-3xl px-4 pb-16 pt-6">
        <Link
          href={showHref(show.tmdbId)}
          prefetch={false}
          className="text-sm text-gray-400 transition-colors hover:text-white"
        >
          {show.title}
        </Link>
        <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight">
          {season.name}
        </h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
          <span>
            {[
              season.airYear,
              season.episodeCount > 0
                ? `${season.episodeCount} ${season.episodeCount === 1 ? "episode" : "episodes"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <SeasonProgress
            watchedCount={watchedHere}
            episodeCount={season.episodeCount}
          />
        </div>

        <div className="mt-5">
          {episodes === null ? (
            <p className="text-sm text-red-300">Couldn&apos;t load episodes.</p>
          ) : (
            <EpisodeList
              tmdbId={show.tmdbId}
              title={show.title}
              year={show.year}
              seasonNumber={seasonNumber}
              episodes={episodeRows(episodes)}
              {...rowFallbackArt(show)}
              watched={state.watched}
              seasonEpisodeCounts={seasonEpisodeCounts(show.seasons)}
              signedIn={state.signedIn}
              today={todayIso()}
            />
          )}
        </div>

        {(prevSeason || nextSeason) && (
          <nav className="mt-8 flex justify-between gap-4 border-t border-gray-800/70 pt-4 text-sm">
            {prevSeason ? (
              <Link
                href={seasonHref(show.tmdbId, prevSeason.seasonNumber)}
                prefetch={false}
                className="text-gray-400 transition-colors hover:text-white"
              >
                &larr; {prevSeason.name}
              </Link>
            ) : (
              <span />
            )}
            {nextSeason && (
              <Link
                href={seasonHref(show.tmdbId, nextSeason.seasonNumber)}
                prefetch={false}
                className="text-right text-gray-400 transition-colors hover:text-white"
              >
                {nextSeason.name} &rarr;
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
