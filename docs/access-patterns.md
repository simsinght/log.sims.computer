# Access patterns: who fetches what, and when

Audited 2026-08-15 against the UX v2 stack (`settings-import` @ dc49dac). This doc answers: per surface, what hits the user's PDS, what hits TMDB, and what is cached where.

## The two ground truths

**PDS reads are never cached in the app.** Every server render and every write re-lists records from the PDS over XRPC. The only PDS-derived cache is `listUriCache` in `src/lib/atproto/records.ts` — it memoizes list-*container* URIs, never items. If it vanished tomorrow the app would behave identically, just one round-trip slower per cold list.

**atproto has no query language.** `com.atproto.repo.listRecords` supports rkey-ordered pagination and nothing else — no filters, no server-side ranking. Every "shows in the currently-watching list", every "sort by watchedAt" is a full-collection pull followed by app-memory filter/sort. The cost of every such question scales linearly with library size, and none of it can be pushed to the PDS.

At the reference account's scale (5,541 watch records, ~650 listItems, ~76 currently watching), the listItem collection costs **7 sequential pages** (100/page, each awaiting the previous) each time any surface needs list state.

## TMDB caches

All in `src/lib/tmdb.ts`: module-level `Map`s (title, work detail, show detail, season episodes, episode ids). Single-process, **no TTL, no size bound, never invalidated** — acceptable because TMDB data is effectively immutable and growth is bounded by library size, but they are lost on every restart. `search()` is the exception: **not cached at all** — each debounced search keystroke is a live TMDB call.

## Per-surface costs

| Surface | PDS reads / request | TMDB (cold → warm) | Notes |
|---|---|---|---|
| Landing (logged out) | 0 | 0 | cookie read only |
| Home (signed in) | **9** (7-page listItem scan + 2 separate 1-page watch reads) | 24–48 season + ≤100 title → **0** | scans are the latency floor; `getWatching` and `buildDiary` each do their own `listWatches` |
| Show page | **7** (full listItem scan to resolve ONE show's state) | 1 → 0 | seasons lazy-load client-side, cached |
| Search | 0 | 1 per debounced query, **uncached** | repeated/backspaced queries re-hit TMDB |
| Watchlist page | **7** (full scan, filtered) | 0 | display fields denormalized on records |
| Settings | 0 | 0 | renders from session cookie by design |
| Log a watch | **~7–8 + 2–3 writes** | 1–2 → 0 | full listItem scan on every episode logged |
| Watchlist add/remove | **7 + 1–2 writes** | 0–1 | full scan per toggle |
| Import (read side) | 3 full scans — the watch scan is **56 pages** | prefetch at concurrency 4 | importer's own `listAllRecords` caps at 500 pages |

## The latent bug worth knowing about

The app-path `listAllRecords` (`src/lib/atproto/records.ts`) caps at **20 pages = 2,000 records**; the importer's copy caps at 500. At ~10× current library size (~6,500 listItems), the app path **silently truncates**: watchlist, currently-watching, and show-state lookups start returning wrong answers with no error, while the importer keeps working. Any fix for the scan cost below also retires this.

## Where this goes next

In order of leverage:

1. **Per-DID in-memory listItem cache with write-through invalidation.** The 7-page scan is paid on home, show pages, watchlist, every log, and every watchlist toggle; the deployment is single-instance (like the OAuth/TMDB caches already assume), so a cached parsed set patched on write turns ~7 serial round-trips into 0 on every hot path — and makes show-state lookup (today: full scan for one key) free.
2. **One shared, `watchedAt`-indexed diary read.** Fixes the double `listWatches` on home, and the real limitation of the current diary: it only ever sees the 100 highest-rkey watch records, then sorts within that window — recent watches whose rkey falls outside it are silently absent.
3. **Bound + TTL the TMDB caches; cache `search()`.** The only unbounded growth and the only fully-uncached TMDB path.

The end state was always the appview (`docs/architecture.md`: Jetstream → SQLite) — that is what turns these questions into indexed local queries and is the right move once a second instance or a larger library outgrows in-process caching. Items 1–2 are the cheap interim that keeps the no-database property.
