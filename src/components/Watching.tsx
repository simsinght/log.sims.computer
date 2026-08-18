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
      <div className="relative">
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
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <p className="truncate text-sm">
          <Link
            href={`/show/${show.tmdbId}`}
            prefetch={false}
            className="font-medium transition-colors hover:text-white"
          >
            {show.title}
          </Link>
          <span className="text-gray-500"> · {label}</span>
        </p>
        <p className="truncate text-xs text-gray-300">{episodeName}</p>
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
      <div className="container mx-auto max-w-3xl px-4 pb-12 pt-6">
        <section>
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
