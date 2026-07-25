const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

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

export interface TmdbTitle {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: string | null;
}

const titleCache = new Map<string, TmdbTitle>();

async function tmdbDetail(path: string): Promise<TmdbRawResult> {
  const key = apiKey();
  if (!key) throw new TmdbError("TMDB_API_KEY not configured", 503);

  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", key);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new TmdbError(`TMDB request failed (${res.status})`, 502);
  }
  return (await res.json()) as TmdbRawResult;
}

export async function getTitle(
  type: MediaType,
  id: number,
): Promise<TmdbTitle> {
  const cacheKey = `${type}:${id}`;
  const cached = titleCache.get(cacheKey);
  if (cached) return cached;

  const raw = await tmdbDetail(`/${type}/${id}`);
  const normalized = normalize(raw, type);
  const title: TmdbTitle = {
    tmdbId: normalized.tmdbId,
    mediaType: type,
    title: normalized.title,
    year: normalized.year,
  };
  titleCache.set(cacheKey, title);
  return title;
}

interface TmdbGenre {
  id: number;
  name: string;
}

interface TmdbCrewMember {
  job?: string;
  name?: string;
}

interface TmdbNetwork {
  name?: string;
}

interface TmdbDetailRaw {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  imdb_id?: string | null;
  genres?: TmdbGenre[];
  networks?: TmdbNetwork[];
  credits?: { crew?: TmdbCrewMember[] };
}

export interface WorkDetail {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  releaseDate: string | null;
  genres: string[];
  posterPath: string | null;
  backdropPath: string | null;
  imdbId: string | null;
  mainCredit: string | null;
  mainCreditRole: "director" | "network" | null;
  posterUrl: (size: string) => string | null;
  backdropUrl: string | null;
}

function isoDate(date?: string): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${date}T00:00:00.000Z`;
}

async function tmdbDetailJson(path: string): Promise<TmdbDetailRaw> {
  const key = apiKey();
  if (!key) throw new TmdbError("TMDB_API_KEY not configured", 503);

  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", key);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new TmdbError(`TMDB request failed (${res.status})`, 502);
  }
  return (await res.json()) as TmdbDetailRaw;
}

const detailCache = new Map<string, WorkDetail>();

export async function getWorkDetail(
  type: MediaType,
  id: number,
): Promise<WorkDetail> {
  const cacheKey = `${type}:${id}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return cached;

  const path =
    type === "movie"
      ? `/movie/${id}?append_to_response=credits`
      : `/tv/${id}`;
  const raw = await tmdbDetailJson(path);

  const posterPath = raw.poster_path ?? null;
  const backdropPath = raw.backdrop_path ?? null;

  let mainCredit: string | null = null;
  let mainCreditRole: "director" | "network" | null = null;
  if (type === "movie") {
    const director = raw.credits?.crew?.find((c) => c.job === "Director");
    mainCredit = director?.name ?? null;
    mainCreditRole = mainCredit ? "director" : null;
  } else {
    mainCredit = raw.networks?.[0]?.name ?? null;
    mainCreditRole = mainCredit ? "network" : null;
  }

  const detail: WorkDetail = {
    tmdbId: raw.id,
    mediaType: type,
    title: (type === "movie" ? raw.title : raw.name) ?? "",
    releaseDate: isoDate(type === "movie" ? raw.release_date : raw.first_air_date),
    genres: (raw.genres ?? []).map((g) => g.name).filter(Boolean),
    posterPath,
    backdropPath,
    imdbId: type === "movie" ? (raw.imdb_id ?? null) : null,
    mainCredit,
    mainCreditRole,
    posterUrl: (size: string) =>
      posterPath ? `${TMDB_IMAGE_BASE_URL}/${size}${posterPath}` : null,
    backdropUrl: backdropPath
      ? `${TMDB_IMAGE_BASE_URL}/original${backdropPath}`
      : null,
  };
  detailCache.set(cacheKey, detail);
  return detail;
}

const episodeIdCache = new Map<string, string | null>();

export async function getEpisodeTmdbId(
  showId: number,
  season: number,
  episode: number,
): Promise<string | null> {
  const cacheKey = `${showId}:${season}:${episode}`;
  const cached = episodeIdCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result: string | null = null;
  try {
    const raw = await tmdbDetailJson(
      `/tv/${showId}/season/${season}/episode/${episode}`,
    );
    result = typeof raw.id === "number" ? String(raw.id) : null;
  } catch {
    result = null;
  }
  episodeIdCache.set(cacheKey, result);
  return result;
}

export async function fetchPosterJpeg(
  posterPath: string,
  size = "w500",
): Promise<Uint8Array | null> {
  const res = await fetch(`${TMDB_IMAGE_BASE_URL}/${size}${posterPath}`);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
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
