import type { Agent } from "@atproto/api";
import {
  getWorkDetail,
  getEpisodeTmdbId,
  fetchPosterJpeg,
  type WorkDetail,
} from "@/lib/tmdb";
import {
  PUBLIC_REPO,
  createRecord as writeCreate,
  putRecord as writePut,
  deleteRecord as writeDelete,
  applyWritesCreate,
  listRecords as seamListRecords,
  type WriteDestination,
} from "@/lib/atproto/write";
import type { WatchlistRoute } from "@/lib/atproto/routing";
import { SpaceCredentialManager } from "@/lib/atproto/space-credentials";
import { spaceMemberDids } from "@/lib/atproto/spaces";

export const LIST_COLLECTION = "social.popfeed.feed.list";
export const LIST_ITEM_COLLECTION = "social.popfeed.feed.listItem";
export const WATCH_COLLECTION = "computer.sims.log.watch";
// The shared-watchlist space's record type. A lightweight per-show entry —
// written into each member's own space-repo, no Popfeed list/blob machinery.
// Spaces don't validate lexicons, so this ships without a lexicon file.
export const WATCHLIST_ITEM_COLLECTION = "computer.sims.log.watchlistItem";

// applyWrites accepts up to 200 operations per request.
const WRITE_BATCH = 200;

type MediaType = "movie" | "tv";

// Popfeed keys "watched" state by which media-type-specific list an item lives
// in — there is no status field. Movies land in watched_movies; a show logged
// per-episode is "currently watching", a show logged whole is "watched".
export type ListType =
  | "watched_movies"
  | "currently_watching_tv_shows"
  | "watched_tv_shows"
  | "movie_watchlist"
  | "tv_show_watchlist";

const LIST_NAMES: Record<ListType, string> = {
  watched_movies: "Watched Movies",
  currently_watching_tv_shows: "Currently Watching",
  watched_tv_shows: "Watched Shows",
  movie_watchlist: "Movie Watchlist",
  tv_show_watchlist: "TV Watchlist",
};

function targetListType(mediaType: MediaType, isPerEpisode: boolean): ListType {
  if (mediaType === "movie") return "watched_movies";
  return isPerEpisode ? "currently_watching_tv_shows" : "watched_tv_shows";
}

interface StrongRef {
  uri: string;
  cid: string;
}

export interface WatchedEpisode {
  seasonNumber: number;
  episodeNumber: number;
  tmdbId?: string;
}

interface ListItemValue {
  identifiers: Record<string, string>;
  creativeWorkType: string;
  listUri: string;
  listType: string;
  title?: string;
  addedAt: string;
  watchedEpisodes?: WatchedEpisode[];
  [key: string]: unknown;
}

// key: `${did}:${listType}` -> list uri
const listUriCache = new Map<string, string>();

