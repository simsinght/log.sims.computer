"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LogDialog, { LogTarget } from "@/components/LogDialog";
import EpisodeArt from "@/components/EpisodeArt";
import { LogControl, episodeKey } from "@/components/WatchedMarkers";
import { airDateLabel } from "@/lib/format";
import { episodeHref } from "@/lib/routes";
import type { EpisodeRef } from "@/lib/nextEpisode";

export interface EpisodeRow {
  episodeNumber: number;
  name: string;
  airDate: string | null;
  stillUrl: string | null;
}

/**
 * One season's episodes as rows: a still thumbnail, number, title and air
 * date linking to the episode page, plus the Log / Watched control on the
 * right (outside the link). Used by the season page and, for a show with a
 * single season, inline on the show page. Owns the log sheet, with the same
 * in-place flip + refresh the old expandable season list had.
 */
export default function EpisodeList({
  tmdbId,
  title,
  year,
  seasonNumber,
  episodes,
  backdropUrl,
  posterUrl,
  watched,
  seasonEpisodeCounts,
  signedIn,
  today,
}: {
  tmdbId: number;
  title: string;
  year: string | null;
  seasonNumber: number;
  episodes: EpisodeRow[];
  // Show art for episodes without a still (EpisodeArt's fallback order).
  backdropUrl: string | null;
  posterUrl: string | null;
  watched: EpisodeRef[];
  seasonEpisodeCounts: Record<number, number>;
  signedIn: boolean;
  today: string;
}) {
  const router = useRouter();
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);
  const [justLogged, setJustLogged] = useState<string[]>([]);

  // Episodes logged here are merged over the server-rendered set so a row
  // flips immediately; router.refresh() then brings back the authoritative
  // list (which also covers episodes a catch-up backfilled).
  const watchedKeys = useMemo(() => {
    const keys = new Set(
      watched.map((w) => episodeKey(w.seasonNumber, w.episodeNumber)),
    );
    for (const key of justLogged) keys.add(key);
    return keys;
  }, [watched, justLogged]);

  if (episodes.length === 0) {
    return <p className="text-sm text-gray-500">No episodes yet.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-gray-800/70">
        {episodes.map((ep) => {
          const label = `S${seasonNumber}E${ep.episodeNumber}`;
          const isWatched = watchedKeys.has(
            episodeKey(seasonNumber, ep.episodeNumber),
          );
          return (
            <li key={ep.episodeNumber} className="flex items-center gap-3 py-2.5">
              <Link
                href={episodeHref(tmdbId, seasonNumber, ep.episodeNumber)}
                prefetch={false}
                className="group flex min-w-0 flex-1 items-center gap-3"
              >
                <EpisodeArt
                  stillUrl={ep.stillUrl}
                  backdropUrl={backdropUrl}
                  posterUrl={posterUrl}
                  sizes="112px"
                  className="!w-24 shrink-0 rounded sm:!w-28"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`line-clamp-2 text-sm leading-snug group-hover:text-white ${
                      isWatched ? "text-gray-400" : ""
                    }`}
                  >
                    <span className="tabular-nums text-gray-500">
                      {ep.episodeNumber}.{" "}
                    </span>
                    {ep.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    {airDateLabel(ep.airDate, today)}
                  </span>
                </span>
              </Link>
              {signedIn && (
                <LogControl
                  label={label}
                  isWatched={isWatched}
                  onClick={() =>
                    setLogTarget({
                      tmdbId,
                      mediaType: "tv",
                      title,
                      year,
                      season: seasonNumber,
                      episode: ep.episodeNumber,
                      episodeName: ep.name,
                      airDate: ep.airDate,
                      progress: {
                        watched: [...watchedKeys].map((key) => {
                          const [s, e] = key.split("-").map(Number);
                          return { seasonNumber: s, episodeNumber: e };
                        }),
                        seasonEpisodeCounts,
                      },
                    })
                  }
                />
              )}
            </li>
          );
        })}
      </ul>

      {logTarget && (
        <LogDialog
          target={logTarget}
          onClose={() => setLogTarget(null)}
          onLogged={() => {
            const key = episodeKey(logTarget.season, logTarget.episode);
            setJustLogged((prev) =>
              prev.includes(key) ? prev : [...prev, key],
            );
            router.refresh();
          }}
        />
      )}
    </>
  );
}
