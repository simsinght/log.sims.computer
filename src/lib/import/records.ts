/**
 * atproto write helpers for the importer: value builders that mirror
 * src/lib/atproto/records.ts byte-for-byte (bulk mode — posterUrl instead of an
 * uploaded blob), the rate-limit backoff wrapper, and list/idempotency helpers.
 * Erasable-syntax-only (shared by the CLI and the web route).
 */
import type { Agent } from "@atproto/api";
import type { MediaType, WorkGroup, WatchedEpisode, PlayEvent } from "./parse.ts";
import type { WorkDetail } from "./tmdb.ts";
import {
  PUBLIC_REPO,
  createRecord as writeCreate,
  listRecords as seamListRecords,
} from "../atproto/write.ts";

export const LIST_COLLECTION = "social.popfeed.feed.list";
export const LIST_ITEM_COLLECTION = "social.popfeed.feed.listItem";
export const WATCH_COLLECTION = "computer.sims.log.watch";
export const IMPORT_TAG = "trakt-import";
export const WRITE_BATCH = 200;

export type ListType =
  | "watched_movies"
  | "currently_watching_tv_shows"
  | "watched_tv_shows"
  | "movie_watchlist"
  | "tv_show_watchlist";

export const LIST_NAMES: Record<ListType, string> = {
  watched_movies: "Watched Movies",
  currently_watching_tv_shows: "Currently Watching",
  watched_tv_shows: "Watched Shows",
  movie_watchlist: "Movie Watchlist",
  tv_show_watchlist: "TV Watchlist",
};

export interface RepoRecord {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
}

export interface StrongRef {
  uri: string;
  cid: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function listAllRecords(
  agent: Agent,
  did: string,
  collection: string,
): Promise<RepoRecord[]> {
  const out: RepoRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 500; page++) {
    const res = await seamListRecords(agent, PUBLIC_REPO, {
      repo: did,
      collection,
      limit: 100,
      cursor,
    });
    for (const r of res.records) {
      out.push({
        uri: r.uri,
        cid: r.cid,
        value: r.value,
      });
    }
    cursor = res.cursor;
    if (!cursor || res.records.length === 0) break;
  }
  return out;
}

export interface RateLimitOptions {
  // Called before sleeping out a rate-limit window, with the wait in ms.
  onWait?: (waitMs: number) => void;
}

export async function withRateLimit<T>(
  fn: () => Promise<T>,
  opts: RateLimitOptions = {},
): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as { status?: number; headers?: Record<string, string> };
      const rateLimited =
        e.status === 429 ||
        (err as Error).message?.includes("RateLimitExceeded");
      if (!rateLimited || attempt === 7) throw err;
      const reset = Number(e.headers?.["ratelimit-reset"]);
      const retryAfter = Number(e.headers?.["retry-after"]);
      let waitMs = 5000;
      if (Number.isFinite(retryAfter)) waitMs = retryAfter * 1000;
      else if (Number.isFinite(reset))
        waitMs = Math.max(1000, reset * 1000 - Date.now());
      opts.onWait?.(waitMs);
      await sleep(waitMs + 500);
    }
  }
  throw new Error("unreachable");
}

export function targetListType(
  g: WorkGroup,
  detail: WorkDetail | null,
): ListType {
  if (g.mediaType === "movie") return "watched_movies";
  const total = detail?.numberOfEpisodes ?? null;
  if (total !== null && g.episodes.size >= total) return "watched_tv_shows";
  return "currently_watching_tv_shows";
}

export async function ensureList(
  agent: Agent,
  did: string,
  listType: ListType,
  existingLists: RepoRecord[],
  cache: Map<ListType, string>,
): Promise<string> {
  const cached = cache.get(listType);
  if (cached) return cached;
  const existing = existingLists.find((r) => r.value.listType === listType);
  if (existing) {
    cache.set(listType, existing.uri);
    return existing.uri;
  }
  const created = await withRateLimit(() =>
    writeCreate(agent, PUBLIC_REPO, {
      repo: did,
      collection: LIST_COLLECTION,
      record: {
        $type: LIST_COLLECTION,
        name: LIST_NAMES[listType],
        listType,
        authorDid: did,
        description: "",
        createdAt: new Date().toISOString(),
      },
      validate: false,
    }),
  );
  existingLists.push({ uri: created.uri, cid: created.cid, value: {} });
  cache.set(listType, created.uri);
  return created.uri;
}

