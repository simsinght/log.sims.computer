import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEpisodeDetail,
  getSeasonEpisodes,
  getShowDetail,
  isConfigured,
  tmdbImageUrl,
  type EpisodeDetail,
  type TmdbEpisode,
} from "@/lib/tmdb";
import { errFields } from "@/lib/atproto/spaces";
import EpisodeArt from "@/components/EpisodeArt";
import EpisodeActions from "@/components/EpisodeActions";
import PeopleRow from "@/components/PeopleRow";
import ClampedText from "@/components/ClampedText";
import { getShowWatchState } from "@/lib/showState";
import { adjacentEpisodes } from "@/lib/episodeNav";
import {
  episodeHref,
  parseRouteInt,
  seasonHref,
  showHref,
} from "@/lib/routes";
import { seasonEpisodeCounts, todayIso } from "@/lib/showPages";
import { airDateLabel, formatRuntime } from "@/lib/format";
import type { EpisodeRef } from "@/lib/nextEpisode";
import { requireAgent } from "@/lib/requireAuth";

export const dynamic = "force-dynamic";

// The header spans the max-w-3xl column (768px); w1280 covers that at ~1.7x
// and a full-width phone at 3x, without pulling a 4K original upstream.
const HEADER_IMAGE_SIZE = "w1280";

