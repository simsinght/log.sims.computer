"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import LogDialog, { LogTarget } from "@/components/LogDialog";

interface SearchResult {
  tmdbId: number;
  mediaType: "tv";
  title: string;
  year: string | null;
  posterPath: string | null;
  overview: string;
}

const POSTER_BASE = "https://image.tmdb.org/t/p/w342";

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function PosterCard({
  result,
  onLog,
}: {
  result: SearchResult;
  onLog: (target: LogTarget) => void;
}) {
  return (
    <div className="group">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-gray-800">
        {result.posterPath ? (
          <Image
            src={`${POSTER_BASE}${result.posterPath}`}
            alt={result.title}
            fill
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 160px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-xs text-gray-500">
            No poster
          </div>
        )}
        <button
          onClick={() =>
            onLog({
              tmdbId: result.tmdbId,
              mediaType: result.mediaType,
              title: result.title,
              year: result.year,
            })
          }
          className="absolute inset-x-1 bottom-1 rounded bg-white/90 py-2 text-xs font-semibold text-black opacity-0 transition-opacity hover:bg-white group-hover:opacity-100 focus:opacity-100"
        >
          Log
        </button>
      </div>
      <div className="mt-2">
        <p className="truncate text-sm font-medium" title={result.title}>
          {result.title}
        </p>
        {result.year && <p className="text-xs text-gray-500">{result.year}</p>}
      </div>
    </div>
  );
}

function SignInPrompt() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-6 text-center text-[#ededed]">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to search</h1>
      <p className="mt-2 text-gray-400">Search is available once you sign in.</p>
      <Link
        href="/login"
        className="mt-8 rounded-full bg-white px-8 py-3 text-base font-semibold text-black transition-colors hover:bg-gray-200"
      >
        Sign in
      </Link>
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);

  const debouncedQuery = useDebounced(query.trim(), 300);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSignedIn(Boolean(data?.authenticated)))
      .catch(() => setSignedIn(false));
  }, []);

  useEffect(() => {
    if (!signedIn || !debouncedQuery) {
      setResults([]);
      setHasSearched(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ q: debouncedQuery });
    fetch(`/api/tmdb/search?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Search failed");
        }
        return res.json();
      })
      .then((data: { results: SearchResult[] }) => {
        setResults(data.results);
        setHasSearched(true);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
        setHasSearched(true);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [debouncedQuery, signedIn]);

  if (signedIn === null) {
    return <div className="min-h-screen bg-[#0a0a0a]" />;
  }

  if (!signedIn) {
    return <SignInPrompt />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-gray-500 transition-colors hover:text-gray-300"
          >
            &larr; tvlog
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Search</h1>
          <p className="mt-1 text-gray-400">Find a show to log.</p>
        </div>

        <div className="mb-8">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search TV shows…"
            autoFocus
            className="w-full rounded-lg border border-gray-800 bg-[#141414] px-4 py-3 text-base placeholder-gray-600 outline-none transition-colors focus:border-gray-600"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && <p className="text-sm text-gray-500">Searching…</p>}

        {!loading && !error && !hasSearched && (
          <div className="rounded-lg border-2 border-dashed border-gray-800 p-12 text-center text-gray-500">
            Start typing to search TMDB for TV shows.
          </div>
        )}

        {!loading && !error && hasSearched && results.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-gray-800 p-12 text-center text-gray-500">
            No results for &ldquo;{debouncedQuery}&rdquo;.
          </div>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {results.map((result) => (
              <PosterCard
                key={`${result.mediaType}-${result.tmdbId}`}
                result={result}
                onLog={setLogTarget}
              />
            ))}
          </div>
        )}
      </div>

      {logTarget && (
        <LogDialog target={logTarget} onClose={() => setLogTarget(null)} />
      )}
    </div>
  );
}
