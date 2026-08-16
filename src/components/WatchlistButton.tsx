"use client";

import { useState } from "react";
import type { ShowListState } from "@/lib/atproto/records";

export default function WatchlistButton({
  tmdbId,
  title,
  initialState,
}: {
  tmdbId: number;
  title: string;
  initialState: ShowListState;
}) {
  const [state, setState] = useState<ShowListState>(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A show already being watched or fully watched isn't a watchlist candidate;
  // show its status rather than an add/remove control.
  if (state === "watching" || state === "watched") {
    return (
      <span className="inline-flex items-center rounded-full border border-gray-800 bg-[#141414] px-3 py-1.5 text-xs font-medium text-gray-400">
        {state === "watching" ? "Watching" : "Watched"}
      </span>
    );
  }

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId, title }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to add");
      }
      setState("watchlist");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/watchlist?tmdbId=${tmdbId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to remove");
      }
      setState("none");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  const onWatchlist = state === "watchlist";

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onWatchlist ? remove : add}
        disabled={busy}
        aria-label={onWatchlist ? "Remove from watchlist" : "Add to watchlist"}
        className={
          onWatchlist
            ? "inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:opacity-50"
            : "inline-flex items-center gap-1.5 rounded-full border border-gray-700 px-4 py-1.5 text-sm font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:opacity-50"
        }
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          {onWatchlist ? <path d="M20 6 9 17l-5-5" /> : <path d="M12 5v14M5 12h14" />}
        </svg>
        {onWatchlist ? "On Watchlist" : "Add to Watchlist"}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
