// Home card layout on phones. Cards are landscape (an episode still), so they
// can sit two per row or one per row below the sm breakpoint; from sm up it is
// always three. Switching is this one line.
const CARDS_PER_ROW_ON_PHONES: 1 | 2 = 2;

// Full class strings (not built from the number) so Tailwind sees them.
const GRID = {
  1: "grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3",
  2: "grid grid-cols-2 gap-3 sm:grid-cols-3",
} as const;

const IMAGE_SIZES = {
  1: "(min-width: 640px) 240px, 100vw",
  2: "(min-width: 640px) 240px, 50vw",
} as const;

// Shared by the grid (Watching) and its skeleton (app/loading.tsx).
export const WATCHING_GRID_CLASS = GRID[CARDS_PER_ROW_ON_PHONES];
export const WATCHING_IMAGE_SIZES = IMAGE_SIZES[CARDS_PER_ROW_ON_PHONES];
