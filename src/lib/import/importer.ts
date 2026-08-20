/**
 * Import orchestration shared by the CLI and the web API route.
 *
 *   computePlan  — reads existing records for idempotency and diffs the export
 *                  against them (create/update/skip counts). Pure read side.
 *   executeImport — the three write phases (listItems, watch diary via batched
 *                  applyWrites, watchlist), driven off the plan.
 *
 * Idempotency is a property of the diff, not of any persisted job state: both
 * functions re-read the account's records every run, so a re-upload after a
 * crash (or a completed import) skips everything already written. Progress and
 * log are surfaced through callbacks — the CLI prints them, the web route folds
 * them into the in-memory job.
 */
import type { Agent } from "@atproto/api";
import type {
  Logger,
  ParsedExport,
  WatchlistEntry,
  WatchedEpisode,
} from "./parse.ts";
import { watchlistGroup } from "./parse.ts";
import {
  getCachedDetail,
  getTmdbCallCount,
  prefetchDetails,
} from "./tmdb.ts";
import {
  PUBLIC_REPO,
  createRecord as writeCreate,
  putRecord as writePut,
  applyWritesCreate,
  type BatchCreate,
} from "../atproto/write.ts";
import {
  LIST_ITEM_COLLECTION,
  LIST_COLLECTION,
  WATCH_COLLECTION,
  WRITE_BATCH,
  buildListItemValue,
  buildWatchValue,
  ensureList,
  indexExistingItems,
  listAllRecords,
  mergeEpisodes,
  planWatchValue,
  targetListType,
  watchKey,
  withRateLimit,
  type ListType,
  type RepoRecord,
  type StrongRef,
} from "./records.ts";

export interface ImportCounts {
  events: number;
  works: number;
  movies: number;
  shows: number;
  listItemsToCreate: number;
  listItemsToUpdate: number;
  watchesToWrite: number;
  watchesSkipped: number;
  watchlistParsed: number;
  watchlistToCreate: number;
  watchlistMovies: number;
  watchlistShows: number;
  watchlistSkipped: number;
  tmdbCallsNeeded: number;
}

export interface ImportPlan {
  parsed: ParsedExport;
  itemByTmdb: Map<string, RepoRecord>;
  existingWatchKeys: Set<string>;
  existingLists: RepoRecord[];
  watchlistToCreate: WatchlistEntry[];
  counts: ImportCounts;
}

export interface ComputePlanOptions {
  prefetch?: boolean;
  log?: Logger;
}

const noop: Logger = () => {};

export async function computePlan(
  agent: Agent | null,
  did: string,
  parsed: ParsedExport,
  opts: ComputePlanOptions = {},
): Promise<ImportPlan> {
  const log = opts.log ?? noop;
  const { events, works, rewatchFlags, watchlistEntries } = parsed;

  let existingItems: RepoRecord[] = [];
  let existingLists: RepoRecord[] = [];
  const existingWatchKeys = new Set<string>();
  if (agent) {
    log("Reading existing records for idempotency...");
    existingItems = await listAllRecords(agent, did, LIST_ITEM_COLLECTION);
    existingLists = await listAllRecords(agent, did, LIST_COLLECTION);
    const watches = await listAllRecords(agent, did, WATCH_COLLECTION);
    for (const w of watches) existingWatchKeys.add(watchKey(w.value));
    log(
      `  existing: ${existingItems.length} listItems, ${watches.length} watch records`,
    );
  }

  const itemByTmdb = indexExistingItems(existingItems);

  const tmdbNeeded = works.filter(
    (w) => getCachedDetail(w.mediaType, w.tmdbId) === null,
  ).length;
  if (agent && opts.prefetch) {
    log(`Fetching TMDB details for ${works.length} works...`);
    await prefetchDetails(works, {
      log,
      onError: (m) => log(`  ! ${m}`),
    });
  }

  let watchesToWrite = 0;
  for (let i = 0; i < events.length; i++) {
    if (!existingWatchKeys.has(watchKey(planWatchValue(events[i], rewatchFlags[i]))))
      watchesToWrite++;
  }

  let listItemsToCreate = 0;
  let listItemsToUpdate = 0;
  for (const g of works) {
    const existing = itemByTmdb.get(`${g.mediaType}:${g.tmdbId}`);
    if (!existing) {
      listItemsToCreate++;
    } else {
      const prevEps =
        (existing.value.watchedEpisodes as WatchedEpisode[] | undefined) ?? [];
      const prevKeys = new Set(
        prevEps.map((e) => `${e.seasonNumber}-${e.episodeNumber}`),
      );
      const hasNew = [...g.episodes.keys()].some((k) => !prevKeys.has(k));
      if (hasNew) listItemsToUpdate++;
    }
  }
  const watchesSkipped = events.length - watchesToWrite;

  // Watchlist: add only works not already tracked in ANY existing list, and not
  // among the history works this run imports (a watched show shouldn't re-enter
  // the watchlist).
  const trackedKeys = new Set<string>(itemByTmdb.keys());
  for (const w of works) trackedKeys.add(`${w.mediaType}:${w.tmdbId}`);
  const watchlistToCreate = watchlistEntries.filter(
    (e) => !trackedKeys.has(`${e.mediaType}:${e.tmdbId}`),
  );
  const watchlistSkipped = watchlistEntries.length - watchlistToCreate.length;

  const movies = works.filter((w) => w.mediaType === "movie").length;
  const shows = works.length - movies;
  const watchlistMovies = watchlistToCreate.filter(
    (e) => e.mediaType === "movie",
  ).length;

  const counts: ImportCounts = {
    events: events.length,
    works: works.length,
    movies,
    shows,
    listItemsToCreate,
    listItemsToUpdate,
    watchesToWrite,
    watchesSkipped,
    watchlistParsed: watchlistEntries.length,
    watchlistToCreate: watchlistToCreate.length,
    watchlistMovies,
    watchlistShows: watchlistToCreate.length - watchlistMovies,
    watchlistSkipped,
    tmdbCallsNeeded: agent && opts.prefetch ? getTmdbCallCount() : tmdbNeeded,
  };

  return {
    parsed,
    itemByTmdb,
    existingWatchKeys,
    existingLists,
    watchlistToCreate,
    counts,
  };
}

