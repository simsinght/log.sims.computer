// Offline check for the home page's "next episode" rule — no network, no
// accounts. Imports the EXACT pure function the Watching grid uses
// (src/lib/nextEpisode.ts, loaded via Node's native type-stripping) and runs it
// against hand-built season data. Run: node scripts/next-episode-check.mjs
import {
  pickNextEpisode,
  seasonFullyWatched,
} from "../src/lib/nextEpisode.ts";

const TODAY = "2026-11-16";

// A season of `count` episodes; episodes numbered above `airedThrough` have a
// future air date, and those listed in `nullDates` have no air date at all.
function season(n, count, { airedThrough = count, nullDates = [] } = {}) {
  return {
    seasonNumber: n,
    episodes: Array.from({ length: count }, (_, i) => {
      const e = i + 1;
      return {
        episodeNumber: e,
        name: `S${n}E${e} name`,
        airDate: nullDates.includes(e)
          ? null
          : e <= airedThrough
            ? "2025-01-01"
            : "2027-01-01",
      };
    }),
  };
}
const eps = (s, ...nums) =>
  nums.map((e) => ({ seasonNumber: s, episodeNumber: e }));
const range = (s, from, to) =>
  eps(s, ...Array.from({ length: to - from + 1 }, (_, i) => from + i));
const label = (r) => (r ? `S${r.seasonNumber}E${r.episodeNumber}` : "caught up");

const threeSeasons = [season(1, 9), season(2, 8), season(3, 10)];

const cases = [
  ["Adults bug: {S1E1, S1E6} -> S1E2", eps(1, 1, 6), [season(1, 9)], "S1E2"],
  ["{S1E1..S1E5} -> S1E6 (unchanged)", range(1, 1, 5), [season(1, 9)], "S1E6"],
  ["started mid-series {S3E1, S3E2} -> S3E3", eps(3, 1, 2), threeSeasons, "S3E3"],
  ["{S1E1, S1E2, S1E4} -> S1E3", eps(1, 1, 2, 4), threeSeasons, "S1E3"],
  ["all of S1, none of S2 -> S2E1", range(1, 1, 9), threeSeasons, "S2E1"],
  ["all of S1, S2 not aired yet -> caught up",
    range(1, 1, 9), [season(1, 9), season(2, 8, { airedThrough: 0 })], "caught up"],
  ["everything from earliest on watched -> caught up",
    [...range(1, 1, 9), ...range(2, 1, 8), ...range(3, 1, 10)], threeSeasons, "caught up"],
  ["mid-series start, all after it watched -> caught up (S1 never nagged)",
    [...range(2, 3, 8), ...range(3, 1, 10)], threeSeasons, "caught up"],
  ["rewatches count once: {S1E1, S1E1, S1E2} -> S1E3",
    [...eps(1, 1, 1, 2)], [season(1, 9)], "S1E3"],
  ["unaired episodes at end of season: watched S1E1..E6 of 9, E7+ future -> caught up",
    range(1, 1, 6), [season(1, 9, { airedThrough: 6 })], "caught up"],
  ["gap before unaired tail still found: {S1E1, S1E3}, E4+ future -> S1E2",
    eps(1, 1, 3), [season(1, 9, { airedThrough: 3 })], "S1E2"],
  ["season with zero aired episodes is passed over -> S3E1",
    range(1, 1, 9), [season(1, 9), season(2, 8, { airedThrough: 0 }), season(3, 10)], "S3E1"],
  ["season with no episodes listed at all is passed over -> S3E1",
    range(1, 1, 9), [season(1, 9), { seasonNumber: 2, episodes: [] }, season(3, 10)], "S3E1"],
  ["episode with no air date is skipped: {S1E1}, E2 has null date -> S1E3",
    eps(1, 1), [season(1, 9, { nullDates: [2] })], "S1E3"],
  ["only season-0 watches -> caught up (no card)",
    eps(0, 1, 2), [season(0, 3), ...threeSeasons], "caught up"],
  ["specials never suggested: {S0E1, S1E1} -> S1E2",
    [...eps(0, 1), ...eps(1, 1)], [season(0, 3), season(1, 9)], "S1E2"],
  ["specials ignored even when S1 is done: all S1 -> S2E1 (not S0E2)",
    [...eps(0, 1), ...range(1, 1, 9)], [season(0, 3), season(1, 9), season(2, 8)], "S2E1"],
  ["empty history -> caught up (no card)", [], threeSeasons, "caught up"],
  ["watched episode TMDB doesn't list (S1E20) is the latest -> S1E2",
    eps(1, 1, 20), [season(1, 9)], "S1E2"],
  ["season order of input doesn't matter -> S2E1",
    range(1, 1, 9), [season(3, 10), season(2, 8), season(1, 9)], "S2E1"],
  ["skipped fully-watched season (omitted from input) -> S3E2",
    [...range(1, 1, 9), ...range(2, 1, 8), ...eps(3, 1)], [season(1, 9), season(3, 10)], "S3E2"],
];

const results = [];
for (const [name, watched, seasons, expected] of cases) {
  const got = label(pickNextEpisode(watched, seasons, TODAY));
  results.push({ name, pass: got === expected, detail: `got ${got}, want ${expected}` });
}

// The pick carries the episode's TMDB name and air date for the card.
const picked = pickNextEpisode(eps(1, 1, 6), [season(1, 9)], TODAY);
results.push({
  name: "pick carries name and airDate",
  pass: picked?.name === "S1E2 name" && picked?.airDate === "2025-01-01",
  detail: picked,
});

// seasonFullyWatched gates which seasons are fetched at all.
const fw = [
  ["fully watched season is skippable", seasonFullyWatched(range(1, 1, 9), 1, 9), true],
  ["season with a gap is not skippable", seasonFullyWatched(eps(1, 1, 2, 4), 1, 4), false],
  ["0-episode season is never skippable", seasonFullyWatched([], 2, 0), false],
  ["other seasons' watches don't count", seasonFullyWatched(range(1, 1, 9), 2, 8), false],
];
for (const [name, got, want] of fw) {
  results.push({ name, pass: got === want, detail: `got ${got}, want ${want}` });
}

const passed = results.filter((r) => r.pass).length;
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : `  ${JSON.stringify(r.detail)}`}`);
}
console.log(`\n${passed}/${results.length} assertions passed`);
process.exit(passed === results.length ? 0 : 1);
