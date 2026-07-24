const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export type MediaType = "movie" | "tv";
export type SearchType = MediaType | "all";

export interface TmdbSearchResult {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: string | null;
  posterPath: string | null;
  overview: string;
}

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

interface TmdbRawResult {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
}

function yearFromDate(date?: string): string | null {
  if (!date) return null;
  const year = date.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

function normalize(
  raw: TmdbRawResult,
  mediaType: MediaType,
): TmdbSearchResult {
  return {
    tmdbId: raw.id,
    mediaType,
    title: (mediaType === "movie" ? raw.title : raw.name) ?? "",
    year: yearFromDate(
      mediaType === "movie" ? raw.release_date : raw.first_air_date,
    ),
    posterPath: raw.poster_path ?? null,
    overview: raw.overview ?? "",
  };
}

function apiKey(): string | undefined {
  return process.env.TMDB_API_KEY;
}

export function isConfigured(): boolean {
  return Boolean(apiKey());
}

async function tmdbFetch(
  path: string,
  query: string,
): Promise<TmdbRawResult[]> {
  const key = apiKey();
  if (!key) throw new TmdbError("TMDB_API_KEY not configured", 503);

  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("query", query);
  url.searchParams.set("include_adult", "false");

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new TmdbError(`TMDB request failed (${res.status})`, 502);
  }

  const body = (await res.json()) as { results?: TmdbRawResult[] };
  return body.results ?? [];
}

export async function search(
  query: string,
  type: SearchType,
): Promise<TmdbSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (type === "movie") {
    const results = await tmdbFetch("/search/movie", trimmed);
    return results.map((r) => normalize(r, "movie"));
  }

  if (type === "tv") {
    const results = await tmdbFetch("/search/tv", trimmed);
    return results.map((r) => normalize(r, "tv"));
  }

  const results = await tmdbFetch("/search/multi", trimmed);
  return results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .map((r) => normalize(r, r.media_type as MediaType));
}
