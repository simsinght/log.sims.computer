import type { Agent } from "@atproto/api";
import { listWatches, type WatchRecord } from "@/lib/atproto/records";
import { getTitle } from "@/lib/tmdb";

export interface DiaryEntry {
  uri: string;
  tmdbId: string;
  mediaType: "movie" | "tv";
  title: string;
  year: string | null;
  watchedAt: string;
  rewatch: boolean;
  season?: number;
  episode?: number;
  tags: string[];
  note?: string;
}

export interface DiaryDay {
  date: string;
  entries: DiaryEntry[];
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

async function resolveTitles(
  watches: WatchRecord[],
): Promise<Map<string, { title: string; year: string | null }>> {
  const keys = new Map<string, { type: "movie" | "tv"; id: number }>();
  for (const w of watches) {
    const id = Number(w.tmdbId);
    if (!Number.isInteger(id) || id <= 0) continue;
    keys.set(`${w.mediaType}:${w.tmdbId}`, { type: w.mediaType, id });
  }

  const resolved = new Map<string, { title: string; year: string | null }>();
  await Promise.all(
    [...keys.entries()].map(async ([key, { type, id }]) => {
      try {
        const t = await getTitle(type, id);
        resolved.set(key, { title: t.title, year: t.year });
      } catch {
        // Leave unresolved; the view falls back to the id.
      }
    }),
  );
  return resolved;
}

export async function buildDiary(
  agent: Agent,
  did: string,
  limit = 50,
): Promise<DiaryDay[]> {
  const watches = await listWatches(agent, did, limit);
  const titles = await resolveTitles(watches);

  const entries: DiaryEntry[] = watches.map((w) => {
    const resolved = titles.get(`${w.mediaType}:${w.tmdbId}`);
    return {
      uri: w.uri,
      tmdbId: w.tmdbId,
      mediaType: w.mediaType,
      title: resolved?.title ?? `${w.mediaType === "tv" ? "TV" : "Movie"} #${w.tmdbId}`,
      year: resolved?.year ?? null,
      watchedAt: w.watchedAt,
      rewatch: w.rewatch,
      season: w.season,
      episode: w.episode,
      tags: w.tags,
      note: w.note,
    };
  });

  const byDay = new Map<string, DiaryEntry[]>();
  for (const entry of entries) {
    if (!entry.watchedAt) continue;
    const key = dayKey(entry.watchedAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(entry);
    else byDay.set(key, [entry]);
  }

  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, dayEntries]) => ({ date, entries: dayEntries }));
}
