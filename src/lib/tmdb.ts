const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

/**
 * TMDB image sizes as this app uses them (from GET /configuration; measured on
 * real images):
 * - posters: 2:3 (w92 · w154 · w185 · w342 · w500 · w780 · original)
 * - backdrops: 16:9 (w300 · w780 · w1280 · original)
 * - episode stills: 16:9, the same frame as backdrops. Configuration lists only
 *   w92 · w185 · w300 · original for stills, and an original can be a 4K frame
 *   (~1.5 MB), but the image server also renders stills at the backdrop sizes
 *   w780/w1280 — those are what cards and the episode header ask for.
 * - profile photos: 2:3 (w45 · w185 · h632 · original)
 */
export function tmdbImageUrl(
  path: string | null | undefined,
  size: string,
): string | null {
  return path ? `${TMDB_IMAGE_BASE_URL}/${size}${path}` : null;
}

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

// Dev aid: with TMDB_LOG_REQUESTS=1, every outbound TMDB API call is logged
// (path only — never the query string, which carries the key). This is how
// the per-surface TMDB counts in docs/access-patterns.md are measured.
function logRequest(path: string): void {
  if (process.env.TMDB_LOG_REQUESTS === "1") console.log(`[tmdb] GET ${path}`);
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
  logRequest(path);

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
  logRequest(path);

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
  logRequest(path);

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

export interface TmdbSeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  posterUrl: string | null;
  airYear: string | null;
}

export interface ShowDetail {
  tmdbId: number;
  title: string;
  year: string | null;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  // Raw TMDB paths, for callers that need another size (tmdbImageUrl).
  posterPath: string | null;
  backdropPath: string | null;
  seasons: TmdbSeasonSummary[];
}

interface TmdbSeasonRaw {
  season_number?: number;
  name?: string;
  episode_count?: number;
  poster_path?: string | null;
  air_date?: string | null;
}

interface TmdbShowRaw extends TmdbDetailRaw {
  overview?: string;
  seasons?: TmdbSeasonRaw[];
}

const showDetailCache = new Map<number, ShowDetail>();

export async function getShowDetail(id: number): Promise<ShowDetail> {
  const cached = showDetailCache.get(id);
  if (cached) return cached;

  const raw = (await tmdbDetailJson(`/tv/${id}`)) as TmdbShowRaw;
  const posterPath = raw.poster_path ?? null;
  const backdropPath = raw.backdrop_path ?? null;

  const seasons: TmdbSeasonSummary[] = (raw.seasons ?? [])
    .filter((s) => typeof s.season_number === "number")
    .map((s) => ({
      seasonNumber: s.season_number as number,
      name: s.name ?? `Season ${s.season_number}`,
      episodeCount: s.episode_count ?? 0,
      posterUrl: s.poster_path
        ? `${TMDB_IMAGE_BASE_URL}/w185${s.poster_path}`
        : null,
      airYear: yearFromDate(s.air_date ?? undefined),
    }))
    // Specials (season 0) sort to the end; real seasons ascending.
    .sort((a, b) => {
      if (a.seasonNumber === 0) return 1;
      if (b.seasonNumber === 0) return -1;
      return a.seasonNumber - b.seasonNumber;
    });

  const detail: ShowDetail = {
    tmdbId: raw.id,
    title: raw.name ?? "",
    year: yearFromDate(raw.first_air_date),
    overview: raw.overview ?? "",
    posterUrl: posterPath ? `${TMDB_IMAGE_BASE_URL}/w500${posterPath}` : null,
    backdropUrl: backdropPath
      ? `${TMDB_IMAGE_BASE_URL}/original${backdropPath}`
      : null,
    posterPath,
    backdropPath,
    seasons,
  };
  showDetailCache.set(id, detail);
  return detail;
}

export interface TmdbEpisode {
  episodeNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  tmdbId: string | null;
  // Raw still path (16:9 frame; build a URL with tmdbImageUrl). null is common
  // for unaired or very new episodes.
  stillPath: string | null;
  runtime: number | null;
}

interface TmdbEpisodeRaw {
  id?: number;
  episode_number?: number;
  name?: string;
  overview?: string;
  air_date?: string | null;
  still_path?: string | null;
  runtime?: number | null;
}

function normalizeEpisode(e: TmdbEpisodeRaw): TmdbEpisode {
  return {
    episodeNumber: e.episode_number as number,
    name: e.name ?? `Episode ${e.episode_number}`,
    overview: e.overview ?? "",
    airDate: e.air_date || null,
    tmdbId: typeof e.id === "number" ? String(e.id) : null,
    stillPath: e.still_path ?? null,
    runtime: typeof e.runtime === "number" && e.runtime > 0 ? e.runtime : null,
  };
}

const seasonEpisodesCache = new Map<string, TmdbEpisode[]>();
const episodeIdCache = new Map<string, string | null>();

