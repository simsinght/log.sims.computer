"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LogDialog from "@/components/LogDialog";
import { LogControl } from "@/components/WatchedMarkers";
import type { EpisodeRef } from "@/lib/nextEpisode";

/**
 * The episode page's watched state and Log control: the same Log / Watched
 * pill as an episode row (larger), opening the same log sheet with the same
 * catch-up progress. Flips to Watched as soon as the sheet reports success;
 * router.refresh() then re-reads the authoritative state.
 */
export default function EpisodeActions({
  tmdbId,
  title,
  year,
  season,
  episode,
  episodeName,
  airDate,
  watched,
  seasonEpisodeCounts,
}: {
  tmdbId: number;
  title: string;
  year: string | null;
  season: number;
  episode: number;
  episodeName: string;
  airDate: string | null;
  watched: EpisodeRef[];
  seasonEpisodeCounts: Record<number, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [justLogged, setJustLogged] = useState(false);

  const serverWatched = watched.some(
    (w) => w.seasonNumber === season && w.episodeNumber === episode,
  );
  const isWatched = serverWatched || justLogged;
  const label = `S${season}E${episode}`;

  return (
    <>
      <LogControl
        label={label}
        isWatched={isWatched}
        onClick={() => setOpen(true)}
        large
      />

      {open && (
        <LogDialog
          target={{
            tmdbId,
            mediaType: "tv",
            title,
            year,
            season,
            episode,
            episodeName,
            airDate,
            progress: {
              watched:
                justLogged && !serverWatched
                  ? [...watched, { seasonNumber: season, episodeNumber: episode }]
                  : watched,
              seasonEpisodeCounts,
            },
          }}
          onClose={() => setOpen(false)}
          onLogged={() => {
            setJustLogged(true);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
