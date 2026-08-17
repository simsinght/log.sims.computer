"use client";

import { useState } from "react";
import LogDialog, { LogTarget } from "@/components/LogDialog";
import type { TmdbEpisode, TmdbSeasonSummary } from "@/lib/tmdb";

interface ShowSeasonsProps {
  tmdbId: number;
  title: string;
  year: string | null;
  seasons: TmdbSeasonSummary[];
}

interface SeasonState {
  episodes: TmdbEpisode[];
  loading: boolean;
  error: string | null;
}

function SeasonPanel({
  tmdbId,
  title,
  year,
  season,
  onLog,
}: {
  tmdbId: number;
  title: string;
  year: string | null;
  season: TmdbSeasonSummary;
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
          `/api/tmdb/season?show=${tmdbId}&season=${season.seasonNumber}`,
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
            {state.episodes.map((ep) => (
              <li
                key={ep.episodeNumber}
                className="flex items-center gap-3 border-t border-gray-800/70 px-4 py-2.5 first:border-t-0"
              >
                <span className="w-7 shrink-0 text-sm tabular-nums text-gray-500">
                  {ep.episodeNumber}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
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
                  className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-black transition-colors hover:bg-gray-200"
                >
                  Log
                </button>
              </li>
            ))}
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
}: ShowSeasonsProps) {
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);

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
            onLog={setLogTarget}
          />
        ))}
      </div>

      {logTarget && (
        <LogDialog target={logTarget} onClose={() => setLogTarget(null)} />
      )}
    </>
  );
}
