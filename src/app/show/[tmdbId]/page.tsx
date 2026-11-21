import { Suspense } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  getSeasonEpisodes,
  getShowCredits,
  getShowDetail,
  isConfigured,
  type TmdbEpisode,
  type ShowCredits,
} from "@/lib/tmdb";
import { errFields } from "@/lib/atproto/spaces";
import WatchlistButton from "@/components/WatchlistButton";
import SeasonList from "@/components/SeasonList";
import EpisodeList from "@/components/EpisodeList";
import PeopleRow from "@/components/PeopleRow";
import { ShowNotes } from "@/components/ShowNotes";
import { getShowWatchState } from "@/lib/showState";
import { parseRouteInt } from "@/lib/routes";
import {
  episodeRows,
  rowFallbackArt,
  seasonEpisodeCounts,
  todayIso,
} from "@/lib/showPages";
import { requireAgent } from "@/lib/requireAuth";

export const dynamic = "force-dynamic";

const sectionHeading =
  "mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500";

export default async function ShowPage({
  params,
}: {
  params: Promise<{ tmdbId: string }>;
}) {
  // Signed-in only (middleware redirects first; this also catches a cookie
  // whose OAuth session was wiped by a restart).
  await requireAgent();
  const { tmdbId: raw } = await params;
  const tmdbId = parseRouteInt(raw, 1);
  if (tmdbId === null || !isConfigured()) notFound();

  let show;
  try {
    show = await getShowDetail(tmdbId);
  } catch {
    notFound();
  }

  // A show with exactly one real season (specials don't count) lists that
  // season's episodes right here instead of making you tap through to it.
  const realSeasons = show.seasons.filter((s) => s.seasonNumber >= 1);
  const onlySeason = realSeasons.length === 1 ? realSeasons[0] : null;

  // The account state, the cast and (for a one-season show) the episodes are
  // independent; none of them may take the page down.
  const [state, credits, inlineEpisodes] = await Promise.all([
    getShowWatchState(tmdbId, "show"),
    getShowCredits(tmdbId, show.creators).catch((err): ShowCredits => {
      console.error("[show] credits failed; rendering without them", {
        tmdbId,
        ...errFields(err),
      });
      return { cast: [], crew: [] };
    }),
    onlySeason
      ? getSeasonEpisodes(tmdbId, onlySeason.seasonNumber).catch(
          (err): TmdbEpisode[] | null => {
            console.error("[show] season episodes failed; listing seasons", {
              tmdbId,
              season: onlySeason.seasonNumber,
              ...errFields(err),
            });
            return null;
          },
        )
      : Promise.resolve(null),
  ]);

  // Inline episodes replace that one season's row; anything else (specials)
  // still gets a row.
  const listedSeasons =
    onlySeason && inlineEpisodes
      ? show.seasons.filter((s) => s.seasonNumber !== onlySeason.seasonNumber)
      : show.seasons;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      {show.backdropUrl && (
        <div className="relative h-48 w-full sm:h-64">
          <Image
            src={show.backdropUrl}
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-top opacity-40"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
        </div>
      )}

      <div className="container mx-auto max-w-3xl px-4 pb-16">
        <div className={show.backdropUrl ? "relative -mt-7" : "pt-8"}>
          <div className="flex gap-4">
            {show.posterUrl && (
              <div className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-md bg-gray-800 sm:w-32">
                <Image
                  src={show.posterUrl}
                  alt={show.title}
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                {show.title}
              </h1>
              {show.year && (
                <p className="mt-1 text-gray-400">{show.year}</p>
              )}
            </div>
          </div>

          {state.listState && (
            <div className="mt-4">
              <WatchlistButton
                tmdbId={show.tmdbId}
                title={show.title}
                initialState={state.listState}
              />
            </div>
          )}

          {show.overview && (
            <p className="mt-4 text-sm leading-relaxed text-gray-300">
              {show.overview}
            </p>
          )}
        </div>

        {onlySeason && inlineEpisodes && (
          <section className="mt-8">
            <h2 className={sectionHeading}>Episodes</h2>
            <EpisodeList
              tmdbId={show.tmdbId}
              title={show.title}
              year={show.year}
              seasonNumber={onlySeason.seasonNumber}
              episodes={episodeRows(inlineEpisodes)}
              {...rowFallbackArt(show)}
              watched={state.watched}
              seasonEpisodeCounts={seasonEpisodeCounts(show.seasons)}
              signedIn={state.signedIn}
              today={todayIso()}
            />
          </section>
        )}

        {(listedSeasons.length > 0 || !onlySeason) && (
          <section className="mt-8">
            <h2 className={sectionHeading}>
              {onlySeason && inlineEpisodes ? "More" : "Seasons"}
            </h2>
            {listedSeasons.length === 0 ? (
              <p className="text-sm text-gray-500">No seasons listed.</p>
            ) : (
              <SeasonList
                tmdbId={show.tmdbId}
                seasons={listedSeasons}
                watched={state.watched}
              />
            )}
          </section>
        )}

        <PeopleRow
          idPrefix="show-people"
          groups={[
            { id: "cast", label: "Cast", people: credits.cast },
            { id: "crew", label: "Crew", people: credits.crew },
          ]}
        />

        {/* Streams in after the page: the first read builds the diary index. */}
        <Suspense fallback={null}>
          <ShowNotes tmdbId={show.tmdbId} />
        </Suspense>
      </div>
    </div>
  );
}
