// Server components that read the account's diary notes for a show and hand
// them to the client note UI. Both are meant to sit inside <Suspense
// fallback={null}>: the first read after a restart builds the watch index (a
// full pass over the diary), and the rest of the page shouldn't wait on it.
import { getSeasonEpisodes } from "@/lib/tmdb";
import { getShowDiaryWatches } from "@/lib/showNotes";
import { episodeHref } from "@/lib/routes";
import {
  EpisodeNotes,
  NotesSection,
  type NoteListItem,
} from "@/components/DiaryNotes";

// "S2 · E4 — Title" (just "S2 · E4" when TMDB has no title for it).
function episodeLabel(season: number, episode: number, name?: string): string {
  const base = `S${season} · E${episode}`;
  const trimmed = name?.trim();
  return trimmed ? `${base} — ${trimmed}` : base;
}

/**
 * Every note on the show's episodes — or one season's, with `season` — in
 * episode order (specials last), oldest watch first within an episode.
 */
export async function ShowNotes({
  tmdbId,
  season,
}: {
  tmdbId: number;
  season?: number;
}) {
  const watches = (await getShowDiaryWatches(tmdbId, "notes")).filter(
    (w) => w.note && (season === undefined || w.season === season),
  );
  if (watches.length === 0) return null;

  // Episode titles for the labels: one (cached) season listing per season
  // that has a note. A failed listing just leaves those labels untitled.
  const seasons = [...new Set(watches.map((w) => w.season))];
  const names = new Map<string, string>();
  await Promise.all(
    seasons.map(async (s) => {
      const eps = await getSeasonEpisodes(tmdbId, s).catch(() => []);
      for (const e of eps) names.set(`${s}-${e.episodeNumber}`, e.name);
    }),
  );

  const items: NoteListItem[] = watches
    .slice()
    // getShowWatches is already in episode order; only move specials last.
    .sort((a, b) => Number(a.season === 0) - Number(b.season === 0))
    .map((w) => ({
      rkey: w.rkey,
      watchedAt: w.watchedAt,
      note: w.note as string,
      label: episodeLabel(w.season, w.episode, names.get(`${w.season}-${w.episode}`)),
      href: episodeHref(tmdbId, w.season, w.episode),
    }));

  const key = items.map((i) => `${i.rkey}:${i.note}`).join("|");
  return <NotesSection key={key} items={items} />;
}

/** The episode page's own note(s), or an "Add a note" for a logged episode. */
export async function EpisodeNote({
  tmdbId,
  season,
  episode,
}: {
  tmdbId: number;
  season: number;
  episode: number;
}) {
  const watches = (await getShowDiaryWatches(tmdbId, "episode")).filter(
    (w) => w.season === season && w.episode === episode,
  );
  if (watches.length === 0) return null;
  const props = watches.map((w) => ({
    rkey: w.rkey,
    watchedAt: w.watchedAt,
    note: w.note,
  }));
  // Remount when the server data changes (a new log refreshes the page), so
  // the client state starts from it rather than its first props.
  const key = props.map((w) => `${w.rkey}:${w.note ?? ""}`).join("|");
  return (
    <EpisodeNotes key={key} label={`S${season}E${episode}`} watches={props} />
  );
}
