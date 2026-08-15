# UX v2: tvlog — mobile-first TV logging

*Direction set 2026-08-15 from Sim's hands-on feedback (personal account on an e2b preview). This plan is the source of truth for the next PR stack. Verify now supports setting the preview screen size — verification for this stack runs at a phone viewport, since the target use case is Sim's phone.*

## Product reframe

- **Name: “tvlog”** — the wordmark/site name everywhere. (Domain stays log.sims.computer.)
- **TV-only.** Remove all movie UX: no movie search, no movie logging surfaces. Movies stay in Letterboxd. The record library keeps movie support (import/history data exists and stays valid) — this is a UI-layer restriction, not a data one.
- Logged-out landing: “a personal TV log”, prominent sign-in, **no search** (search uses the personal TMDB key, logged-in only).

## Surfaces

**Home (signed in) — not the full diary.** Show the *latest shows being watched*: cards for shows in progress, each with the **next unwatched episode ready to log** (compute next episode from watchedEpisodes + TMDB season data). The primary action in the whole app is “hit Just Finished on the show I'm watching.”

**Show page** (`/show/<tmdbId>`) — search results open this page (no direct Log button on result cards). Lists seasons → episodes; log an episode from its row. **The log UI itself has no episode picker** — the episode is always chosen by context (next-episode card, or the episode row you tapped).

**Log sheet** — bottom sheet on mobile, dialog on desktop. Two options up front: **“Just Finished” | “Other”**. “Other” opens a **rotary/wheel date picker** (`Aug | 12 | 2026` columns, iOS-style — reference screenshot: `date-picker-reference.png` in this directory), with the resolved weekday shown as the date changes (à la Letterboxd: “Wednesday, August 12, 2026”). **No calendar view.** Tags/note stay available but secondary.

**Header** — replace the handle + “Log out” text with a **profile icon** opening a small popover: Settings, Log out. Username appears nowhere else (currently duplicated under the diary heading — remove). **Remove the “Log a watch” button.**

**Floating search FAB** — bottom-right, Apple-style. The two entry actions are: log the next episode of a current show (home cards) or search up a new show (FAB).

**Settings page** — home for account bits and the **import flow**: a new account sees an obvious “import your Trakt history” path (settings + probably an empty-state CTA on home). Import via the web UI (upload the export zip; server runs the import against the signed-in session) — must survive the multi-hour rate-limited reality: background progress, resumable, status visible.

**Watchlist** — first-class feature and a primary use case. Trakt dump HAS watchlist data (`lists-watchlist.json`, 181 items — parsed and counted by the importer, currently skipped). Needs: record mapping (Popfeed watchlist list-type — confirm the TV variant against live Popfeed repos; reference account only showed `movie_watchlist`), add-to-watchlist from show page/search, a watchlist view, and importer support.

**PWA** — manifest, icons, installability; the point at which Sim actually uses it on his phone. After this stack ships: deploy to nimbus (Container Manager + Cloudflare) — separate effort.

## Proposed stack (order matters)

1. **tv-rebrand** — tvlog naming, TV-only stripping, logged-out landing, profile-icon popover, search FAB, remove Log-a-watch button + duplicate username.
2. **show-pages** — show page with seasons/episodes, search → show page, remove episode picker from logging.
3. **log-sheet** — bottom sheet/dialog, Just Finished | Other, wheel date picker with weekday display.
4. **home-watching** — currently-watching cards with next-episode-to-log.
5. **watchlist** — records + UI + importer mapping.
6. **settings-import** — settings page, web upload import with background progress.
7. **pwa** — manifest/icons/SW + mobile polish pass.

## Process notes

- Aviator interaction moved **from MCP to the CLI** — discover with `aviator --help` before the first submission; same spec-first-then-PR ordering unless the CLI changes the game.
- Verify: set preview screen size to a phone viewport for this stack; update `.aviator/verify/skills/default.md` for the new surfaces (FAB, sheet, show pages, profile popover) as they land.
- Diagrams: keep `docs/` truthful per slice (architecture overview gains nothing here; a `docs/ux.md` surface map may be worth adding with slice 1).
