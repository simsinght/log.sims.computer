// In-app URLs for shows, seasons and episodes, so the shape lives in one place.
// Links to these are numerous (every episode row, every home card), so they
// are rendered with prefetch={false} like the existing /show links: RSC
// prefetches of force-dynamic pages only fetch the loading skeleton and get
// aborted noisily as rows scroll past.

export function showHref(tmdbId: number): string {
  return `/show/${tmdbId}`;
}

export function seasonHref(tmdbId: number, season: number): string {
  return `/show/${tmdbId}/season/${season}`;
}

export function episodeHref(
  tmdbId: number,
  season: number,
  episode: number,
): string {
  return `/show/${tmdbId}/season/${season}/episode/${episode}`;
}

// Route params are strings; accept only plain non-negative integers ("01",
// "1.0" and "1e1" are not episode numbers).
export function parseRouteInt(raw: string, min: number): number | null {
  if (!/^(0|[1-9]\d{0,8})$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min ? n : null;
}
