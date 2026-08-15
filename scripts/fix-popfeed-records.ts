/**
 * One-shot migration: rewrite the test account's existing Popfeed records from
 * the stale/wrong shape (status field, tmdbTvSeriesId, single "watched" list,
 * no display fields) to the live-confirmed shape. Rewrites listItems in place
 * (same rkey via putRecord), creates the three media-specific lists, repoints
 * listUri/listType, and deletes the old "watched" list.
 *
 * Run: node scripts/fix-popfeed-records.ts
 * (Node 25's native TS type-stripping runs this directly; tsx is broken on
 * Node 25 for deps with subpath exports like multiformats/cid.)
 *
 * Self-contained on purpose: it mirrors src/lib/atproto/records.ts +
 * src/lib/tmdb.ts rather than importing them, because those use non-erasable
 * syntax / the "@/" path alias that native strip-types cannot resolve.
 *
 * Auth: ATP_TEST_HANDLE / ATP_TEST_APP_PASSWORD from .env.local
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AtpAgent } from "@atproto/api";

const LIST_COLLECTION = "social.popfeed.feed.list";
const LIST_ITEM_COLLECTION = "social.popfeed.feed.listItem";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

type MediaType = "movie" | "tv";
type ListType =
  | "watched_movies"
  | "currently_watching_tv_shows"
  | "watched_tv_shows";

const LIST_NAMES: Record<ListType, string> = {
  watched_movies: "Watched Movies",
  currently_watching_tv_shows: "Currently Watching",
  watched_tv_shows: "Watched Shows",
};

function loadEnv(): void {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ---- identity (mirrors src/lib/atproto/identity.ts) ----
async function resolveIdentity(
  handle: string,
): Promise<{ did: string; pdsUrl: string }> {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  const rh = new URL(
    "/xrpc/com.atproto.identity.resolveHandle",
    "https://bsky.social",
  );
  rh.searchParams.set("handle", h);
  const didRes = await fetch(rh);
  const did = ((await didRes.json()) as { did?: string }).did;
  if (!did) throw new Error(`Could not resolve handle ${handle}`);
  const docRes = await fetch(`https://plc.directory/${did}`);
  const doc = (await docRes.json()) as {
    service?: { id: string; serviceEndpoint: string }[];
  };
  const svc = doc.service?.find((s) => s.id.endsWith("#atproto_pds"));
  if (!svc?.serviceEndpoint) throw new Error("No PDS endpoint in DID doc");
  return { did, pdsUrl: svc.serviceEndpoint };
}

// ---- TMDB (mirrors src/lib/tmdb.ts) ----
interface WorkDetail {
  tmdbId: number;
  title: string;
  releaseDate: string | null;
  genres: string[];
  posterPath: string | null;
  backdropUrl: string | null;
  imdbId: string | null;
  mainCredit: string | null;
  mainCreditRole: "director" | "network" | null;
}

function isoDate(d?: string): string | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return `${d}T00:00:00.000Z`;
}

async function tmdbJson(path: string): Promise<Record<string, unknown>> {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY not configured");
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", key);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`TMDB request failed (${res.status}) for ${path}`);
  return (await res.json()) as Record<string, unknown>;
}

async function getWorkDetail(type: MediaType, id: number): Promise<WorkDetail> {
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
      ((raw.credits as { crew?: { job?: string; name?: string }[] } | undefined)
        ?.crew) ?? [];
    mainCredit = crew.find((c) => c.job === "Director")?.name ?? null;
    mainCreditRole = mainCredit ? "director" : null;
  } else {
    const networks = (raw.networks as { name?: string }[] | undefined) ?? [];
    mainCredit = networks[0]?.name ?? null;
    mainCreditRole = mainCredit ? "network" : null;
  }

  return {
    tmdbId: raw.id as number,
    title: ((type === "movie" ? raw.title : raw.name) as string) ?? "",
    releaseDate: isoDate(
      (type === "movie" ? raw.release_date : raw.first_air_date) as string,
    ),
    genres,
    posterPath,
    backdropUrl: backdropPath ? `${TMDB_IMAGE_BASE}/original${backdropPath}` : null,
    imdbId: type === "movie" ? ((raw.imdb_id as string | null) ?? null) : null,
    mainCredit,
    mainCreditRole,
  };
}

async function getEpisodeTmdbId(
  showId: number,
  season: number,
  episode: number,
): Promise<string | null> {
  try {
    const raw = await tmdbJson(`/tv/${showId}/season/${season}/episode/${episode}`);
    return typeof raw.id === "number" ? String(raw.id) : null;
  } catch {
    return null;
  }
}

async function fetchPosterJpeg(posterPath: string): Promise<Uint8Array | null> {
  const res = await fetch(`${TMDB_IMAGE_BASE}/w500${posterPath}`);
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

// ---- atproto record helpers (mirrors src/lib/atproto/records.ts) ----
interface RepoRecord {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
}

async function listAllRecords(
  agent: AtpAgent,
  did: string,
  collection: string,
): Promise<RepoRecord[]> {
  const out: RepoRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection,
      limit: 100,
      cursor,
    });
    for (const r of res.data.records) {
      out.push({ uri: r.uri, cid: r.cid, value: r.value as Record<string, unknown> });
    }
    cursor = res.data.cursor;
    if (!cursor || res.data.records.length === 0) break;
  }
  return out;
}

const listUriCache = new Map<ListType, string>();

async function ensureList(
  agent: AtpAgent,
  did: string,
  listType: ListType,
): Promise<string> {
  const cached = listUriCache.get(listType);
  if (cached) return cached;
  const lists = await listAllRecords(agent, did, LIST_COLLECTION);
  const existing = lists.find((r) => r.value.listType === listType);
  if (existing) {
    listUriCache.set(listType, existing.uri);
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
  listUriCache.set(listType, created.data.uri);
  return created.data.uri;
}

async function buildDisplayFields(
  agent: AtpAgent,
  did: string,
  detail: WorkDetail,
  title: string,
): Promise<Record<string, unknown>> {
  const identifiers: Record<string, string> = { tmdbId: String(detail.tmdbId) };
  if (detail.imdbId) identifiers.imdbId = detail.imdbId;
  const fields: Record<string, unknown> = {
    title: title || detail.title,
    identifiers,
    genres: detail.genres,
  };
  if (detail.releaseDate) fields.releaseDate = detail.releaseDate;
  if (detail.backdropUrl) fields.backdropUrl = detail.backdropUrl;
  if (detail.mainCredit) fields.mainCredit = detail.mainCredit;
  if (detail.mainCreditRole) fields.mainCreditRole = detail.mainCreditRole;
  if (detail.posterPath) {
    const bytes = await fetchPosterJpeg(detail.posterPath);
    if (bytes) {
      const up = await agent.uploadBlob(bytes, { encoding: "image/jpeg" });
      fields.poster = up.data.blob;
      fields.posterUrl = `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/${up.data.blob.ref.toString()}@jpeg`;
    }
  }
  return fields;
}

async function main() {
  loadEnv();
  const handle = process.env.ATP_TEST_HANDLE;
  const password = process.env.ATP_TEST_APP_PASSWORD;
  if (!handle || !password) {
    throw new Error("ATP_TEST_HANDLE / ATP_TEST_APP_PASSWORD not set");
  }

  const { did, pdsUrl } = await resolveIdentity(handle);
  console.log(`Account: ${handle} (${did}) @ ${pdsUrl}`);
  const agent = new AtpAgent({ service: pdsUrl });
  await agent.login({ identifier: handle, password });

  for (const lt of [
    "watched_movies",
    "currently_watching_tv_shows",
    "watched_tv_shows",
  ] as ListType[]) {
    console.log(`List ${lt}: ${await ensureList(agent, did, lt)}`);
  }

  const items = await listAllRecords(agent, did, LIST_ITEM_COLLECTION);
  console.log(`\nRewriting ${items.length} listItem(s)...\n`);

  for (const item of items) {
    const v = item.value;
    const rkey = item.uri.split("/").pop() as string;
    const cwt = String(v.creativeWorkType);
    const mediaType: MediaType = cwt === "movie" ? "movie" : "tv";
    const ids = (v.identifiers ?? {}) as Record<string, unknown>;
    const tmdbId = Number(ids.tmdbId ?? ids.tmdbTvSeriesId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      console.log(`  SKIP ${rkey}: no usable tmdbId`);
      continue;
    }
    const rawEpisodes = Array.isArray(v.watchedEpisodes)
      ? (v.watchedEpisodes as {
          seasonNumber: number;
          episodeNumber: number;
        }[])
      : [];
    const listType: ListType =
      mediaType === "movie"
        ? "watched_movies"
        : rawEpisodes.length > 0
          ? "currently_watching_tv_shows"
          : "watched_tv_shows";
    const listUri = await ensureList(agent, did, listType);
    const detail = await getWorkDetail(mediaType, tmdbId);
    const display = await buildDisplayFields(
      agent,
      did,
      detail,
      typeof v.title === "string" ? v.title : "",
    );

    const episodes: {
      seasonNumber: number;
      episodeNumber: number;
      tmdbId?: string;
    }[] = [];
    for (const ep of rawEpisodes) {
      const epId = await getEpisodeTmdbId(tmdbId, ep.seasonNumber, ep.episodeNumber);
      const entry: { seasonNumber: number; episodeNumber: number; tmdbId?: string } = {
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
      };
      if (epId) entry.tmdbId = epId;
      episodes.push(entry);
    }

    const value: Record<string, unknown> = {
      $type: LIST_ITEM_COLLECTION,
      ...display,
      creativeWorkType: cwt,
      listUri,
      listType,
      addedAt: typeof v.addedAt === "string" ? v.addedAt : new Date().toISOString(),
    };
    if (episodes.length > 0) value.watchedEpisodes = episodes;

    await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: LIST_ITEM_COLLECTION,
      rkey,
      record: value,
      validate: false,
    });
    console.log(
      `  ${rkey}  ${display.title}  ->  ${listType}  ` +
        `(tmdbId=${(display.identifiers as Record<string, string>).tmdbId}` +
        `${(display.identifiers as Record<string, string>).imdbId ? `, imdbId=${(display.identifiers as Record<string, string>).imdbId}` : ""}` +
        `${episodes.length ? `, ${episodes.length} eps` : ""})`,
    );
  }

  const lists = await listAllRecords(agent, did, LIST_COLLECTION);
  for (const l of lists) {
    if (l.value.listType === "watched" || l.value.name === "Watched") {
      const rkey = l.uri.split("/").pop() as string;
      await agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: LIST_COLLECTION,
        rkey,
      });
      console.log(`\nDeleted old list ${rkey} (${String(l.value.name)})`);
    }
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
