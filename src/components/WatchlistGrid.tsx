"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { WatchlistShow } from "@/lib/atproto/records";

function Card({
  show,
  onRemove,
}: {
  show: WatchlistShow;
  onRemove: (tmdbId: number) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/watchlist?tmdbId=${show.tmdbId}`, {
        method: "DELETE",
      });
      if (res.ok) onRemove(show.tmdbId);
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="group relative">
      <Link href={`/show/${show.tmdbId}`} prefetch={false} className="block">
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-gray-800">
          {show.posterUrl ? (
            <Image
              src={show.posterUrl}
              alt={show.title}
              fill
              sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 160px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-2 text-center text-xs text-gray-500">
              No poster
            </div>
          )}
        </div>
        <div className="mt-2">
          <p className="truncate text-sm font-medium" title={show.title}>
            {show.title}
          </p>
          {show.year && <p className="text-xs text-gray-500">{show.year}</p>}
        </div>
      </Link>
      <button
        onClick={remove}
        disabled={busy}
        aria-label={`Remove ${show.title} from watchlist`}
        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-gray-200 backdrop-blur-sm transition-colors hover:bg-black hover:text-white disabled:opacity-50"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default function WatchlistGrid({
  shows: initial,
}: {
  shows: WatchlistShow[];
}) {
  const [shows, setShows] = useState<WatchlistShow[]>(initial);

  function onRemove(tmdbId: number) {
    setShows((prev) => prev.filter((s) => s.tmdbId !== tmdbId));
  }

  if (shows.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-800 p-10 text-center">
        <p className="text-gray-400">Nothing on your watchlist yet.</p>
        <p className="mt-1 text-sm text-gray-500">
          Find a show and add it to keep track of what to watch next.
        </p>
        <Link
          href="/search"
          className="mt-5 inline-block rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-gray-200"
        >
          Search shows
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {shows.map((show) => (
        <Card key={show.tmdbId} show={show} onRemove={onRemove} />
      ))}
    </div>
  );
}
