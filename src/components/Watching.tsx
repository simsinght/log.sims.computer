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
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link
          href={`/show/${show.tmdbId}`}
          prefetch={false}
          className="line-clamp-1 text-sm font-medium transition-colors hover:text-white"
        >
          {show.title}
        </Link>
        {show.next ? (
          <>
            <p className="text-xs text-gray-400">
              Next · S{show.next.seasonNumber}E{show.next.episodeNumber}
            </p>
            <button
              onClick={() =>
                onLog({
                  tmdbId: show.tmdbId,
                  mediaType: "tv",
                  title: show.title,
                  year: show.year,
                  season: show.next!.seasonNumber,
                  episode: show.next!.episodeNumber,
                  episodeName: show.next!.name,
                })
              }
              className="mt-auto rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-gray-200"
            >
              Just Finished
            </button>
          </>
        ) : (
          <p className="mt-auto text-xs text-gray-500">All caught up</p>
        )}
      </div>
    </div>
  );
}

export default function Watching({
  shows,
  days,
}: {
  shows: WatchingShow[];
  days: DiaryDay[];
}) {
  const router = useRouter();
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <section>
          <h1 className="mb-4 text-3xl font-bold tracking-tight">Watching</h1>
          {shows.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-gray-800 p-10 text-center">
              <p className="text-gray-400">
                Nothing in progress yet.
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Tap the search button to find a show and log your first episode.
              </p>
              <Link
                href="/search"
                className="mt-5 inline-block rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-gray-200"
              >
                Search shows
              </Link>
            </div>
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
