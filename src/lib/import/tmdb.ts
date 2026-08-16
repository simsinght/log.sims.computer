/**
 * TMDB detail fetching for the importer. Kept separate from src/lib/tmdb.ts on
 * purpose: this variant adds numberOfEpisodes (used to decide watched vs
 * currently-watching) and is erasable-syntax-only so the CLI can strip-types it.
 * Bulk economics: posters are NOT uploaded as blobs — posterUrl points straight
 * at the TMDB w500 image; per-episode ids come from the Trakt event, so no
 * per-episode TMDB lookups are made.
 */
import type { MediaType, WorkGroup, Logger } from "./parse.ts";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
const TMDB_CONCURRENCY = 4;

export interface WorkDetail {
  tmdbId: number;
  title: string;
  releaseDate: string | null;
  genres: string[];
  posterUrl: string | null;
  backdropUrl: string | null;
  imdbId: string | null;
  mainCredit: string | null;
  mainCreditRole: "director" | "network" | null;
  numberOfEpisodes: number | null;
}

function isoDate(d?: string | null): string | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return `${d}T00:00:00.000Z`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let tmdbCalls = 0;
export function getTmdbCallCount(): number {
  return tmdbCalls;
}

async function tmdbJson(path: string): Promise<Record<string, unknown>> {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY not configured");
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", key);
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 429) {
      const retry = Number(res.headers.get("retry-after") ?? "1");
      await sleep((Number.isFinite(retry) ? retry : 1) * 1000 + 250);
      continue;
    }
    tmdbCalls++;
    if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`);
    return (await res.json()) as Record<string, unknown>;
  }
  throw new Error(`TMDB rate-limited repeatedly for ${path}`);
}

const detailCache = new Map<string, WorkDetail | null>();

export function getCachedDetail(
  type: MediaType,
  id: number,
): WorkDetail | null {
  return detailCache.get(`${type}:${id}`) ?? null;
}

export async function getWorkDetail(
  type: MediaType,
  id: number,
): Promise<WorkDetail | null> {
  const cacheKey = `${type}:${id}`;
  if (detailCache.has(cacheKey)) return detailCache.get(cacheKey) ?? null;

  let detail: WorkDetail | null = null;
  try {
    const raw = await tmdbJson(
      type === "movie" ? `/movie/${id}?append_to_response=credits` : `/tv/${id}`,
    );
    const posterPath = (raw.poster_path as string | null) ?? null;
    const backdropPath = (raw.backdrop_path as string | null) ?? null;
    const genres = ((raw.genres as { name?: string }[] | undefined) ?? [])
      .map((g) => g.name)
      .filter((n): n is string => Boolean(n));

    let mainCredit: string | null = null;
    let mainCreditRole: "director" | "network" | null = null;
    if (type === "movie") {
      const crew =
        (raw.credits as { crew?: { job?: string; name?: string }[] } | undefined)
          ?.crew ?? [];
      mainCredit = crew.find((c) => c.job === "Director")?.name ?? null;
      mainCreditRole = mainCredit ? "director" : null;
    } else {
      const networks = (raw.networks as { name?: string }[] | undefined) ?? [];
      mainCredit = networks[0]?.name ?? null;
      mainCreditRole = mainCredit ? "network" : null;
    }

    detail = {
      tmdbId: raw.id as number,
      title: ((type === "movie" ? raw.title : raw.name) as string) ?? "",
      releaseDate: isoDate(
        (type === "movie" ? raw.release_date : raw.first_air_date) as string,
      ),
      genres,
      posterUrl: posterPath ? `${TMDB_IMAGE_BASE}/w500${posterPath}` : null,
      backdropUrl: backdropPath
        ? `${TMDB_IMAGE_BASE}/original${backdropPath}`
        : null,
      imdbId: type === "movie" ? ((raw.imdb_id as string | null) ?? null) : null,
      mainCredit,
      mainCreditRole,
      numberOfEpisodes:
        typeof raw.number_of_episodes === "number"
          ? raw.number_of_episodes
          : null,
    };
  } catch (err) {
    detail = null;
    throw Object.assign(
      new Error(
        `TMDB detail failed for ${type}/${id}: ${(err as Error).message}`,
      ),
      { tmdbType: type, tmdbId: id },
    );
  } finally {
    detailCache.set(cacheKey, detail);
  }
  return detail;
}

export interface PrefetchOptions {
  concurrency?: number;
  log?: Logger;
  onError?: (message: string) => void;
}

export async function prefetchDetails(
  works: WorkGroup[],
  opts: PrefetchOptions = {},
): Promise<void> {
  const concurrency = opts.concurrency ?? TMDB_CONCURRENCY;
  let i = 0;
  async function worker(): Promise<void> {
    while (i < works.length) {
      const w = works[i++];
      try {
        await getWorkDetail(w.mediaType, w.tmdbId);
      } catch (err) {
        opts.onError?.((err as Error).message);
      }
      if (i % 50 === 0 && opts.log) opts.log(`  TMDB: ${i}/${works.length} works`);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, works.length) }, worker),
  );
}
