"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import LogDialog, { LogTarget } from "@/components/LogDialog";
import { DiaryDays } from "@/components/Diary";
import type { WatchingShow } from "@/lib/watching";
import type { DiaryDay } from "@/lib/diary";

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
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#141414]">
      <Link
        href={`/show/${show.tmdbId}`}
        prefetch={false}
        aria-label={show.title}
        className="block"
      >
        <div className="relative aspect-[2/3] w-full bg-gray-800">
          {show.posterUrl && (
            <Image
              src={show.posterUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 200px, 45vw"
              className="object-cover"
            />
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link
          href={`/show/${show.tmdbId}`}
          prefetch={false}
          className="truncate text-sm font-medium transition-colors hover:text-white"
        >
          {show.title}
        </Link>
        <p className="truncate text-xs text-gray-300">{episodeName}</p>
        <div className="mt-1 flex items-end justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-gray-500">
            {label}
          </p>
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
              })
            }
            aria-label={`Log ${label}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-gray-200"
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
      </div>
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
  days,
}: {
  shows: WatchingShow[];
  inProgressCount: number;
  days: DiaryDay[];
}) {
  const router = useRouter();
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-3xl px-4 pb-12 pt-16">
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Watching</h1>
            <Link
              href="/watchlist"
              className="shrink-0 rounded-full border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
            >
              Watchlist
            </Link>
          </div>
          {shows.length === 0 ? (
            <EmptyState caughtUp={inProgressCount > 0} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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

        {days.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Recent
            </h2>
            <DiaryDays days={days} />
          </section>
        )}
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