export function buildListItemValue(
  g: WorkGroup,
  detail: WorkDetail | null,
  listUri: string,
  listType: ListType,
  addedAt: string,
  mergedEpisodes: WatchedEpisode[],
): Record<string, unknown> {
  const identifiers: Record<string, string> = { tmdbId: String(g.tmdbId) };
  const imdb = detail?.imdbId ?? g.imdbId;
  if (imdb) identifiers.imdbId = imdb;

  const value: Record<string, unknown> = {
    $type: LIST_ITEM_COLLECTION,
    title: g.title || detail?.title || "",
    identifiers,
    creativeWorkType: g.mediaType === "movie" ? "movie" : "tv_show",
    listUri,
    listType,
    addedAt,
  };
  if (detail) {
    if (detail.genres.length) value.genres = detail.genres;
    if (detail.releaseDate) value.releaseDate = detail.releaseDate;
    if (detail.posterUrl) value.posterUrl = detail.posterUrl;
    if (detail.backdropUrl) value.backdropUrl = detail.backdropUrl;
    if (detail.mainCredit) value.mainCredit = detail.mainCredit;
    if (detail.mainCreditRole) value.mainCreditRole = detail.mainCreditRole;
  }
  if (mergedEpisodes.length > 0) value.watchedEpisodes = mergedEpisodes;
  return value;
}

export function buildWatchValue(
  ev: PlayEvent,
  rewatch: boolean,
  subject: StrongRef,
): Record<string, unknown> {
  const value: Record<string, unknown> = {
    $type: WATCH_COLLECTION,
    subject,
    tmdbId: String(ev.workTmdbId),
    mediaType: ev.mediaType,
    watchedAt: ev.watchedAt,
    createdAt: new Date().toISOString(),
    tags: [IMPORT_TAG],
  };
  if (rewatch) value.rewatch = true;
  if (ev.season !== undefined) value.season = ev.season;
  if (ev.episode !== undefined) value.episode = ev.episode;
  return value;
}

export function planWatchValue(
  ev: PlayEvent,
  rewatch: boolean,
): Record<string, unknown> {
  return buildWatchValue(ev, rewatch, { uri: "", cid: "" });
}

export function watchKey(v: Record<string, unknown>): string {
  return [v.tmdbId ?? "", v.watchedAt ?? "", v.season ?? "", v.episode ?? ""].join(
    "|",
  );
}

export function mergeEpisodes(
  prev: WatchedEpisode[],
  next: WatchedEpisode[],
): WatchedEpisode[] {
  const out = new Map<string, WatchedEpisode>();
  for (const e of prev) out.set(`${e.seasonNumber}-${e.episodeNumber}`, e);
  for (const e of next) {
    const k = `${e.seasonNumber}-${e.episodeNumber}`;
    if (!out.has(k)) out.set(k, e);
  }
  return [...out.values()];
}

// Index existing listItems by `${movie|tv}:${tmdbId}` for the create/update diff.
export function indexExistingItems(
  existingItems: RepoRecord[],
): Map<string, RepoRecord> {
  const itemByTmdb = new Map<string, RepoRecord>();
  for (const it of existingItems) {
    const ids = (it.value.identifiers ?? {}) as Record<string, unknown>;
    const t = ids.tmdbId ?? ids.tmdbTvSeriesId;
    const cwt = it.value.creativeWorkType === "movie" ? "movie" : "tv";
    if (t) itemByTmdb.set(`${cwt}:${t}`, it);
  }
  return itemByTmdb;
}