export async function listAllRecords(
  agent: Agent,
  did: string,
  collection: string,
  maxPages = 20,
): Promise<{ uri: string; cid: string; value: Record<string, unknown> }[]> {
  const out: { uri: string; cid: string; value: Record<string, unknown> }[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
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

export async function ensureList(
  agent: Agent,
  did: string,
  listType: ListType,
): Promise<string> {
  const cacheKey = `${did}:${listType}`;
  const cached = listUriCache.get(cacheKey);
  if (cached) return cached;

  const lists = await listAllRecords(agent, did, LIST_COLLECTION);
  const existing = lists.find((r) => r.value.listType === listType);
  if (existing) {
    listUriCache.set(cacheKey, existing.uri);
    return existing.uri;
  }

  const created = await writeCreate(agent, PUBLIC_REPO, {
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
  });
  listUriCache.set(cacheKey, created.uri);
  return created.uri;
}

function matchesWork(
  value: Record<string, unknown>,
  creativeWorkType: string,
  idStr: string,
): boolean {
  if (value.creativeWorkType !== creativeWorkType) return false;
  const identifiers = value.identifiers as Record<string, unknown> | undefined;
  if (!identifiers) return false;
  // Match on tmdbId; also honor the legacy tmdbTvSeriesId key so pre-migration
  // TV items still resolve.
  return (
    identifiers.tmdbId === idStr || identifiers.tmdbTvSeriesId === idStr
  );
}

interface RepoRecord {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
}

async function findWorkItem(
  agent: Agent,
  did: string,
  creativeWorkType: string,
  tmdbId: number,
): Promise<RepoRecord | null> {
  const idStr = String(tmdbId);
  const items = await listAllRecords(agent, did, LIST_ITEM_COLLECTION);
  return (
    items.find((r) => matchesWork(r.value, creativeWorkType, idStr)) ?? null
  );
}

export interface ShowListItem {
  uri: string;
  cid: string;
  state: ShowListState;
  watchedEpisodes: WatchedEpisode[];
}

// The show's listItem as the catch-up planner and show page need it: where it
// lives, which list it sits on, and which episodes the account has already
// marked watched. Null when the show has never been added to any list.
export async function getShowListItem(
  agent: Agent,
  did: string,
  tmdbId: number,
): Promise<ShowListItem | null> {
  const existing = await findWorkItem(agent, did, "tv_show", tmdbId);
  if (!existing) return null;
  const raw = Array.isArray(existing.value.watchedEpisodes)
    ? (existing.value.watchedEpisodes as WatchedEpisode[])
    : [];
  return {
    uri: existing.uri,
    cid: existing.cid,
    state: stateFromListType(existing.value.listType),
    watchedEpisodes: raw.filter(
      (e) =>
        typeof e?.seasonNumber === "number" &&
        typeof e?.episodeNumber === "number",
    ),
  };
}

function dedupeEpisodes(episodes: WatchedEpisode[]): WatchedEpisode[] {
  const seen = new Set<string>();
  const out: WatchedEpisode[] = [];
  for (const ep of episodes) {
    const key = `${ep.seasonNumber}-${ep.episodeNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ep);
  }
  return out;
}

interface Blob {
  $type: "blob";
  ref: unknown;
  mimeType: string;
  size: number;
}

// The card on popfeed.social is drawn from these denormalized fields, so every
// listItem write carries the full TMDB-derived display set plus an uploaded
// poster blob. Uploading a blob costs a round-trip, so we reuse an existing
// item's blob rather than re-uploading on every episode log.
export interface DisplayFields {
  title: string;
  identifiers: Record<string, string>;
  genres?: string[];
  releaseDate?: string;
  posterUrl?: string;
  poster?: Blob;
  backdropUrl?: string;
  mainCredit?: string;
  mainCreditRole?: string;
}

export async function buildDisplayFields(
  agent: Agent,
  did: string,
  detail: WorkDetail,
  title: string,
  existingPoster?: Blob,
  existingPosterUrl?: string,
): Promise<DisplayFields> {
  const identifiers: Record<string, string> = { tmdbId: String(detail.tmdbId) };
  if (detail.imdbId) identifiers.imdbId = detail.imdbId;

  const fields: DisplayFields = {
    title: title || detail.title,
    identifiers,
    genres: detail.genres,
  };
  if (detail.releaseDate) fields.releaseDate = detail.releaseDate;
  if (detail.backdropUrl) fields.backdropUrl = detail.backdropUrl;
  if (detail.mainCredit) fields.mainCredit = detail.mainCredit;
  if (detail.mainCreditRole) fields.mainCreditRole = detail.mainCreditRole;

  if (existingPoster && existingPosterUrl) {
    fields.poster = existingPoster;
    fields.posterUrl = existingPosterUrl;
  } else if (detail.posterPath) {
    const bytes = await fetchPosterJpeg(detail.posterPath);
    if (bytes) {
      const uploaded = await agent.uploadBlob(bytes, { encoding: "image/jpeg" });
      const blob = uploaded.data.blob;
      fields.poster = blob as unknown as Blob;
      fields.posterUrl = `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/${blob.ref.toString()}@jpeg`;
    }
  }
  return fields;
}

export interface UpsertWorkInput {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  watchedAt: string;
  season?: number;
  episode?: number;
  // Extra episodes to merge into watchedEpisodes in the same putRecord, on top
  // of the season/episode pair above. Used by catch-up backfill.
  episodes?: WatchedEpisode[];
}

export async function upsertListItem(
  agent: Agent,
  did: string,
  input: UpsertWorkInput,
): Promise<StrongRef> {
  const creativeWorkType = input.mediaType === "movie" ? "movie" : "tv_show";
  const isPerEpisode =
    input.mediaType === "tv" &&
    (input.season !== undefined || input.episode !== undefined);
  const listType = targetListType(input.mediaType, isPerEpisode);
  const listUri = await ensureList(agent, did, listType);

  const detail = await getWorkDetail(input.mediaType, input.tmdbId);

  // Match on tmdbId across ALL lists, not just the target one. A show sitting in
  // the watchlist is found here and putRecord'd in place with the new listType +
  // listUri, so its first logged episode migrates it out of the watchlist into
  // currently-watching rather than creating a duplicate.
  const existing = await findWorkItem(
    agent,
    did,
    creativeWorkType,
    input.tmdbId,
  );

  const now = new Date().toISOString();
  const prev = existing?.value as ListItemValue | undefined;

  const display = await buildDisplayFields(
    agent,
    did,
    detail,
    input.title,
    prev?.poster as Blob | undefined,
    typeof prev?.posterUrl === "string" ? prev.posterUrl : undefined,
  );

  const episodes = [...(prev?.watchedEpisodes ?? [])];
  if (
    input.mediaType === "tv" &&
    input.season !== undefined &&
    input.episode !== undefined
  ) {
    const epTmdbId = await getEpisodeTmdbId(
      input.tmdbId,
      input.season,
      input.episode,
    );
    const entry: WatchedEpisode = {
      seasonNumber: input.season,
      episodeNumber: input.episode,
    };
    if (epTmdbId) entry.tmdbId = epTmdbId;
    episodes.push(entry);
  }
  if (input.episodes && input.episodes.length > 0) {
    episodes.push(...input.episodes);
  }

  const value: ListItemValue = {
    $type: LIST_ITEM_COLLECTION,
    ...display,
    creativeWorkType,
    listUri,
    listType,
    addedAt: prev?.addedAt ?? now,
  };
  if (episodes.length > 0) value.watchedEpisodes = dedupeEpisodes(episodes);

  if (existing) {
    const rkey = existing.uri.split("/").pop() as string;
    const put = await writePut(agent, PUBLIC_REPO, {
      repo: did,
      collection: LIST_ITEM_COLLECTION,
      rkey,
      record: value,
      validate: false,
    });
    return { uri: put.uri, cid: put.cid };
  }

  const created = await writeCreate(agent, PUBLIC_REPO, {
    repo: did,
    collection: LIST_ITEM_COLLECTION,
    record: value,
    validate: false,
  });
  return { uri: created.uri, cid: created.cid };
}

export interface CreateWatchInput {
  subject: StrongRef;
  tmdbId: number;
  mediaType: MediaType;
  watchedAt: string;
  rewatch?: boolean;
  season?: number;
  episode?: number;
  tags?: string[];
  note?: string;
}

// `dest` routes the diary record: PUBLIC_REPO (bsky, unchanged) or the user's
// diary space. Either way it's the user's OWN repo, so it stays a self-op.
export async function createWatch(
  agent: Agent,
  did: string,
  input: CreateWatchInput,
  dest: WriteDestination = PUBLIC_REPO,
): Promise<StrongRef> {
  const record: Record<string, unknown> = {
    subject: input.subject,
    tmdbId: String(input.tmdbId),
    mediaType: input.mediaType,
    watchedAt: input.watchedAt,
    createdAt: new Date().toISOString(),
  };
  if (input.rewatch) record.rewatch = true;
  if (input.season !== undefined) record.season = input.season;
  if (input.episode !== undefined) record.episode = input.episode;
  if (input.tags && input.tags.length > 0) record.tags = input.tags;
  if (input.note) record.note = input.note;

  const created = await writeCreate(agent, dest, {
    repo: did,
    collection: WATCH_COLLECTION,
    record,
    validate: false,
  });
  return { uri: created.uri, cid: created.cid };
}

// Bulk sibling of createWatch: one applyWrites request per WRITE_BATCH records,
// used by catch-up backfill. Deliberately carries no tags/note — backfilled
// episodes are plain diary entries.
export async function createWatches(
  agent: Agent,
  did: string,
  inputs: CreateWatchInput[],
  dest: WriteDestination = PUBLIC_REPO,
): Promise<number> {
  if (inputs.length === 0) return 0;

  const createdAt = new Date().toISOString();
  const writes = inputs.map((input) => {
    const value: Record<string, unknown> = {
      $type: WATCH_COLLECTION,
      subject: input.subject,
      tmdbId: String(input.tmdbId),
      mediaType: input.mediaType,
      watchedAt: input.watchedAt,
      createdAt,
    };
    if (input.rewatch) value.rewatch = true;
    if (input.season !== undefined) value.season = input.season;
    if (input.episode !== undefined) value.episode = input.episode;
    return {
      collection: WATCH_COLLECTION,
      value,
    };
  });

  let written = 0;
  for (let i = 0; i < writes.length; i += WRITE_BATCH) {
    const batch = writes.slice(i, i + WRITE_BATCH);
    try {
      await applyWritesCreate(agent, dest, {
        repo: did,
        validate: false,
        creates: batch,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown error";
      throw new Error(
        `Writing watch records failed after ${written} of ${writes.length}: ${detail}`,
      );
    }
    written += batch.length;
  }
  return written;
}

export interface CurrentlyWatchingItem {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  year: string | null;
  addedAt: string;
  watchedEpisodes: { seasonNumber: number; episodeNumber: number }[];
}

export async function listCurrentlyWatching(
  agent: Agent,
  did: string,
): Promise<CurrentlyWatchingItem[]> {
  const items = await listAllRecords(agent, did, LIST_ITEM_COLLECTION);
  const out: CurrentlyWatchingItem[] = [];
  for (const { value } of items) {
    if (value.listType !== "currently_watching_tv_shows") continue;

    const identifiers = value.identifiers as
      | Record<string, unknown>
      | undefined;
    const idStr = identifiers?.tmdbId ?? identifiers?.tmdbTvSeriesId;
    const tmdbId = Number(idStr);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) continue;

    const rawEps = Array.isArray(value.watchedEpisodes)
      ? (value.watchedEpisodes as WatchedEpisode[])
      : [];
    const watchedEpisodes = rawEps
      .filter(
        (e) =>
          typeof e?.seasonNumber === "number" &&
          typeof e?.episodeNumber === "number",
      )
      .map((e) => ({
        seasonNumber: e.seasonNumber,
        episodeNumber: e.episodeNumber,
      }));

    const releaseDate =
      typeof value.releaseDate === "string" ? value.releaseDate : "";
    out.push({
      tmdbId,
      title: typeof value.title === "string" ? value.title : `TV #${tmdbId}`,
      posterUrl: typeof value.posterUrl === "string" ? value.posterUrl : null,
      year: /^\d{4}/.test(releaseDate) ? releaseDate.slice(0, 4) : null,
      addedAt: typeof value.addedAt === "string" ? value.addedAt : "",
      watchedEpisodes,
    });
  }
  return out;
}

