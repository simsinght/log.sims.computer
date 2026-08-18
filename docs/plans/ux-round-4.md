# UX round 4 — second day of driving the app

Sim's notes (2026-08-17):

```
There aren't indicators for what you've watched of a show. It all just says "Log"
Search bar on non-mobile should be at the top right
"Watching" header should be same row as the "Watchlist" and profile icon (including
  when search bar is up there; enough space for desktop). Should prob change it to "tvlog".
– also on search page, let's align more on the same row as the "profile" icon.
For the logging "poster", let's have the checkmark be on the poster itself instead. Right
  now it creates a lot of negative space. The "S1E2" text can go next to the show title so
  "Show Title · S1E2".
When pressing search, the input should be autofocused — remove "Start typing to search…"
– the search icon shouldn't float on the search page
– back from search can only ever go to "← tvlog" even though you can search from any page
pressing pwa prompt at sign in should take you to a walkthrough with screenshots
```

Three stacked PRs.

## PR 1 — `app-header` (→ main)

One shared header row for signed-in users, sticky in normal flow: left slot = **tvlog**
wordmark (home link), or a history-aware **← Back** on `/show/*` and `/search`; middle =
the **search input** (always on `sm+`, phone-only on `/search` where it fills the row);
right = **Watchlist** pill + **profile** icon. `/search` reads `?q=` from the URL and the
header input is its debounced source of truth; from any other page (desktop) typing
navigates to `/search?q=`. Home loses its "Watching" h1 row; the grid starts under the
header. Search FAB is phone-only and hidden on `/search`; the search input focuses on
load (iOS keyboard caveat noted). No in-page "← tvlog" links remain on watchlist/settings;
the show page's back control moves into the header.

## PR 2 — `watched-indicators` (→ app-header)

Show page: episode rows and season headers show watched state (checkmark / "n of m
watched") from the show's listItem `watchedEpisodes`; watched rows can still be logged
again (rewatch). Watching card: the checkmark log button sits on the poster (bottom-right
overlay); the body is one line "Show Title · S1E2" and the episode title below — less
negative space.

## PR 3 — `install-walkthrough` (→ watched-indicators)

`/install`: numbered iOS walkthrough (Safari → Share → Add to Home Screen → Add → open &
sign in) with inline-SVG mockups standing in for screenshots (swap later), plus an
Android note. The iOS install banner links to it; Chromium keeps the native prompt.
