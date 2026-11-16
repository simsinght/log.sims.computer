// Watched-state markers shared by the season list, episode rows and the
// episode page (moved here from ShowSeasons unchanged). No "use client": these
// render from server and client components alike.

export function CheckIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// "<n> of <m> watched", a green check + "Watched" when every episode is, and
// nothing at all when none are.
export function SeasonProgress({
  watchedCount,
  episodeCount,
}: {
  watchedCount: number;
  episodeCount: number;
}) {
  if (episodeCount <= 0 || watchedCount <= 0) return null;
  if (watchedCount >= episodeCount) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-green-400">
        <CheckIcon className="h-3.5 w-3.5" />
        Watched
      </span>
    );
  }
  return (
    <span className="shrink-0 text-xs text-gray-400">
      {watchedCount} of {episodeCount} watched
    </span>
  );
}

// The episode log control: a white "Log" button for an unwatched episode, a
// green "Watched" pill for a watched one. Both open the log sheet (logging a
// watched episode again records a rewatch); the accessible names "Log S1E2" /
// "Log again S1E2" tell the two states apart.
export function LogControl({
  label,
  isWatched,
  onClick,
  large = false,
}: {
  label: string;
  isWatched: boolean;
  onClick: () => void;
  large?: boolean;
}) {
  const size = large ? "px-4 py-2 text-sm" : "px-3 py-1 text-xs";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isWatched ? `Log again ${label}` : `Log ${label}`}
      className={
        isWatched
          ? `flex shrink-0 items-center gap-1 rounded-full border border-green-900/70 bg-green-950/40 font-medium text-green-300 transition-colors hover:border-green-700 hover:text-green-200 ${large ? "px-4 py-2 text-sm" : "px-2.5 py-1 text-xs"}`
          : `shrink-0 rounded-full bg-white font-semibold text-black transition-colors hover:bg-gray-200 ${size}`
      }
    >
      {isWatched ? (
        <>
          <CheckIcon className={large ? "h-3.5 w-3.5" : "h-3 w-3"} />
          Watched
        </>
      ) : (
        "Log"
      )}
    </button>
  );
}

export function episodeKey(season: number, episode: number): string {
  return `${season}-${episode}`;
}