// Where a show currently sits across the account's lists. Drives the show
// page's watchlist button: "none" -> add, "watchlist" -> remove, and a show
// already being watched/watched isn't a watchlist candidate.
export type ShowListState = "none" | "watchlist" | "watching" | "watched";

function stateFromListType(listType: unknown): ShowListState {
  return listType === "tv_show_watchlist"
    ? "watchlist"
    : listType === "watched_tv_shows"
      ? "watched"
      : "watching";
}

// A shared-watchlist entry rkey is deterministic per show, so add is idempotent
// (putRecord overwrites) and remove targets it without a scan.
function watchlistItemRkey(tmdbId: number): string {
  return `tmdb-${tmdbId}`;
}

// Adds a show to the TV watchlist. A no-op that returns the existing ref when the
// show is already tracked on any list — a watched/watching show shouldn't be
// pulled back onto the watchlist.
//
// When `wl` routes to the shared-watchlist space, the entry is written into the
// caller's OWN space-repo (a self-op) as a lightweight watchlistItem — any
// member can add, and every member sees it via the cross-member read below.
export async function addToWatchlist(
  agent: Agent,
  did: string,
  input: { tmdbId: number; title: string },
  wl: WatchlistRoute = { mode: "public" },
): Promise<StrongRef> {
  if (wl.mode === "space") {
    const dest: WriteDestination = { kind: "space", spaceUri: wl.spaceUri };
    const detail = await getWorkDetail("tv", input.tmdbId);
    const value: Record<string, unknown> = {
      $type: WATCHLIST_ITEM_COLLECTION,
      tmdbId: String(input.tmdbId),
      mediaType: "tv",
      title: input.title || detail.title,
      addedAt: new Date().toISOString(),
    };
    const posterUrl = detail.posterUrl("w500");
    if (posterUrl) value.posterUrl = posterUrl;
    if (detail.releaseDate) value.year = detail.releaseDate.slice(0, 4);
    const put = await writePut(agent, dest, {
      repo: did,
      collection: WATCHLIST_ITEM_COLLECTION,
      rkey: watchlistItemRkey(input.tmdbId),
      record: value,
      validate: false,
    });
    return { uri: put.uri, cid: put.cid };
  }

  const existing = await findWorkItem(agent, did, "tv_show", input.tmdbId);
  if (existing) return { uri: existing.uri, cid: existing.cid };

  const listUri = await ensureList(agent, did, "tv_show_watchlist");
  const detail = await getWorkDetail("tv", input.tmdbId);
  const display = await buildDisplayFields(agent, did, detail, input.title);

  const value: ListItemValue = {
    $type: LIST_ITEM_COLLECTION,
    ...display,
    creativeWorkType: "tv_show",
    listUri,
    listType: "tv_show_watchlist",
    addedAt: new Date().toISOString(),
  };
  const created = await writeCreate(agent, PUBLIC_REPO, {
    repo: did,
    collection: LIST_ITEM_COLLECTION,
    record: value,
    validate: false,
  });
  return { uri: created.uri, cid: created.cid };
}

