import type { Agent } from "@atproto/api";
import { listWatches, type WatchRecord } from "@/lib/atproto/records";
import { PUBLIC_REPO, type WriteDestination } from "@/lib/atproto/write";
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

// UTC calendar date of an ISO timestamp. Server-side grouping can only be UTC
// (the server never knows the viewer's timezone), so a 9:15 PM Pacific watch
// (stored as 04:15Z) lands on the next day here. UI that shows days to a
// person should group in the browser instead — see groupByLocalDay in
// src/lib/diaryLocal.ts, which /social uses.
function utcDayKey(iso: string): string {
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

// Flat diary entries, newest watchedAt first, with titles resolved. Entries
// with no watchedAt are dropped.
export async function listDiaryEntries(
  agent: Agent,
  did: string,
  limit = 50,
  dest: WriteDestination = PUBLIC_REPO,
): Promise<DiaryEntry[]> {
  const watches = await listWatches(agent, did, limit, dest);
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

  return entries.filter((e) => e.watchedAt);
}

// Diary grouped by **UTC** day (newest first) — what GET /api/diary returns.
// Day keys are UTC dates, not the viewer's local dates; don't render them as
// a person's days without regrouping client-side (see utcDayKey above).
export async function buildDiary(
  agent: Agent,
  did: string,
  limit = 50,
  dest: WriteDestination = PUBLIC_REPO,
): Promise<DiaryDay[]> {
  const entries = await listDiaryEntries(agent, did, limit, dest);
  const byDay = new Map<string, DiaryEntry[]>();
  for (const entry of entries) {
    const key = utcDayKey(entry.watchedAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(entry);
    else byDay.set(key, [entry]);
  }

  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, dayEntries]) => ({ date, entries: dayEntries }));
}
