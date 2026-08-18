"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface SearchResult {
  tmdbId: number;
  mediaType: "tv";
  title: string;
  year: string | null;
  posterPath: string | null;
  overview: string;
}

const POSTER_BASE = "https://image.tmdb.org/t/p/w342";

function PosterCard({ result }: { result: SearchResult }) {
  return (
    <Link
      href={`/show/${result.tmdbId}`}
      prefetch={false}
      className="group block"
    >
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
      </div>
      <div className="mt-2">
        <p className="truncate text-sm font-medium" title={result.title}>
          {result.title}
        </p>
        {result.year && <p className="text-xs text-gray-500">{result.year}</p>}
      </div>
    </Link>
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

function SearchResults() {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim();

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSignedIn(Boolean(data?.authenticated)))
      .catch(() => setSignedIn(false));
  }, []);

  useEffect(() => {
    if (!signedIn || !query) {
      setResults([]);
      setHasSearched(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ q: query });
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
  }, [query, signedIn]);

  if (signedIn === null) {
    return <div className="min-h-screen bg-[#0a0a0a]" />;
  }

  if (!signedIn) {
    return <SignInPrompt />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-6xl px-4 pb-12 pt-6">
        {error && (
          <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && <p className="text-sm text-gray-500">Searching…</p>}

        {!loading && !error && hasSearched && results.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-gray-800 p-12 text-center text-gray-500">
            No results for &ldquo;{query}&rdquo;.
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

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a]" />}>
      <SearchResults />
    </Suspense>
  );
}
