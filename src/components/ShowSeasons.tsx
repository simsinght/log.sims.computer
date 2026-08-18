"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import LogDialog, { LogTarget } from "@/components/LogDialog";
import type { TmdbEpisode, TmdbSeasonSummary } from "@/lib/tmdb";

export interface WatchedPosition {
  seasonNumber: number;
  episodeNumber: number;
}

interface ShowSeasonsProps {
  tmdbId: number;
  title: string;
  year: string | null;
  seasons: TmdbSeasonSummary[];
  watched: WatchedPosition[];
}

interface SeasonState {
  episodes: TmdbEpisode[];
  loading: boolean;
  error: string | null;
}

function episodeKey(season: number, episode: number): string {
  return `${season}-${episode}`;
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SeasonProgress({
  watchedCount,
  episodeCount,
}: {
  watchedCount: number;
  episodeCount: number;
}) {
  if (episodeCount <= 0 || watchedCount <= 0) return null;
  if (watchedCount >= episodeCount) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-green-400">
        <CheckIcon className="h-3.5 w-3.5" />
        Watched
      </span>
    );
  }
  return (
    <span className="shrink-0 text-xs text-gray-400">
      {watchedCount} of {episodeCount} watched
    </span>
  );
}

function SeasonPanel({
  tmdbId,
  title,
  year,
  season,
  watched,
  watchedCount,
  onLog,
}: {
  tmdbId: number;
  title: string;
  year: string | null;
  season: TmdbSeasonSummary;
  watched: Set<string>;
  watchedCount: number;
  onLog: (target: LogTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SeasonState>({
    episodes: [],
    loading: false,
    error: null,
  });

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && state.episodes.length === 0 && !state.error) {
      setState({ episodes: [], loading: true, error: null });
      try {
        const res = await fetch(
          `/api/tmdb/season?show=${tmdbId}&season=${season.seasonNumber}`
        );
        if (!res.ok) throw new Error("Failed to load episodes");
        const data = (await res.json()) as { episodes: TmdbEpisode[] };
        setState({ episodes: data.episodes, loading: false, error: null });
      } catch {
        setState({
          episodes: [],
          loading: false,
          error: "Couldn't load episodes.",
        });
      }
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-800 bg-[#141414]">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-baseline gap-2">
          <span className="font-medium">{season.name}</span>
          {season.episodeCount > 0 && (
            <span className="text-sm text-gray-500">
              {season.episodeCount} episodes
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <SeasonProgress
            watchedCount={watchedCount}
            episodeCount={season.episodeCount}
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-800">
          {state.loading && (
            <p className="px-4 py-3 text-sm text-gray-500">Loading episodes…</p>
          )}
          {state.error && (
            <p className="px-4 py-3 text-sm text-red-300">{state.error}</p>
          )}
          {!state.loading && !state.error && state.episodes.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-500">No episodes yet.</p>
          )}
          <ul>
            {state.episodes.map((ep) => {
              const label = `S${season.seasonNumber}E${ep.episodeNumber}`;
              const isWatched = watched.has(
                episodeKey(season.seasonNumber, ep.episodeNumber),
              );
              return (
                <li
                  key={ep.episodeNumber}
                  className="flex items-center gap-3 border-t border-gray-800/70 px-4 py-2.5 first:border-t-0"
                >
                  <span className="w-7 shrink-0 text-sm tabular-nums text-gray-500">
                    {ep.episodeNumber}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      isWatched ? "text-gray-400" : ""
                    }`}
                  >
                    {ep.name}
                  </span>
                  <button
                    onClick={() =>
                      onLog({
                        tmdbId,
                        mediaType: "tv",
                        title,
                        year,
                        season: season.seasonNumber,
                        episode: ep.episodeNumber,
                        episodeName: ep.name,
                        airDate: ep.airDate,
                      })
                    }
                    aria-label={
                      isWatched ? `Log again ${label}` : `Log ${label}`
                    }
                    className={
                      isWatched
                        ? "flex shrink-0 items-center gap-1 rounded-full border border-green-900/70 bg-green-950/40 px-2.5 py-1 text-xs font-medium text-green-300 transition-colors hover:border-green-700 hover:text-green-200"
                        : "shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-black transition-colors hover:bg-gray-200"
                    }
                  >
                    {isWatched ? (
                      <>
                        <CheckIcon className="h-3 w-3" />
                        Watched
                      </>
                    ) : (
                      "Log"
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ShowSeasons({
  tmdbId,
  title,
  year,
  seasons,
  watched,
}: ShowSeasonsProps) {
  const router = useRouter();
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);
  const [justLogged, setJustLogged] = useState<string[]>([]);

  // Episodes logged from this page are merged over the server-rendered set so a
  // row flips immediately; router.refresh() then brings back the authoritative
  // list (which also covers episodes a catch-up backfilled).
  const watchedKeys = useMemo(() => {
    const keys = new Set(
      watched.map((w) => episodeKey(w.seasonNumber, w.episodeNumber)),
    );
    for (const key of justLogged) keys.add(key);
    return keys;
  }, [watched, justLogged]);

  const watchedCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const key of watchedKeys) {
      const seasonNumber = Number(key.split("-")[0]);
      counts.set(seasonNumber, (counts.get(seasonNumber) ?? 0) + 1);
    }
    return counts;
  }, [watchedKeys]);

  return (
    <>
      <div className="space-y-2">
        {seasons.map((season) => (
          <SeasonPanel
            key={season.seasonNumber}
            tmdbId={tmdbId}
            title={title}
            year={year}
            season={season}
            watched={watchedKeys}
            watchedCount={watchedCounts.get(season.seasonNumber) ?? 0}
            onLog={setLogTarget}
          />
        ))}
      </div>

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
