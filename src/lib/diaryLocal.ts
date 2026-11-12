import type { DiaryDay, DiaryEntry } from "./diary";

// Browser-side diary grouping. Runs in the viewer's timezone, so it must be
// called on the client (after mount), never during server render — the
// server's timezone (UTC in the Docker image) is not the viewer's.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Local calendar date (YYYY-MM-DD) of a watchedAt value. Date-only values
// ("2026-08-12") are already a calendar day and are kept as-is; parsing them
// would read UTC midnight and shift them a day west of UTC.
export function localDayKey(watchedAt: string): string {
  if (!watchedAt.includes("T")) return watchedAt.slice(0, 10);
  const d = new Date(watchedAt);
  if (Number.isNaN(d.getTime())) return watchedAt.slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Groups entries (already newest-first, as listDiaryEntries returns them) by
// the viewer's local day. Days come out newest-first; entries keep their
// newest-first order within a day.
export function groupByLocalDay(entries: DiaryEntry[]): DiaryDay[] {
  const byDay = new Map<string, DiaryEntry[]>();
  for (const entry of entries) {
    if (!entry.watchedAt) continue;
    const key = localDayKey(entry.watchedAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(entry);
    else byDay.set(key, [entry]);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, dayEntries]) => ({ date, entries: dayEntries }));
}
