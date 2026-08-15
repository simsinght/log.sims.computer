/**
 * Trakt export parsing: watched history -> play events -> per-work groups, plus
 * the watchlist mapping. Pure and erasable-syntax-only (shared by the CLI and the
 * web API route).
 *
 * The `log` callback carries the CLI's exact progress lines so they stay next to
 * the logic that produces them; the web route passes a no-op.
 */
import type { Source } from "./source.ts";
import { readJson } from "./source.ts";

export type MediaType = "movie" | "tv";
export type Logger = (msg: string) => void;
const noop: Logger = () => {};

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

export interface PlayEvent {
  mediaType: MediaType;
  workTmdbId: number; // movie tmdb id, or SHOW tmdb id for episodes
  workImdbId?: string;
  workTitle: string;
  watchedAt: string;
  season?: number;
  episode?: number;
  episodeTmdbId?: string;
}

export function normalizeEvent(e: TraktHistoryEvent): PlayEvent | null {
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
// Grouping
// ---------------------------------------------------------------------------

export interface WatchedEpisode {
  seasonNumber: number;
  episodeNumber: number;
  tmdbId?: string;
}

export interface WorkGroup {
  key: string;
  mediaType: MediaType;
  tmdbId: number;
  imdbId?: string;
  title: string;
  episodes: Map<string, WatchedEpisode>; // key `${s}-${e}`
}

export function groupWorks(events: PlayEvent[]): WorkGroup[] {
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
    if (
      ev.mediaType === "tv" &&
      ev.season !== undefined &&
      ev.episode !== undefined
    ) {
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

// rewatch: same specific thing (movie, or show+season+episode) seen earlier in
// the ascending stream.
export function computeRewatchFlags(events: PlayEvent[]): boolean[] {
  const seen = new Set<string>();
  const flags: boolean[] = [];
  for (const ev of events) {
    const idKey =
      ev.mediaType === "movie"
        ? `m:${ev.workTmdbId}`
        : `e:${ev.workTmdbId}:${ev.season}:${ev.episode}`;
    flags.push(seen.has(idKey));
    seen.add(idKey);
  }
  return flags;
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

export interface WatchlistEntry {
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

export function parseWatchlist(
  source: Source,
  entries: string[],
): WatchlistEntry[] {
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
export function watchlistGroup(entry: WatchlistEntry): WorkGroup {
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
// Full parse pipeline
// ---------------------------------------------------------------------------

export interface ParseOptions {
  since?: string;
  limit?: number;
  log?: Logger;
}

export interface ParsedExport {
  events: PlayEvent[];
  rewatchFlags: boolean[];
  works: WorkGroup[];
  watchlistEntries: WatchlistEntry[];
  skippedNoTmdb: number;
  historyFileCount: number;
}

export function findHistoryFiles(entries: string[]): string[] {
  return entries
    .filter((e) => /(^|\/)watched-history-\d+\.json$/.test(e))
    .sort();
}

export function parseExport(
  source: Source,
  entries: string[],
  opts: ParseOptions = {},
): ParsedExport {
  const log = opts.log ?? noop;

  const historyFiles = findHistoryFiles(entries);
  if (historyFiles.length === 0)
    throw new Error("No watched-history-*.json files found in input");

  log(`Reading ${historyFiles.length} watched-history file(s)...`);
  const raw: TraktHistoryEvent[] = [];
  for (const f of historyFiles)
    raw.push(...readJson<TraktHistoryEvent[]>(source, f));

  let skippedNoTmdb = 0;
  let events: PlayEvent[] = [];
  for (const e of raw) {
    const n = normalizeEvent(e);
    if (!n) skippedNoTmdb++;
    else events.push(n);
  }
  events.sort((a, b) => a.watchedAt.localeCompare(b.watchedAt));

  if (opts.since) {
    const before = events.length;
    events = events.filter((e) => e.watchedAt >= opts.since!);
    log(`--since ${opts.since}: ${before} -> ${events.length} events`);
  }
  if (opts.limit !== undefined && Number.isFinite(opts.limit)) {
    events = events.slice(0, opts.limit);
    log(`--limit ${opts.limit}: ${events.length} events`);
  }

  const rewatchFlags = computeRewatchFlags(events);
  const works = groupWorks(events);
  log(
    `Parsed ${events.length} events (${skippedNoTmdb} skipped, no tmdb id); ${works.length} distinct works.`,
  );

  let watchlistEntries = parseWatchlist(source, entries);
  log(`Parsed ${watchlistEntries.length} watchlist items.`);
  // Apply --limit up front (deterministic first-N) so a re-run considers the
  // same items and skips them — slicing after the tracked-filter would instead
  // pull in the next unimported batch each run.
  if (opts.limit !== undefined && Number.isFinite(opts.limit)) {
    watchlistEntries = watchlistEntries.slice(0, opts.limit);
    log(`--limit ${opts.limit}: ${watchlistEntries.length} watchlist items`);
  }

  return {
    events,
    rewatchFlags,
    works,
    watchlistEntries,
    skippedNoTmdb,
    historyFileCount: historyFiles.length,
  };
}

// ---------------------------------------------------------------------------
// Reporting (counts only; side sections are out of scope for import)
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

export function reportSideChannels(
  source: Source,
  entries: string[],
  log: Logger,
): void {
  const ratings =
    countJson(source, entries, /ratings-movies.*\.json$/) +
    countJson(source, entries, /ratings-shows.*\.json$/) +
    countJson(source, entries, /ratings-seasons.*\.json$/) +
    countJson(source, entries, /ratings-episodes.*\.json$/);
  const favorites = countJson(source, entries, /lists-favorites\.json$/);
  const customLists = entries.filter((e) =>
    /lists-list-.*\.json$/.test(e),
  ).length;
  log(
    `\nOther sections (import deferred, out of scope for this slice):\n` +
      `  ratings: ${ratings}   favorites: ${favorites}   custom lists: ${customLists}`,
  );
}

export function crossCheck(
  source: Source,
  entries: string[],
  works: WorkGroup[],
  log: Logger,
): void {
  const aggMovies = countJson(source, entries, /watched-movies.*\.json$/);
  const aggShows = countJson(source, entries, /watched-shows.*\.json$/);
  const importedMovies = works.filter((w) => w.mediaType === "movie").length;
  const importedShows = works.filter((w) => w.mediaType === "tv").length;
  log(
    `\nCross-check vs Trakt aggregates:\n` +
      `  movies: ${importedMovies} works imported vs ${aggMovies} in watched-movies\n` +
      `  shows:  ${importedShows} works imported vs ${aggShows} in watched-shows`,
  );
}