function NeighbourLink({
  tmdbId,
  target,
  name,
  direction,
}: {
  tmdbId: number;
  target: EpisodeRef;
  name: string | null;
  direction: "prev" | "next";
}) {
  const label = `S${target.seasonNumber}E${target.episodeNumber}`;
  return (
    <Link
      href={episodeHref(tmdbId, target.seasonNumber, target.episodeNumber)}
      prefetch={false}
      rel={direction}
      className={`group min-w-0 flex-1 ${direction === "next" ? "text-right" : ""}`}
    >
      <span className="block text-xs text-gray-500">
        {direction === "prev" ? `← Previous · ${label}` : `Next · ${label} →`}
      </span>
      {name && (
        <span className="block truncate text-sm text-gray-300 group-hover:text-white">
          {name}
        </span>
      )}
    </Link>
  );
}

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ tmdbId: string; season: string; episode: string }>;
}) {
  // Signed-in only (middleware redirects first; this also catches a cookie
  // whose OAuth session was wiped by a restart).
  await requireAgent();
  const p = await params;
  const tmdbId = parseRouteInt(p.tmdbId, 1);
  const seasonNumber = parseRouteInt(p.season, 0);
  const episodeNumber = parseRouteInt(p.episode, 0);
  if (
    tmdbId === null ||
    seasonNumber === null ||
    episodeNumber === null ||
    !isConfigured()
  ) {
    notFound();
  }

  let show;
  try {
    show = await getShowDetail(tmdbId);
  } catch {
    notFound();
  }
  const season = show.seasons.find((s) => s.seasonNumber === seasonNumber);
  if (!season) notFound();

  // The season list (cached, and usually already fetched by the home or the
  // season page) settles whether the episode exists and gives its neighbours;
  // only then is the episode itself fetched for its credits, so a bad URL costs
  // no extra TMDB call. Either fetch may fail without the other.
  const loadEpisode = async () => {
    const seasonEpisodes = await getSeasonEpisodes(tmdbId, seasonNumber).catch(
      (err): TmdbEpisode[] | null => {
        console.error("[episode] season episodes failed", {
          tmdbId,
          season: seasonNumber,
          ...errFields(err),
        });
        return null;
      },
    );
    if (
      seasonEpisodes &&
      !seasonEpisodes.some((e) => e.episodeNumber === episodeNumber)
    ) {
      return { seasonEpisodes, detail: null };
    }
    const detail = await getEpisodeDetail(
      tmdbId,
      seasonNumber,
      episodeNumber,
    ).catch((err): EpisodeDetail | null => {
      console.error("[episode] episode detail failed", {
        tmdbId,
        season: seasonNumber,
        episode: episodeNumber,
        ...errFields(err),
      });
      return null;
    });
    return { seasonEpisodes, detail };
  };
  const [state, { seasonEpisodes, detail }] = await Promise.all([
    getShowWatchState(tmdbId, "episode"),
    loadEpisode(),
  ]);

  const listed =
    seasonEpisodes?.find((e) => e.episodeNumber === episodeNumber) ?? null;
  if (seasonEpisodes && !listed) notFound();
  const episode: TmdbEpisode | null = detail ?? listed;
  if (!episode) notFound();

  const name = episode.name.trim() || `Episode ${episodeNumber}`;
  const label = `S${seasonNumber}E${episodeNumber}`;
  const today = todayIso();
  const meta = [airDateLabel(episode.airDate, today), formatRuntime(episode.runtime)]
    .filter(Boolean)
    .join(" · ");

  const { prev, next } = adjacentEpisodes(
    show.seasons,
    seasonEpisodes?.map((e) => e.episodeNumber) ?? [episodeNumber],
    { seasonNumber, episodeNumber },
  );
  // Neighbour titles are known when they sit in this season.
  const nameOf = (ref: EpisodeRef | null) =>
    ref && ref.seasonNumber === seasonNumber
      ? (seasonEpisodes?.find((e) => e.episodeNumber === ref.episodeNumber)
          ?.name ?? null)
      : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-3xl pb-16 sm:px-4 sm:pt-6">
        <EpisodeArt
          stillUrl={tmdbImageUrl(episode.stillPath, HEADER_IMAGE_SIZE)}
          backdropUrl={tmdbImageUrl(show.backdropPath, HEADER_IMAGE_SIZE)}
          posterUrl={show.posterUrl}
          sizes="(min-width: 768px) 768px, 100vw"
          priority
          className="sm:rounded-lg"
        />

        <div className="px-4 sm:px-0">
          <p className="mt-4 truncate text-sm text-gray-400">
            <Link
              href={showHref(show.tmdbId)}
              prefetch={false}
              className="transition-colors hover:text-white"
            >
              {show.title}
            </Link>
            <span className="text-gray-600"> · </span>
            <Link
              href={seasonHref(show.tmdbId, seasonNumber)}
              prefetch={false}
              className="transition-colors hover:text-white"
            >
              {season.name}
            </Link>
          </p>
          <h1 className="mt-1 text-xl font-bold leading-tight tracking-tight sm:text-2xl">
            <span className="text-gray-500">{label} · </span>
            {name}
          </h1>
          {meta && <p className="mt-1 text-sm text-gray-500">{meta}</p>}

          {state.signedIn && (
            <div className="mt-4">
              <EpisodeActions
                tmdbId={show.tmdbId}
                title={show.title}
                year={show.year}
                season={seasonNumber}
                episode={episodeNumber}
                episodeName={episode.name}
                airDate={episode.airDate}
                watched={state.watched}
                seasonEpisodeCounts={seasonEpisodeCounts(show.seasons)}
              />
            </div>
          )}

          {/* Straight under the title/Log control: below the people lists it
              sat a long scroll down on a phone. */}
          {episode.overview && (
            <ClampedText text={episode.overview} className="mt-4" />
          )}

          {detail ? (
            <PeopleRow
              idPrefix="episode-people"
              groups={[
                { id: "guests", label: "Guest stars", people: detail.guestStars },
                { id: "cast", label: "Cast", people: detail.cast },
                { id: "crew", label: "Crew", people: detail.crew },
              ]}
            />
          ) : (
            <p className="mt-8 text-sm text-gray-500">
              Couldn&apos;t load the cast for this episode.
            </p>
          )}

          {(prev || next) && (
            <nav
              aria-label="More episodes"
              className="mt-8 flex gap-4 border-t border-gray-800/70 pt-4"
            >
              {prev ? (
                <NeighbourLink
                  tmdbId={show.tmdbId}
                  target={prev}
                  name={nameOf(prev)}
                  direction="prev"
                />
              ) : (
                <span className="flex-1" />
              )}
              {next ? (
                <NeighbourLink
                  tmdbId={show.tmdbId}
                  target={next}
                  name={nameOf(next)}
                  direction="next"
                />
              ) : (
                <span className="flex-1" />
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