// Deletes the watchlist listItem for a show. Returns false when the show isn't
// on the watchlist (leaving items in other lists untouched).
//
// In the shared-watchlist space, a member removes only THEIR OWN entry for the
// show (each member writes into their own space-repo); another member's entry
// keeps the show on the shared list, matching multi-writer semantics.
export async function removeFromWatchlist(
  agent: Agent,
  did: string,
  tmdbId: number,
  wl: WatchlistRoute = { mode: "public" },
): Promise<boolean> {
  if (wl.mode === "space") {
    const dest: WriteDestination = { kind: "space", spaceUri: wl.spaceUri };
    try {
      await writeDelete(agent, dest, {
        repo: did,
        collection: WATCHLIST_ITEM_COLLECTION,
        rkey: watchlistItemRkey(tmdbId),
      });
      return true;
    } catch {
      // No own entry for this show — nothing removed.
      return false;
    }
  }

  const idStr = String(tmdbId);
  const items = await listAllRecords(agent, did, LIST_ITEM_COLLECTION);
  const existing = items.find(
    (r) =>
      matchesWork(r.value, "tv_show", idStr) &&
      r.value.listType === "tv_show_watchlist",
  );
  if (!existing) return false;
  const rkey = existing.uri.split("/").pop() as string;
  await writeDelete(agent, PUBLIC_REPO, {
    repo: did,
    collection: LIST_ITEM_COLLECTION,
    rkey,
  });
  return true;
}