export async function getSeasonEpisodes(
  showId: number,
  seasonNumber: number,
): Promise<TmdbEpisode[]> {
  const cacheKey = `${showId}:${seasonNumber}`;
  const cached = seasonEpisodesCache.get(cacheKey);
  if (cached) return cached;

  const raw = (await tmdbDetailJson(
    `/tv/${showId}/season/${seasonNumber}`,
  )) as { episodes?: TmdbEpisodeRaw[] };

  const episodes: TmdbEpisode[] = (raw.episodes ?? [])
    .filter((e) => typeof e.episode_number === "number")
    .map(normalizeEpisode);

  // The season payload already carries every episode id, so seed the
  // per-episode cache and spare later getEpisodeTmdbId calls a round-trip each.
  for (const ep of episodes) {
    episodeIdCache.set(
      `${showId}:${seasonNumber}:${ep.episodeNumber}`,
      ep.tmdbId,
    );
  }

  seasonEpisodesCache.set(cacheKey, episodes);
  return episodes;
}

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

export interface TmdbPerson {
  id: number;
  name: string;
  character: string;
  profileUrl: string | null;
  // Show-level cast only: episodes this person appears in across the series.
  episodeCount?: number;
}

interface TmdbCastRaw {
  id?: number;
  name?: string;
  character?: string;
  profile_path?: string | null;
  order?: number;
}

const PROFILE_SIZE = "w185";

function normalizePeople(raw: TmdbCastRaw[] | undefined): TmdbPerson[] {
  return (raw ?? [])
    .filter((p) => typeof p.id === "number" && p.name)
    .map((p) => ({
      id: p.id as number,
      name: p.name as string,
      character: p.character ?? "",
      profileUrl: tmdbImageUrl(p.profile_path, PROFILE_SIZE),
    }));
}

export interface EpisodeDetail extends TmdbEpisode {
  // Guest stars in TMDB's billing order, then the season regulars credited on
  // this episode. TMDB returns the same guest list at the top level and under
  // credits.guest_stars; the top-level one is used.
  guestStars: TmdbPerson[];
  cast: TmdbPerson[];
}

interface TmdbEpisodeDetailRaw extends TmdbEpisodeRaw {
  guest_stars?: TmdbCastRaw[];
  credits?: { cast?: TmdbCastRaw[] };
}

const episodeDetailCache = new Map<string, EpisodeDetail>();

/** One episode with its credits: one TMDB call, cached like the rest. */
export async function getEpisodeDetail(
  showId: number,
  season: number,
  episode: number,
): Promise<EpisodeDetail> {
  const cacheKey = `${showId}:${season}:${episode}`;
  const cached = episodeDetailCache.get(cacheKey);
  if (cached) return cached;

  const raw = (await tmdbDetailJson(
    `/tv/${showId}/season/${season}/episode/${episode}?append_to_response=credits`,
  )) as TmdbEpisodeDetailRaw;
  const detail: EpisodeDetail = {
    ...normalizeEpisode({ ...raw, episode_number: raw.episode_number ?? episode }),
    guestStars: normalizePeople(raw.guest_stars),
    cast: normalizePeople(raw.credits?.cast),
  };
  episodeDetailCache.set(cacheKey, detail);
  episodeIdCache.set(cacheKey, detail.tmdbId);
  return detail;
}

interface TmdbAggregateCastRaw extends TmdbCastRaw {
  total_episode_count?: number;
  roles?: { character?: string; episode_count?: number }[];
}

// Series regulars only — aggregate_credits lists everyone who ever appeared
// (hundreds of people, ~0.5 MB for a long-running show); only the head of the
// list is kept in memory.
const SHOW_CAST_LIMIT = 15;
const showCastCache = new Map<number, TmdbPerson[]>();

/**
 * Show-level cast from aggregate_credits (every season, with episode counts),
 * not /credits — /credits reflects only the latest season, so it drops
 * regulars who left (Stranger Things loses Natalia Dyer and Joe Keery) and is
 * short for long shows (The Simpsons: 6 people). Kept in TMDB's order, which
 * is by episode count — its per-person `order` field mixes billing indices
 * from different seasons and would rank one-off guests above recurring cast.
 */
export async function getShowCast(showId: number): Promise<TmdbPerson[]> {
  const cached = showCastCache.get(showId);
  if (cached) return cached;

  const raw = (await tmdbDetailJson(
    `/tv/${showId}/aggregate_credits`,
  )) as { cast?: TmdbAggregateCastRaw[] };
  const cast = (raw.cast ?? [])
    .filter((p) => typeof p.id === "number" && p.name)
    .slice(0, SHOW_CAST_LIMIT)
    .map((p) => {
      // A role played in the most episodes is the one to show.
      const role = [...(p.roles ?? [])].sort(
        (a, b) => (b.episode_count ?? 0) - (a.episode_count ?? 0),
      )[0];
      return {
        id: p.id as number,
        name: p.name as string,
        character: role?.character ?? "",
        profileUrl: tmdbImageUrl(p.profile_path, PROFILE_SIZE),
        episodeCount: p.total_episode_count,
      };
    });
  showCastCache.set(showId, cast);
  return cast;
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
