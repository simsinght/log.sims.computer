/**
 * Trakt history importer.
 *
 * Reads an official Trakt export (zip or already-extracted directory) and writes
 * the watch history into the owner's PDS as Popfeed + computer.sims.log records:
 *   - one social.popfeed.feed.listItem per tracked work (movie or show), carrying
 *     all watched episodes and the TMDB-derived display fields, and
 *   - one computer.sims.log.watch diary entry per play event.
 *
 * Run: node scripts/import-trakt.ts <zip-or-dir> --handle <h> --password <p> [flags]
 * (Node 25's native TS type-stripping runs this directly; tsx is broken on Node 25
 * for deps with subpath exports like multiformats/cid.)
 *
 * Self-contained on purpose: it mirrors the record shapes from
 * src/lib/atproto/records.ts + src/lib/tmdb.ts rather than importing them, because
 * those use the "@/" path alias and non-erasable syntax (a constructor parameter
 * property in tmdb.ts) that native strip-types cannot resolve. The shapes below are
 * kept byte-for-byte compatible with that write path — see the popfeed-interop work.
 *
 * Bulk-mode economics: poster blobs are NOT uploaded (the live lexicon deprecates
 * the blob in favor of posterUrl); posterUrl is set to the TMDB w500 URL directly.
 * Per-episode tmdb ids come straight from the Trakt event, so no TMDB episode
 * lookups are made. TMDB detail calls are deduped per work with bounded concurrency.
 *
 * Auth: --handle/--password, falling back to ATP_TEST_HANDLE / ATP_TEST_APP_PASSWORD
 * (loaded from .env.local if present).
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { AtpAgent } from "@atproto/api";

const LIST_COLLECTION = "social.popfeed.feed.list";
const LIST_ITEM_COLLECTION = "social.popfeed.feed.listItem";
const WATCH_COLLECTION = "computer.sims.log.watch";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
const IMPORT_TAG = "trakt-import";
const WRITE_BATCH = 200;
const TMDB_CONCURRENCY = 4;

type MediaType = "movie" | "tv";
type ListType =
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

// ---------------------------------------------------------------------------
// CLI + env
// ---------------------------------------------------------------------------

interface Args {
  input: string;
  handle?: string;
  password?: string;
  limit?: number;
  since?: string;
  dryRun: boolean;
  yes: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { input: "", dryRun: false, yes: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--yes" || a === "-y") args.yes = true;
    else if (a === "--handle") args.handle = argv[++i];
    else if (a === "--password") args.password = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--since") args.since = argv[++i];
    else if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    else positional.push(a);
  }
  args.input = positional[0] ?? "";
  return args;
}

function loadEnv(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Reading the export (zip via `unzip -p`, or a directory)
// ---------------------------------------------------------------------------

interface Source {
  listEntries(): string[];
  read(name: string): string;
}

function makeSource(input: string): Source {
  const abs = resolve(process.cwd(), input);
  if (!existsSync(abs)) throw new Error(`Input not found: ${abs}`);
  const st = statSync(abs);
  if (st.isDirectory()) {
    return {
      listEntries: () =>
        execFileSync("ls", [abs], { encoding: "utf8" })
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      read: (name) => readFileSync(join(abs, name), "utf8"),
    };
  }
  // Treat as a zip; stream file contents out with `unzip -p` so we never write
  // the (private) export to disk.
  return {
    listEntries: () =>
      execFileSync("unzip", ["-Z1", abs], { encoding: "utf8" })
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    read: (name) =>
      execFileSync("unzip", ["-p", abs, name], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      }),
  };
}

function readJson<T>(source: Source, name: string): T {
  return JSON.parse(source.read(name)) as T;
}

// ---------------------------------------------------------------------------
// Trakt event shapes + normalization
// ---------------------------------------------------------------------------

interface TraktIds {
  tmdb?: number;
  imdb?: string;
}
interface TraktHistoryEvent {
  watched_at: string;
  action?: string;
  type: "movie" | "episode";
  movie?: { ids: TraktIds; title?: string };
  show?: { ids: TraktIds; title?: string; aired_episodes?: number };
  episode?: { ids: TraktIds; season?: number; number?: number; title?: string };
}

interface PlayEvent {
  mediaType: MediaType;
  workTmdbId: number; // movie tmdb id, or SHOW tmdb id for episodes
  workImdbId?: string;
  workTitle: string;
  watchedAt: string;
  season?: number;
  episode?: number;
  episodeTmdbId?: string;
}

function normalizeEvent(e: TraktHistoryEvent): PlayEvent | null {
  if (e.type === "movie") {
    const tmdb = e.movie?.ids.tmdb;
    if (!tmdb) return null;
    return {
      mediaType: "movie",
      workTmdbId: tmdb,
      workImdbId: e.movie?.ids.imdb,
      workTitle: e.movie?.title ?? "",
      watchedAt: e.watched_at,
    };
  }
  const showTmdb = e.show?.ids.tmdb;
  if (!showTmdb) return null;
  return {
    mediaType: "tv",
    workTmdbId: showTmdb,
    workTitle: e.show?.title ?? "",
    watchedAt: e.watched_at,
    season: e.episode?.season,
    episode: e.episode?.number,
    episodeTmdbId:
      typeof e.episode?.ids.tmdb === "number"
        ? String(e.episode.ids.tmdb)
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// TMDB detail (mirrors src/lib/tmdb.ts getWorkDetail; adds numberOfEpisodes)
// ---------------------------------------------------------------------------

interface WorkDetail {
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

let tmdbCalls = 0;

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

async function getWorkDetail(
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
    console.warn(
      `  ! TMDB detail failed for ${type}/${id}: ${(err as Error).message}`,
    );
    detail = null;
  }
  detailCache.set(cacheKey, detail);
  return detail;
}

async function prefetchDetails(
  works: WorkGroup[],
): Promise<void> {
  let i = 0;
  async function worker(): Promise<void> {
    while (i < works.length) {
      const w = works[i++];
      await getWorkDetail(w.mediaType, w.tmdbId);
      if (i % 50 === 0) console.log(`  TMDB: ${i}/${works.length} works`);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(TMDB_CONCURRENCY, works.length) }, worker),
  );
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

interface WatchedEpisode {
  seasonNumber: number;
  episodeNumber: number;
  tmdbId?: string;
}

interface WorkGroup {
  key: string;
  mediaType: MediaType;
  tmdbId: number;
  imdbId?: string;
  title: string;
  episodes: Map<string, WatchedEpisode>; // key `${s}-${e}`
}

function groupWorks(events: PlayEvent[]): WorkGroup[] {
  const map = new Map<string, WorkGroup>();
  for (const ev of events) {
    const key = `${ev.mediaType}:${ev.workTmdbId}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        mediaType: ev.mediaType,
        tmdbId: ev.workTmdbId,
        imdbId: ev.workImdbId,
        title: ev.workTitle,
        episodes: new Map(),
      };
      map.set(key, g);
    }
    if (!g.imdbId && ev.workImdbId) g.imdbId = ev.workImdbId;
    if (!g.title && ev.workTitle) g.title = ev.workTitle;
    if (ev.mediaType === "tv" && ev.season !== undefined && ev.episode !== undefined) {
      const epKey = `${ev.season}-${ev.episode}`;
      if (!g.episodes.has(epKey)) {
        g.episodes.set(epKey, {
          seasonNumber: ev.season,
          episodeNumber: ev.episode,
          tmdbId: ev.episodeTmdbId,
        });
      }
    }
  }
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Watchlist (lists-watchlist.json): mixed movies/shows the user means to watch
// ---------------------------------------------------------------------------

interface TraktListEntry {
  type: "movie" | "show";
  movie?: { ids: TraktIds; title?: string };
  show?: { ids: TraktIds; title?: string };
  listed_at?: string;
}

interface WatchlistEntry {
  mediaType: MediaType;
  tmdbId: number;
  imdbId?: string;
  title: string;
  listedAt: string;
}

function normalizeWatchlistEntry(e: TraktListEntry): WatchlistEntry | null {
  const node = e.type === "movie" ? e.movie : e.show;
  const tmdb = node?.ids.tmdb;
  if (!tmdb) return null;
  return {
    mediaType: e.type === "movie" ? "movie" : "tv",
    tmdbId: tmdb,
    imdbId: node?.ids.imdb,
    title: node?.title ?? "",
    listedAt: e.listed_at ?? new Date().toISOString(),
  };
}

function parseWatchlist(source: Source, entries: string[]): WatchlistEntry[] {
  const file = entries.find((e) => /(^|\/)lists-watchlist\.json$/.test(e));
  if (!file) return [];
  let raw: TraktListEntry[];
  try {
    raw = readJson<TraktListEntry[]>(source, file);
  } catch {
    return [];
  }
  const out: WatchlistEntry[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    const n = normalizeWatchlistEntry(e);
    if (!n) continue;
    const key = `${n.mediaType}:${n.tmdbId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

// A watchlist entry reuses the listItem builder via a WorkGroup with no episodes.
function watchlistGroup(entry: WatchlistEntry): WorkGroup {
  return {
    key: `${entry.mediaType}:${entry.tmdbId}`,
    mediaType: entry.mediaType,
    tmdbId: entry.tmdbId,
    imdbId: entry.imdbId,
    title: entry.title,
    episodes: new Map(),
  };
}

// ---------------------------------------------------------------------------
// atproto helpers
// ---------------------------------------------------------------------------

interface RepoRecord {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
}

async function resolveIdentity(
  handle: string,
): Promise<{ did: string; pdsUrl: string }> {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  const rh = new URL(
    "/xrpc/com.atproto.identity.resolveHandle",
    "https://bsky.social",
  );
  rh.searchParams.set("handle", h);
  const did = ((await (await fetch(rh)).json()) as { did?: string }).did;
  if (!did) throw new Error(`Could not resolve handle ${handle}`);
  const doc = (await (await fetch(`https://plc.directory/${did}`)).json()) as {
    service?: { id: string; serviceEndpoint: string }[];
  };
  const svc = doc.service?.find((s) => s.id.endsWith("#atproto_pds"));
  if (!svc?.serviceEndpoint) throw new Error("No PDS endpoint in DID doc");
  return { did, pdsUrl: svc.serviceEndpoint };
}

async function listAllRecords(
  agent: AtpAgent,
  did: string,
  collection: string,
): Promise<RepoRecord[]> {
  const out: RepoRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 500; page++) {
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

async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
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
      console.log(`  rate-limited; waiting ${Math.ceil(waitMs / 1000)}s...`);
      await sleep(waitMs + 500);
    }
  }
  throw new Error("unreachable");
}

const listUriCache = new Map<ListType, string>();

async function ensureList(
  agent: AtpAgent,
  did: string,
  listType: ListType,
  existingLists: RepoRecord[],
): Promise<string> {
  const cached = listUriCache.get(listType);
  if (cached) return cached;
  const existing = existingLists.find((r) => r.value.listType === listType);
  if (existing) {
    listUriCache.set(listType, existing.uri);
    return existing.uri;
  }
  const created = await withRateLimit(() =>
    agent.com.atproto.repo.createRecord({
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
  existingLists.push({ uri: created.data.uri, cid: created.data.cid, value: {} });
  listUriCache.set(listType, created.data.uri);
  return created.data.uri;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((res) => rl.question(prompt, res));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

function targetListType(g: WorkGroup, detail: WorkDetail | null): ListType {
  if (g.mediaType === "movie") return "watched_movies";
  const total = detail?.numberOfEpisodes ?? null;
  if (total !== null && g.episodes.size >= total) return "watched_tv_shows";
  return "currently_watching_tv_shows";
}

function buildListItemValue(
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

interface Plan {
  events: PlayEvent[];
  works: WorkGroup[];
  listItemsToCreate: number;
  listItemsToUpdate: number;
  watchesToWrite: number;
  watchesSkipped: number;
  tmdbCallsNeeded: number;
  watchlistParsed: number;
  watchlistToCreate: WatchlistEntry[];
  watchlistSkipped: number;
}

async function run(): Promise<void> {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error(
      "Usage: node scripts/import-trakt.ts <zip-or-dir> --handle <h> --password <p> [--limit N] [--since ISO] [--dry-run] [--yes]",
    );
  }
  const handle = args.handle ?? process.env.ATP_TEST_HANDLE;
  const password = args.password ?? process.env.ATP_TEST_APP_PASSWORD;

  // --- parse events ---
  const source = makeSource(args.input);
  const entries = source.listEntries();
  const historyFiles = entries
    .filter((e) => /(^|\/)watched-history-\d+\.json$/.test(e))
    .sort();
  if (historyFiles.length === 0)
    throw new Error("No watched-history-*.json files found in input");

  console.log(`Reading ${historyFiles.length} watched-history file(s)...`);
  const raw: TraktHistoryEvent[] = [];
  for (const f of historyFiles) raw.push(...readJson<TraktHistoryEvent[]>(source, f));

  let skippedNoTmdb = 0;
  let events: PlayEvent[] = [];
  for (const e of raw) {
    const n = normalizeEvent(e);
    if (!n) skippedNoTmdb++;
    else events.push(n);
  }
  events.sort((a, b) => a.watchedAt.localeCompare(b.watchedAt));

  if (args.since) {
    const before = events.length;
    events = events.filter((e) => e.watchedAt >= args.since!);
    console.log(`--since ${args.since}: ${before} -> ${events.length} events`);
  }
  if (args.limit !== undefined && Number.isFinite(args.limit)) {
    events = events.slice(0, args.limit);
    console.log(`--limit ${args.limit}: ${events.length} events`);
  }

  // rewatch: same specific thing (movie, or show+season+episode) seen earlier
  // in the ascending stream.
  const seen = new Set<string>();
  const rewatchFlags: boolean[] = [];
  for (const ev of events) {
    const idKey =
      ev.mediaType === "movie"
        ? `m:${ev.workTmdbId}`
        : `e:${ev.workTmdbId}:${ev.season}:${ev.episode}`;
    rewatchFlags.push(seen.has(idKey));
    seen.add(idKey);
  }

  const works = groupWorks(events);
  console.log(
    `Parsed ${events.length} events (${skippedNoTmdb} skipped, no tmdb id); ${works.length} distinct works.`,
  );

  let watchlistEntries = parseWatchlist(source, entries);
  console.log(`Parsed ${watchlistEntries.length} watchlist items.`);
  // Apply --limit up front (deterministic first-N) so a re-run considers the
  // same items and skips them — slicing after the tracked-filter would instead
  // pull in the next unimported batch each run.
  if (args.limit !== undefined && Number.isFinite(args.limit)) {
    watchlistEntries = watchlistEntries.slice(0, args.limit);
    console.log(
      `--limit ${args.limit}: ${watchlistEntries.length} watchlist items`,
    );
  }

  // --- report other export sections (out of scope, counts only) ---
  reportSideChannels(source, entries);

  // --- auth (dry-run still logs in when creds present, for an accurate plan) ---
  let agent: AtpAgent | null = null;
  let did = "";
  if (handle && password) {
    const id = await resolveIdentity(handle);
    did = id.did;
    console.log(`\nAccount: ${handle} (${did}) @ ${id.pdsUrl}`);
    agent = new AtpAgent({ service: id.pdsUrl });
    await agent.login({ identifier: handle, password });
  } else if (!args.dryRun) {
    throw new Error(
      "No credentials: pass --handle/--password or set ATP_TEST_HANDLE/ATP_TEST_APP_PASSWORD",
    );
  } else {
    console.log("\n(no credentials; dry-run plan will assume an empty account)");
  }

  // --- read existing state for idempotency + create/update diff ---
  let existingItems: RepoRecord[] = [];
  let existingLists: RepoRecord[] = [];
  const existingWatchKeys = new Set<string>();
  if (agent) {
    console.log("Reading existing records for idempotency...");
    existingItems = await listAllRecords(agent, did, LIST_ITEM_COLLECTION);
    existingLists = await listAllRecords(agent, did, LIST_COLLECTION);
    const watches = await listAllRecords(agent, did, WATCH_COLLECTION);
    for (const w of watches) existingWatchKeys.add(watchKey(w.value));
    console.log(
      `  existing: ${existingItems.length} listItems, ${watches.length} watch records`,
    );
  }

  const itemByTmdb = new Map<string, RepoRecord>();
  for (const it of existingItems) {
    const ids = (it.value.identifiers ?? {}) as Record<string, unknown>;
    const t = ids.tmdbId ?? ids.tmdbTvSeriesId;
    const cwt = it.value.creativeWorkType === "movie" ? "movie" : "tv";
    if (t) itemByTmdb.set(`${cwt}:${t}`, it);
  }

  // --- TMDB details (deduped, bounded concurrency) ---
  const tmdbNeeded = works.filter(
    (w) => !detailCache.has(`${w.mediaType}:${w.tmdbId}`),
  ).length;
  if (agent) {
    console.log(`Fetching TMDB details for ${works.length} works...`);
    await prefetchDetails(works);
  }

  // --- compute the plan ---
  let listItemsToCreate = 0;
  let listItemsToUpdate = 0;
  let watchesToWrite = 0;
  for (let i = 0; i < events.length; i++) {
    if (!existingWatchKeys.has(watchKey(planWatchValue(events[i], rewatchFlags[i]))))
      watchesToWrite++;
  }
  for (const g of works) {
    const existing = itemByTmdb.get(`${g.mediaType}:${g.tmdbId}`);
    if (!existing) {
      listItemsToCreate++;
    } else {
      const prevEps = (existing.value.watchedEpisodes as WatchedEpisode[] | undefined) ?? [];
      const prevKeys = new Set(prevEps.map((e) => `${e.seasonNumber}-${e.episodeNumber}`));
      const hasNew = [...g.episodes.keys()].some((k) => !prevKeys.has(k));
      if (hasNew) listItemsToUpdate++;
    }
  }
  const watchesSkipped = events.length - watchesToWrite;

  // Watchlist: add only works not already tracked in ANY existing list, and not
  // among the history works this run imports (a watched show shouldn't re-enter
  // the watchlist). --limit caps the writes for small test runs.
  const trackedKeys = new Set<string>(itemByTmdb.keys());
  for (const w of works) trackedKeys.add(`${w.mediaType}:${w.tmdbId}`);
  const watchlistToCreate = watchlistEntries.filter(
    (e) => !trackedKeys.has(`${e.mediaType}:${e.tmdbId}`),
  );
  const watchlistSkipped = watchlistEntries.length - watchlistToCreate.length;

  const plan: Plan = {
    events,
    works,
    listItemsToCreate,
    listItemsToUpdate,
    watchesToWrite,
    watchesSkipped,
    tmdbCallsNeeded: agent ? tmdbCalls : tmdbNeeded,
    watchlistParsed: watchlistEntries.length,
    watchlistToCreate,
    watchlistSkipped,
  };
  printPlan(plan);

  crossCheck(source, entries, works);

  if (args.dryRun) {
    console.log("\nDry run: no records written.");
    return;
  }
  if (!agent) throw new Error("cannot write without credentials");

  if (!args.yes) {
    const ok = await confirm("\nProceed with writing these records? [y/N] ");
    if (!ok) {
      console.log("Aborted.");
      return;
    }
  }

  const started = Date.now();
  let failures = 0;

  // --- phase 1: listItems (individual writes -> strongRef per work) ---
  console.log("\nPhase 1: upserting listItems...");
  const subjectByWork = new Map<string, { uri: string; cid: string }>();
  let done = 0;
  for (const g of works) {
    done++;
    const detail = detailCache.get(`${g.mediaType}:${g.tmdbId}`) ?? null;
    const listType = targetListType(g, detail);
    const listUri = await ensureList(agent, did, listType, existingLists);
    const existing = itemByTmdb.get(`${g.mediaType}:${g.tmdbId}`);
    const newEps = [...g.episodes.values()];

    try {
      if (!existing) {
        const value = buildListItemValue(
          g,
          detail,
          listUri,
          listType,
          new Date().toISOString(),
          newEps,
        );
        const created = await withRateLimit(() =>
          agent!.com.atproto.repo.createRecord({
            repo: did,
            collection: LIST_ITEM_COLLECTION,
            record: value,
            validate: false,
          }),
        );
        subjectByWork.set(g.key, { uri: created.data.uri, cid: created.data.cid });
      } else {
        const prevEps =
          (existing.value.watchedEpisodes as WatchedEpisode[] | undefined) ?? [];
        const merged = mergeEpisodes(prevEps, newEps);
        const hasNew = merged.length > prevEps.length;
        const rkey = existing.uri.split("/").pop() as string;
        if (!hasNew) {
          // nothing new to merge; reuse the existing strongRef, skip the write
          subjectByWork.set(g.key, { uri: existing.uri, cid: existing.cid });
        } else {
          const value = buildListItemValue(
            g,
            detail,
            listUri,
            listType,
            typeof existing.value.addedAt === "string"
              ? existing.value.addedAt
              : new Date().toISOString(),
            merged,
          );
          const put = await withRateLimit(() =>
            agent!.com.atproto.repo.putRecord({
              repo: did,
              collection: LIST_ITEM_COLLECTION,
              rkey,
              record: value,
              validate: false,
            }),
          );
          subjectByWork.set(g.key, { uri: put.data.uri, cid: put.data.cid });
        }
      }
    } catch (err) {
      failures++;
      console.warn(`  ! listItem failed for ${g.key}: ${(err as Error).message}`);
    }
    if (done % 50 === 0 || done === works.length)
      console.log(`  listItems: ${done}/${works.length}`);
  }

  // --- phase 2: watch records (applyWrites, batched) ---
  console.log("\nPhase 2: writing watch diary records...");
  const writes: Record<string, unknown>[] = [];
  let missingSubject = 0;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const subject = subjectByWork.get(`${ev.mediaType}:${ev.workTmdbId}`);
    const planned = !existingWatchKeys.has(watchKey(planWatchValue(ev, rewatchFlags[i])));
    if (!subject) {
      if (planned) missingSubject++; // its listItem failed; can't write the diary entry
      continue;
    }
    const value = buildWatchValue(ev, rewatchFlags[i], subject);
    if (existingWatchKeys.has(watchKey(value))) continue;
    writes.push({
      $type: "com.atproto.repo.applyWrites#create",
      collection: WATCH_COLLECTION,
      value,
    });
  }

  let written = 0;
  for (let i = 0; i < writes.length; i += WRITE_BATCH) {
    const batch = writes.slice(i, i + WRITE_BATCH);
    try {
      await withRateLimit(() =>
        agent!.com.atproto.repo.applyWrites({
          repo: did,
          validate: false,
          writes: batch as never,
        }),
      );
      written += batch.length;
      console.log(`  watches: ${written}/${writes.length}`);
      await sleep(250);
    } catch (err) {
      failures += batch.length;
      console.warn(`  ! batch failed: ${(err as Error).message}`);
    }
  }

  // --- phase 3: watchlist listItems (create-only; idempotent via skip) ---
  let wlWritten = 0;
  if (watchlistToCreate.length > 0) {
    console.log("\nPhase 3: writing watchlist listItems...");
    console.log(
      `  fetching TMDB details for ${watchlistToCreate.length} watchlist works...`,
    );
    await prefetchDetails(watchlistToCreate.map(watchlistGroup));
    for (const entry of watchlistToCreate) {
      const g = watchlistGroup(entry);
      const detail = detailCache.get(`${g.mediaType}:${g.tmdbId}`) ?? null;
      const listType: ListType =
        entry.mediaType === "movie" ? "movie_watchlist" : "tv_show_watchlist";
      const listUri = await ensureList(agent, did, listType, existingLists);
      try {
        const value = buildListItemValue(
          g,
          detail,
          listUri,
          listType,
          entry.listedAt,
          [],
        );
        await withRateLimit(() =>
          agent!.com.atproto.repo.createRecord({
            repo: did,
            collection: LIST_ITEM_COLLECTION,
            record: value,
            validate: false,
          }),
        );
        wlWritten++;
      } catch (err) {
        failures++;
        console.warn(
          `  ! watchlist item failed for ${g.key}: ${(err as Error).message}`,
        );
      }
      if (wlWritten % 50 === 0 || wlWritten === watchlistToCreate.length)
        console.log(`  watchlist: ${wlWritten}/${watchlistToCreate.length}`);
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s.`);
  console.log(`  listItems processed: ${works.length}`);
  console.log(`  watch records written: ${written}`);
  console.log(`  watchlist items written: ${wlWritten}`);
  console.log(`  watch records skipped (already present): ${watchesSkipped}`);
  if (missingSubject > 0)
    console.log(`  watch records skipped (listItem failed): ${missingSubject}`);
  if (failures > 0) {
    console.error(
      `\n${failures} write(s) failed. Re-run the same command to resume (idempotent).`,
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// watch record helpers
// ---------------------------------------------------------------------------

function planWatchValue(ev: PlayEvent, rewatch: boolean): Record<string, unknown> {
  return buildWatchValue(ev, rewatch, { uri: "", cid: "" });
}

function buildWatchValue(
  ev: PlayEvent,
  rewatch: boolean,
  subject: { uri: string; cid: string },
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

function watchKey(v: Record<string, unknown>): string {
  return [
    v.tmdbId ?? "",
    v.watchedAt ?? "",
    v.season ?? "",
    v.episode ?? "",
  ].join("|");
}

function mergeEpisodes(
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

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

function countJson(source: Source, entries: string[], pattern: RegExp): number {
  let total = 0;
  for (const e of entries) {
    if (!pattern.test(e)) continue;
    try {
      const parsed = JSON.parse(source.read(e));
      if (Array.isArray(parsed)) total += parsed.length;
      else if (parsed && Array.isArray(parsed.items)) total += parsed.items.length;
    } catch {
      /* ignore */
    }
  }
  return total;
}