export interface WatchlistShow {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  year: string | null;
  addedAt: string;
}

export async function listWatchlist(
  agent: Agent,
  did: string,
  wl: WatchlistRoute = { mode: "public" },
): Promise<WatchlistShow[]> {
  if (wl.mode === "space") return listSharedWatchlist(agent, did, wl.spaceUri);

  const items = await listAllRecords(agent, did, LIST_ITEM_COLLECTION);
  const out: WatchlistShow[] = [];
  for (const { value } of items) {
    if (value.listType !== "tv_show_watchlist") continue;

    const identifiers = value.identifiers as
      | Record<string, unknown>
      | undefined;
    const idStr = identifiers?.tmdbId ?? identifiers?.tmdbTvSeriesId;
    const tmdbId = Number(idStr);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) continue;

    const releaseDate =
      typeof value.releaseDate === "string" ? value.releaseDate : "";
    out.push({
      tmdbId,
      title: typeof value.title === "string" ? value.title : `TV #${tmdbId}`,
      posterUrl: typeof value.posterUrl === "string" ? value.posterUrl : null,
      year: /^\d{4}/.test(releaseDate) ? releaseDate.slice(0, 4) : null,
      addedAt: typeof value.addedAt === "string" ? value.addedAt : "",
    });
  }
  out.sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
  return out;
}

