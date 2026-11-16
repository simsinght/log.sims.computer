// "Oct 14, 1993" for a TMDB YYYY-MM-DD air date. Formatted in UTC so the
// server render and the client hydration always agree.
export function formatAirDate(airDate: string | null): string | null {
  if (!airDate || !/^\d{4}-\d{2}-\d{2}$/.test(airDate)) return null;
  return new Date(`${airDate}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// The air-date line for an episode: "Oct 14, 1993", "Airs Dec 25, 2026" for
// one still to come, or "Air date TBA". `today` is YYYY-MM-DD, passed in by the
// server page so every row agrees on it.
export function airDateLabel(airDate: string | null, today: string): string {
  const formatted = formatAirDate(airDate);
  if (!formatted || !airDate) return "Air date TBA";
  return airDate > today ? `Airs ${formatted}` : formatted;
}

export function formatRuntime(minutes: number | null): string | null {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
