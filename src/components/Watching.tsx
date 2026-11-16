"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LogDialog, { LogTarget } from "@/components/LogDialog";
import EpisodeArt from "@/components/EpisodeArt";
import {
  WATCHING_GRID_CLASS,
  WATCHING_IMAGE_SIZES,
} from "@/components/watchingGrid";
import { episodeHref } from "@/lib/routes";
import type { WatchingShow } from "@/lib/watching";

function WatchingCard({
  show,
  onLog,
}: {
  show: WatchingShow;
  onLog: (target: LogTarget) => void;
}) {
  const label = `S${show.next.seasonNumber}E${show.next.episodeNumber}`;
  const episodeName =
    show.next.name.trim() || `Episode ${show.next.episodeNumber}`;
  // The whole card leads to the episode it is suggesting; the checkmark sits
  // over the art but outside the link, so it logs without navigating.
  const href = episodeHref(
    show.tmdbId,
    show.next.seasonNumber,
    show.next.episodeNumber,
  );
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#141414]">
      <div className="relative">
        <Link
          href={href}
          prefetch={false}
          aria-label={`${show.title} ${label}`}
          className="block"
        >
          <EpisodeArt
            stillUrl={show.stillUrl}
            backdropUrl={show.backdropUrl}
            posterUrl={show.posterUrl}
            sizes={WATCHING_IMAGE_SIZES}
          />
        </Link>
        <button
          onClick={() =>
            onLog({
              tmdbId: show.tmdbId,
              mediaType: "tv",
              title: show.title,
              year: show.year,
              season: show.next.seasonNumber,
              episode: show.next.episodeNumber,
              episodeName: show.next.name,
              airDate: show.next.airDate,
              progress: {
                watched: show.watched,
                seasonEpisodeCounts: show.seasonEpisodeCounts,
              },
            })
          }
          aria-label={`Log ${label}`}
          className="absolute bottom-2 right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-lg shadow-black/40 transition-colors hover:bg-gray-200"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      </div>
      <Link
        href={href}
        prefetch={false}
        className="group flex flex-1 flex-col gap-0.5 p-3"
      >
        <p className="truncate text-sm">
          <span className="font-medium transition-colors group-hover:text-white">
            {show.title}
          </span>
          <span className="text-gray-500"> · {label}</span>
        </p>
        <p className="truncate text-xs text-gray-300">{episodeName}</p>
      </Link>
    </div>
  );
}

function EmptyState({ caughtUp }: { caughtUp: boolean }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-gray-800 p-10 text-center">
      <p className="text-gray-400">
        {caughtUp ? "You're all caught up." : "Nothing in progress yet."}
      </p>
      <p className="mt-1 text-sm text-gray-500">
        {caughtUp
          ? "No new episodes to log right now. Search for something new to watch."
          : "Tap the search button to find a show and log your first episode."}
      </p>
      <Link
        href="/search"
        className="mt-5 inline-block rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-gray-200"
      >
        Search shows
      </Link>
      {!caughtUp && (
        <p className="mt-4">
          <Link
            href="/settings"
            className="text-sm text-gray-400 underline-offset-2 transition-colors hover:text-white hover:underline"
          >
            Import your Trakt history
          </Link>
        </p>
      )}
    </div>
  );
}

export default function Watching({
  shows,
  inProgressCount,
}: {
  shows: WatchingShow[];
  inProgressCount: number;
}) {
  const router = useRouter();
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-3xl px-4 pb-12 pt-6">
        <section>
          {shows.length === 0 ? (
            <EmptyState caughtUp={inProgressCount > 0} />
          ) : (
            <div className={WATCHING_GRID_CLASS}>
              {shows.map((show) => (
                <WatchingCard
                  key={show.tmdbId}
                  show={show}
                  onLog={setLogTarget}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {logTarget && (
        <LogDialog
          target={logTarget}
          onClose={() => setLogTarget(null)}
          onLogged={() => router.refresh()}
        />
      )}
    </div>
  );
}