export interface ImportProgress {
  phase: "listItems" | "watches" | "watchlist" | "done";
  listItemsDone: number;
  listItemsTotal: number;
  watchesWritten: number;
  watchesTotal: number;
  watchlistWritten: number;
  watchlistTotal: number;
  rateLimitedUntil: number | null;
}

export interface ImportResult {
  listItemsProcessed: number;
  watchesWritten: number;
  watchlistWritten: number;
  watchesSkipped: number;
  missingSubject: number;
  failures: number;
  elapsedMs: number;
}

export interface ExecuteOptions {
  log?: Logger;
  onProgress?: (progress: ImportProgress) => void;
}

export async function executeImport(
  agent: Agent,
  did: string,
  plan: ImportPlan,
  opts: ExecuteOptions = {},
): Promise<ImportResult> {
  const log = opts.log ?? noop;
  const { events, rewatchFlags, works } = plan.parsed;
  const { itemByTmdb, existingWatchKeys, existingLists, watchlistToCreate } =
    plan;

  const listUriCache = new Map<ListType, string>();

  const progress: ImportProgress = {
    phase: "listItems",
    listItemsDone: 0,
    listItemsTotal: works.length,
    watchesWritten: 0,
    watchesTotal: plan.counts.watchesToWrite,
    watchlistWritten: 0,
    watchlistTotal: watchlistToCreate.length,
    rateLimitedUntil: null,
  };
  const emit = () => opts.onProgress?.({ ...progress });
  const onWait = (waitMs: number) => {
    progress.rateLimitedUntil = Date.now() + waitMs;
    log(`  rate-limited; waiting ${Math.ceil(waitMs / 1000)}s...`);
    emit();
  };
  const clearWait = () => {
    if (progress.rateLimitedUntil !== null) {
      progress.rateLimitedUntil = null;
      emit();
    }
  };

  const started = Date.now();
  let failures = 0;
  emit();

  // TMDB details drive the target list + display fields; cache-guarded so the
  // CLI's earlier prefetch is a no-op and the web route (which skips prefetch in
  // computePlan) fetches here.
  await prefetchDetails(works, { log, onError: (m) => log(`  ! ${m}`) });

  // --- phase 1: listItems (individual writes -> strongRef per work) ---
  log("\nPhase 1: upserting listItems...");
  const subjectByWork = new Map<string, StrongRef>();
  let done = 0;
  for (const g of works) {
    done++;
    const detail = getCachedDetail(g.mediaType, g.tmdbId);
    const listType = targetListType(g, detail);
    const listUri = await ensureList(
      agent,
      did,
      listType,
      existingLists,
      listUriCache,
    );
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
        const created = await withRateLimit(
          () =>
            writeCreate(agent, PUBLIC_REPO, {
              repo: did,
              collection: LIST_ITEM_COLLECTION,
              record: value,
              validate: false,
            }),
          { onWait },
        );
        clearWait();
        subjectByWork.set(g.key, { uri: created.uri, cid: created.cid });
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
          const put = await withRateLimit(
            () =>
              writePut(agent, PUBLIC_REPO, {
                repo: did,
                collection: LIST_ITEM_COLLECTION,
                rkey,
                record: value,
                validate: false,
              }),
            { onWait },
          );
          clearWait();
          subjectByWork.set(g.key, { uri: put.uri, cid: put.cid });
        }
      }
    } catch (err) {
      failures++;
      log(`  ! listItem failed for ${g.key}: ${(err as Error).message}`);
    }
    progress.listItemsDone = done;
    emit();
    if (done % 50 === 0 || done === works.length)
      log(`  listItems: ${done}/${works.length}`);
  }

  // --- phase 2: watch records (applyWrites, batched) ---
  progress.phase = "watches";
  emit();
  log("\nPhase 2: writing watch diary records...");
  const writes: BatchCreate[] = [];
  let missingSubject = 0;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const subject = subjectByWork.get(`${ev.mediaType}:${ev.workTmdbId}`);
    const planned = !existingWatchKeys.has(
      watchKey(planWatchValue(ev, rewatchFlags[i])),
    );
    if (!subject) {
      if (planned) missingSubject++; // its listItem failed; can't write the diary entry
      continue;
    }
    const value = buildWatchValue(ev, rewatchFlags[i], subject);
    if (existingWatchKeys.has(watchKey(value))) continue;
    writes.push({
      collection: WATCH_COLLECTION,
      value,
    });
  }

  let written = 0;
  for (let i = 0; i < writes.length; i += WRITE_BATCH) {
    const batch = writes.slice(i, i + WRITE_BATCH);
    try {
      await withRateLimit(
        () =>
          applyWritesCreate(agent, PUBLIC_REPO, {
            repo: did,
            validate: false,
            creates: batch,
          }),
        { onWait },
      );
      clearWait();
      written += batch.length;
      progress.watchesWritten = written;
      emit();
      log(`  watches: ${written}/${writes.length}`);
      await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      failures += batch.length;
      log(`  ! batch failed: ${(err as Error).message}`);
    }
  }

  // --- phase 3: watchlist listItems (create-only; idempotent via skip) ---
  progress.phase = "watchlist";
  emit();
  let wlWritten = 0;
  if (watchlistToCreate.length > 0) {
    log("\nPhase 3: writing watchlist listItems...");
    log(
      `  fetching TMDB details for ${watchlistToCreate.length} watchlist works...`,
    );
    await prefetchDetails(watchlistToCreate.map(watchlistGroup), {
      log,
      onError: (m) => log(`  ! ${m}`),
    });
    for (const entry of watchlistToCreate) {
      const g = watchlistGroup(entry);
      const detail = getCachedDetail(g.mediaType, g.tmdbId);
      const listType: ListType =
        entry.mediaType === "movie" ? "movie_watchlist" : "tv_show_watchlist";
      const listUri = await ensureList(
        agent,
        did,
        listType,
        existingLists,
        listUriCache,
      );
      try {
        const value = buildListItemValue(
          g,
          detail,
          listUri,
          listType,
          entry.listedAt,
          [],
        );
        await withRateLimit(
          () =>
            writeCreate(agent, PUBLIC_REPO, {
              repo: did,
              collection: LIST_ITEM_COLLECTION,
              record: value,
              validate: false,
            }),
          { onWait },
        );
        clearWait();
        wlWritten++;
      } catch (err) {
        failures++;
        log(`  ! watchlist item failed for ${g.key}: ${(err as Error).message}`);
      }
      progress.watchlistWritten = wlWritten;
      emit();
      if (wlWritten % 50 === 0 || wlWritten === watchlistToCreate.length)
        log(`  watchlist: ${wlWritten}/${watchlistToCreate.length}`);
    }
  }

  progress.phase = "done";
  emit();

  return {
    listItemsProcessed: works.length,
    watchesWritten: written,
    watchlistWritten: wlWritten,
    watchesSkipped: plan.counts.watchesSkipped,
    missingSubject,
    failures,
    elapsedMs: Date.now() - started,
  };
}
