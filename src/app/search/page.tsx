"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type MediaType = "movie" | "tv";
type SearchType = MediaType | "all";

interface SearchResult {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: string | null;
  posterPath: string | null;
  overview: string;
}

const POSTER_BASE = "https://image.tmdb.org/t/p/w342";

const TYPE_OPTIONS: { value: SearchType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV" },
];

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function PosterCard({ result }: { result: SearchResult }) {
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
        <span className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-200">
          {result.mediaType === "tv" ? "TV" : "Movie"}
        </span>
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

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<SearchType>("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const debouncedQuery = useDebounced(query.trim(), 300);

  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      setHasSearched(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ q: debouncedQuery, type });
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
  }, [debouncedQuery, type]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-gray-500 transition-colors hover:text-gray-300"
          >
            &larr; log.sims.computer
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Search</h1>
          <p className="mt-1 text-gray-400">
            Find a movie or TV show to log.
          </p>
        </div>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies & TV…"
            autoFocus
            className="w-full rounded-lg border border-gray-800 bg-[#141414] px-4 py-3 text-base placeholder-gray-600 outline-none transition-colors focus:border-gray-600"
          />
          <div className="flex shrink-0 rounded-lg border border-gray-800 p-1">
            {TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setType(option.value)}
                className={
                  "rounded-md px-3 py-1.5 text-sm transition-colors " +
                  (type === option.value
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-gray-200")
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <p className="text-sm text-gray-500">Searching…</p>
        )}

        {!loading && !error && !hasSearched && (
          <div className="rounded-lg border-2 border-dashed border-gray-800 p-12 text-center text-gray-500">
            Start typing to search TMDB for movies and TV shows.
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
