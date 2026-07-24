import type { Agent } from "@atproto/api";

export const LIST_COLLECTION = "social.popfeed.feed.list";
export const LIST_ITEM_COLLECTION = "social.popfeed.feed.listItem";
export const WATCH_COLLECTION = "computer.sims.log.watch";

const WATCHED_LIST_TYPE = "watched";
const WATCHED_LIST_NAME = "Watched";

type MediaType = "movie" | "tv";

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
  identifiers: Record<string, string | number>;
  creativeWorkType: string;
  status?: string;
  listUri: string;
  title?: string;
  addedAt: string;
  startedAt?: string;
  completedAt?: string;
  watchedEpisodes?: WatchedEpisode[];
  [key: string]: unknown;
}

const listUriCache = new Map<string, string>();

async function listAllRecords(
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

async function ensureWatchedList(agent: Agent, did: string): Promise<string> {
  const cached = listUriCache.get(did);
  if (cached) return cached;

  const lists = await listAllRecords(agent, did, LIST_COLLECTION);
  const existing = lists.find(
    (r) =>
      r.value.listType === WATCHED_LIST_TYPE ||
      r.value.name === WATCHED_LIST_NAME,
  );
  if (existing) {
    listUriCache.set(did, existing.uri);
    return existing.uri;
  }

  const created = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: LIST_COLLECTION,
    record: {
      name: WATCHED_LIST_NAME,
      listType: WATCHED_LIST_TYPE,
      ordered: false,
      createdAt: new Date().toISOString(),
    },
    validate: false,
  });
  listUriCache.set(did, created.data.uri);
  return created.data.uri;
}

function matchesWork(
  value: Record<string, unknown>,
  creativeWorkType: string,
  idField: string,
  idStr: string,
): boolean {
  if (value.creativeWorkType !== creativeWorkType) return false;
  const identifiers = value.identifiers as Record<string, unknown> | undefined;
  return Boolean(identifiers && identifiers[idField] === idStr);
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
  const listUri = await ensureWatchedList(agent, did);
  const idStr = String(input.tmdbId);
  const creativeWorkType = input.mediaType === "movie" ? "movie" : "tv_show";
  const idField = input.mediaType === "movie" ? "tmdbId" : "tmdbTvSeriesId";

  const isPartialTv =
    input.mediaType === "tv" &&
    (input.season !== undefined || input.episode !== undefined);
  const status = isPartialTv ? "#in_progress" : "#finished";

  const items = await listAllRecords(agent, did, LIST_ITEM_COLLECTION);
  const existing = items.find((r) =>
    matchesWork(r.value, creativeWorkType, idField, idStr),
  );

  const now = new Date().toISOString();

  if (existing) {
    const prev = existing.value as ListItemValue;
    const rkey = existing.uri.split("/").pop() as string;

    const episodes = [...(prev.watchedEpisodes ?? [])];
    if (
      input.mediaType === "tv" &&
      input.season !== undefined &&
      input.episode !== undefined
    ) {
      episodes.push({
        seasonNumber: input.season,
        episodeNumber: input.episode,
      });
    }

    const next: ListItemValue = {
      ...prev,
      identifiers: { ...prev.identifiers, [idField]: idStr },
      creativeWorkType,
      listUri: prev.listUri ?? listUri,
      title: input.title || prev.title,
      addedAt: prev.addedAt ?? now,
      status,
    };
    if (episodes.length > 0) next.watchedEpisodes = dedupeEpisodes(episodes);
    if (status === "#finished") next.completedAt = input.watchedAt;
    else next.startedAt = prev.startedAt ?? input.watchedAt;

    const put = await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: LIST_ITEM_COLLECTION,
      rkey,
      record: next,
      validate: false,
    });
    return { uri: put.data.uri, cid: put.data.cid };
  }

  const value: ListItemValue = {
    identifiers: { [idField]: idStr },
    creativeWorkType,
    listUri,
    title: input.title,
    addedAt: now,
    status,
  };
  if (
    input.mediaType === "tv" &&
    input.season !== undefined &&
    input.episode !== undefined
  ) {
    value.watchedEpisodes = [
      { seasonNumber: input.season, episodeNumber: input.episode },
    ];
  }
  if (status === "#finished") value.completedAt = input.watchedAt;
  else value.startedAt = input.watchedAt;

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