function reportSideChannels(source: Source, entries: string[]): void {
  const ratings =
    countJson(source, entries, /ratings-movies.*\.json$/) +
    countJson(source, entries, /ratings-shows.*\.json$/) +
    countJson(source, entries, /ratings-seasons.*\.json$/) +
    countJson(source, entries, /ratings-episodes.*\.json$/);
  const favorites = countJson(source, entries, /lists-favorites\.json$/);
  const customLists = entries.filter((e) =>
    /lists-list-.*\.json$/.test(e),
  ).length;
  console.log(
    `\nOther sections (import deferred, out of scope for this slice):\n` +
      `  ratings: ${ratings}   favorites: ${favorites}   custom lists: ${customLists}`,
  );
}

function crossCheck(source: Source, entries: string[], works: WorkGroup[]): void {
  const aggMovies = countJson(source, entries, /watched-movies.*\.json$/);
  const aggShows = countJson(source, entries, /watched-shows.*\.json$/);
  const importedMovies = works.filter((w) => w.mediaType === "movie").length;
  const importedShows = works.filter((w) => w.mediaType === "tv").length;
  console.log(
    `\nCross-check vs Trakt aggregates:\n` +
      `  movies: ${importedMovies} works imported vs ${aggMovies} in watched-movies\n` +
      `  shows:  ${importedShows} works imported vs ${aggShows} in watched-shows`,
  );
}

