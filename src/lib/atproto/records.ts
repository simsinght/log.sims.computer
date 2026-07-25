import type { Agent } from "@atproto/api";
import {
  getWorkDetail,
  getEpisodeTmdbId,
  fetchPosterJpeg,
  type WorkDetail,
} from "@/lib/tmdb";

export const LIST_COLLECTION = "social.popfeed.feed.list";
export const LIST_ITEM_COLLECTION = "social.popfeed.feed.listItem";
export const WATCH_COLLECTION = "computer.sims.log.watch";

type MediaType = "movie" | "tv";

// Popfeed keys "watched" state by which media-type-specific list an item lives
// in — there is no status field. Movies land in watched_movies; a show logged
// per-episode is "currently watching", a show logged whole is "watched".
export type ListType =
  | "watched_movies"
  | "currently_watching_tv_shows"
  | "watched_tv_shows";

const LIST_NAMES: Record<ListType, string> = {
  watched_movies: "Watched Movies",
  currently_watching_tv_shows: "Currently Watching",
  watched_tv_shows: "Watched Shows",
};

function targetListType(mediaType: MediaType, isPerEpisode: boolean): ListType {
  if (mediaType === "movie") return "watched_movies";
  return isPerEpisode ? "currently_watching_tv_shows" : "watched_tv_shows";
}

interface StrongRef {
  uri: string;
  cid: string;
}

interface WatchedEpisode {
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
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection,
      limit: 100,
      cursor,
    });
    for (const r of res.data.records) {
      out.push({
        uri: r.uri,
        cid: r.cid,
        value: r.value as Record<string, unknown>,
      });
    }
    cursor = res.data.cursor;
    if (!cursor || res.data.records.length === 0) break;
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

  const created = await agent.com.atproto.repo.createRecord({
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
  listUriCache.set(cacheKey, created.data.uri);
  return created.data.uri;
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
}

export async function upsertListItem(
  agent: Agent,
  did: string,
  input: UpsertWorkInput,
): Promise<StrongRef> {
  const idStr = String(input.tmdbId);
  const creativeWorkType = input.mediaType === "movie" ? "movie" : "tv_show";
  const isPerEpisode =
    input.mediaType === "tv" &&
    (input.season !== undefined || input.episode !== undefined);
  const listType = targetListType(input.mediaType, isPerEpisode);
  const listUri = await ensureList(agent, did, listType);

  const detail = await getWorkDetail(input.mediaType, input.tmdbId);

  const items = await listAllRecords(agent, did, LIST_ITEM_COLLECTION);
  const existing = items.find((r) =>
    matchesWork(r.value, creativeWorkType, idStr),
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
    const put = await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: LIST_ITEM_COLLECTION,
      rkey,
      record: value,
      validate: false,
    });
    return { uri: put.data.uri, cid: put.data.cid };
  }

  const created = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: LIST_ITEM_COLLECTION,
    record: value,
    validate: false,
  });
  return { uri: created.data.uri, cid: created.data.cid };
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

export async function createWatch(
  agent: Agent,
  did: string,
  input: CreateWatchInput,
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

  const created = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: WATCH_COLLECTION,
    record,
    validate: false,
  });
  return { uri: created.data.uri, cid: created.data.cid };
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
): Promise<WatchRecord[]> {
  const res = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: WATCH_COLLECTION,
    limit,
    reverse: true,
  });
  return res.data.records.map((r) => {
    const v = r.value as Record<string, unknown>;
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
    };
  });
}
