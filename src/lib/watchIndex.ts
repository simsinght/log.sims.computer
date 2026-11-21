/**
 * A per-account, in-memory index of the account's TV episode watches (the
 * diary's computer.sims.log.watch records): which episode, when, and the note.
 * It backs the "Notes" sections on the show/season pages and the episode
 * page's own note.
 *
 * Why an index: atproto has no query language, so "this show's notes" is a
 * full pull of the watch collection (5,500+ records = 56 sequential pages on
 * the reference account; see docs/access-patterns.md). Paying that on every
 * page view is out of the question, so the first read builds the index and
 * later reads are free:
 *
 *  - Write-through: POST /api/log adds its new watch, a note edit patches its
 *    record, so the app's own writes are visible immediately.
 *  - Bulk writes (catch-up backfill, Trakt import) just drop the index; the
 *    next read rebuilds it.
 *  - Stale-while-revalidate after STALE_MS, to pick up anything written by
 *    another client. A failed refresh keeps the old index.
 *
 * Keyed by DID + diary destination, so a public-repo index can never answer
 * for a diary space (or the other way round). Single-process, like the OAuth
 * and TMDB caches; kept on globalThis so dev HMR doesn't fork it.
 */
import type { Agent } from "@atproto/api";
import { WATCH_COLLECTION } from "@/lib/atproto/records";
import {
  listRecords,
  type SeamRecord,
  type WriteDestination,
} from "@/lib/atproto/write";

export interface EpisodeWatch {
  rkey: string;
  tmdbId: string;
  season: number;
  episode: number;
  watchedAt: string;
  note?: string;
}

const STALE_MS = 15 * 60 * 1000;
// Matches the importer's ceiling (100/page): 50,000 watch records.
const MAX_PAGES = 500;

interface Entry {
  builtAt: number;
  // The live index, mutated in place by write-through. Null until built.
  watches: EpisodeWatch[] | null;
  building: Promise<EpisodeWatch[]> | null;
}

const g = globalThis as unknown as { __tvlogWatchIndex?: Map<string, Entry> };
const index = (g.__tvlogWatchIndex ??= new Map<string, Entry>());

// Write-throughs that arrive while an entry is (re)building.
const pending = new WeakMap<Entry, EpisodeWatch[]>();

function keyFor(did: string, dest: WriteDestination): string {
  return dest.kind === "space" ? `${did}|space|${dest.spaceUri}` : `${did}|public`;
}

function rkeyOf(uri: string): string {
  return uri.split("/").pop() ?? "";
}

export function toEpisodeWatch(
  rkey: string,
  v: Record<string, unknown>,
): EpisodeWatch | null {
  if (v.mediaType !== "tv") return null;
  if (typeof v.season !== "number" || typeof v.episode !== "number") return null;
  const tmdbId = String(v.tmdbId ?? "");
  if (!tmdbId) return null;
  const note = typeof v.note === "string" && v.note.trim() ? v.note : undefined;
  return {
    rkey,
    tmdbId,
    season: v.season,
    episode: v.episode,
    watchedAt: typeof v.watchedAt === "string" ? v.watchedAt : "",
    note,
  };
}

async function scan(
  agent: Agent,
  did: string,
  dest: WriteDestination,
): Promise<EpisodeWatch[]> {
  const out: EpisodeWatch[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res: { records: SeamRecord[]; cursor?: string } = await listRecords(
      agent,
      dest,
      { repo: did, collection: WATCH_COLLECTION, limit: 100, cursor },
    );
    for (const r of res.records) {
      const w = toEpisodeWatch(rkeyOf(r.uri), r.value);
      if (w) out.push(w);
    }
    cursor = res.cursor;
    if (!cursor || res.records.length === 0) break;
  }
  return out;
}

function build(
  entry: Entry,
  agent: Agent,
  did: string,
  dest: WriteDestination,
): Promise<EpisodeWatch[]> {
  if (entry.building) return entry.building;
  const started = Date.now();
  // Write-through that lands mid-scan may or may not be in the scan's pages;
  // replay it onto the fresh result so it isn't lost.
  const pendingWrites: EpisodeWatch[] = [];
  pending.set(entry, pendingWrites);
  entry.building = scan(agent, did, dest)
    .then((watches) => {
      for (const w of pendingWrites) upsertInto(watches, w);
      entry.watches = watches;
      entry.builtAt = started;
      return watches;
    })
    .finally(() => {
      entry.building = null;
      pending.delete(entry);
    });
  return entry.building;
}

function upsertInto(list: EpisodeWatch[], w: EpisodeWatch): void {
  const i = list.findIndex((x) => x.rkey === w.rkey);
  if (i >= 0) list[i] = w;
  else list.push(w);
}

async function allWatches(
  agent: Agent,
  did: string,
  dest: WriteDestination,
): Promise<EpisodeWatch[]> {
  const key = keyFor(did, dest);
  let entry = index.get(key);
  if (!entry) {
    entry = { builtAt: 0, watches: null, building: null };
    index.set(key, entry);
  }
  if (!entry.watches) {
    try {
      return await build(entry, agent, did, dest);
    } catch (err) {
      // Don't keep an empty shell around for a failed first build.
      if (!entry.watches) index.delete(key);
      throw err;
    }
  }
  if (Date.now() - entry.builtAt > STALE_MS) {
    // Serve what we have; refresh behind it. A failure keeps the old index.
    build(entry, agent, did, dest).catch((err) => {
      console.error("[watchIndex] background refresh failed; keeping old index", {
        did,
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }
  return entry.watches;
}

/** This show's episode watches, in episode order (then watch order). */
export async function getShowWatches(
  agent: Agent,
  did: string,
  dest: WriteDestination,
  tmdbId: number,
): Promise<EpisodeWatch[]> {
  const id = String(tmdbId);
  const watches = await allWatches(agent, did, dest);
  return watches
    .filter((w) => w.tmdbId === id)
    .sort(
      (a, b) =>
        a.season - b.season ||
        a.episode - b.episode ||
        (a.watchedAt < b.watchedAt ? -1 : a.watchedAt > b.watchedAt ? 1 : 0),
    );
}

/**
 * Write-through for one watch record the app just created or rewrote. A no-op
 * when the index isn't built (the eventual build will read the record anyway).
 */
export function recordWatchWrite(
  did: string,
  dest: WriteDestination,
  rkey: string,
  value: Record<string, unknown>,
): void {
  const entry = index.get(keyFor(did, dest));
  if (!entry) return;
  const w = toEpisodeWatch(rkey, value);
  if (!w) return;
  if (entry.watches) upsertInto(entry.watches, w);
  pending.get(entry)?.push(w);
}

/** Drops the account's index after a bulk write (catch-up, import). */
export function invalidateWatchIndex(did: string): void {
  for (const key of index.keys()) {
    if (key.startsWith(`${did}|`)) index.delete(key);
  }
}