function printPlan(plan: Plan): void {
  const movies = plan.works.filter((w) => w.mediaType === "movie").length;
  const shows = plan.works.filter((w) => w.mediaType === "tv").length;
  console.log("\n=== Import plan ===");
  console.log(`  play events (after filters):   ${plan.events.length}`);
  console.log(`  distinct works:                ${plan.works.length} (${movies} movies, ${shows} shows)`);
  console.log(`  listItems to create:           ${plan.listItemsToCreate}`);
  console.log(`  listItems to update:           ${plan.listItemsToUpdate}`);
  console.log(`  watch records to write:        ${plan.watchesToWrite}`);
  console.log(`  watch records already present: ${plan.watchesSkipped}`);
  const wlMovies = plan.watchlistToCreate.filter(
    (e) => e.mediaType === "movie",
  ).length;
  const wlShows = plan.watchlistToCreate.length - wlMovies;
  console.log(`  watchlist items parsed:        ${plan.watchlistParsed}`);
  console.log(
    `  watchlist items to add:        ${plan.watchlistToCreate.length} (${wlMovies} movies, ${wlShows} shows)`,
  );
  console.log(`  watchlist already tracked:     ${plan.watchlistSkipped}`);
  console.log(`  TMDB detail calls:             ${plan.tmdbCallsNeeded}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