// The multi-writer read: sweep every member's watchlistItem records in the
// space and merge. The caller's own repo is a plain-Bearer self-op through the
// seam; every other writer needs a space credential. Deduped by tmdbId, keeping
// the earliest add.
async function listSharedWatchlist(
  agent: Agent,
  did: string,
  spaceUri: string,
): Promise<WatchlistShow[]> {
  const dest: WriteDestination = { kind: "space", spaceUri };
  const writers = [did, ...(await spaceMemberDids(agent, spaceUri))].filter(
    (w, i, arr) => arr.indexOf(w) === i,
  );

  let creds: SpaceCredentialManager | null = null;
  const byTmdb = new Map<number, WatchlistShow>();

  for (const writer of writers) {
    let records: { value: Record<string, unknown> }[];
    if (writer === did) {
      const res = await seamListRecords(agent, dest, {
        repo: writer,
        collection: WATCHLIST_ITEM_COLLECTION,
        limit: 100,
      });
      records = res.records;
    } else {
      creds ??= await SpaceCredentialManager.create(agent, did);
      const res = await creds.listRecords(spaceUri, writer, {
        collection: WATCHLIST_ITEM_COLLECTION,
        limit: 100,
      });
      records = res.records;
    }

    for (const { value } of records) {
      const tmdbId = Number(value.tmdbId);
      if (!Number.isInteger(tmdbId) || tmdbId <= 0) continue;
      const addedAt = typeof value.addedAt === "string" ? value.addedAt : "";
      const show: WatchlistShow = {
        tmdbId,
        title: typeof value.title === "string" ? value.title : `TV #${tmdbId}`,
        posterUrl:
          typeof value.posterUrl === "string" ? value.posterUrl : null,
        year: typeof value.year === "string" ? value.year : null,
        addedAt,
      };
      const prev = byTmdb.get(tmdbId);
      if (!prev || (addedAt && addedAt < prev.addedAt)) byTmdb.set(tmdbId, show);
    }
  }

  return [...byTmdb.values()].sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
}

export interface WatchRecord {
  uri: string;
  tmdbId: string;
  mediaType: MediaType;
  watchedAt: string;
  rewatch: boolean;
  season?: number;
  episode?: number;
  tags: string[];
  note?: string;
}

export async function listWatches(
  agent: Agent,
  did: string,
  limit = 50,
  dest: WriteDestination = PUBLIC_REPO,
): Promise<WatchRecord[]> {
  // listRecords orders by rkey; newest first (no reverse). Imported records'
  // rkeys track import time, not watch time, so over-fetch and sort by
  // watchedAt to surface recent logs. A watchedAt-ordered index is the
  // future appview's job.
  const res = await seamListRecords(agent, dest, {
    repo: did,
    collection: WATCH_COLLECTION,
    limit: Math.max(limit * 2, 100),
  });
  return res.records
    .map((r) => {
      const v = r.value;
      return {
        uri: r.uri,
        tmdbId: String(v.tmdbId ?? ""),
        mediaType: v.mediaType === "tv" ? "tv" : "movie",
        watchedAt: typeof v.watchedAt === "string" ? v.watchedAt : "",
        rewatch: v.rewatch === true,
        season: typeof v.season === "number" ? v.season : undefined,
        episode: typeof v.episode === "number" ? v.episode : undefined,
        tags: Array.isArray(v.tags)
          ? (v.tags.filter((t) => typeof t === "string") as string[])
          : [],
        note: typeof v.note === "string" ? v.note : undefined,
      } as WatchRecord;
    })
    .sort((a, b) => (a.watchedAt < b.watchedAt ? 1 : -1))
    .slice(0, limit);
}
