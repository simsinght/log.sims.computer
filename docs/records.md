# Record model

How watch history is stored in the user's PDS. Interoperates with [Popfeed](https://popfeed.social); shapes were confirmed against live Popfeed repos, not just vendored lexicons (see SPEC.md → Lexicons).

```mermaid
flowchart TB
  subgraph repo ["Records in the user's PDS repo"]
    LIST["social.popfeed.feed.list<br/>watched_movies · currently_watching_tv_shows · watched_tv_shows"]
    ITEM["social.popfeed.feed.listItem — one per work<br/>identifiers (tmdbId/imdbId) · display fields (posterUrl, genres, credits)<br/>watchedEpisodes for TV"]
    WATCH["computer.sims.log.watch — one per play (the diary layer)<br/>watchedAt · tags · note · rewatch · season/episode"]
  end
  ITEM -->|listUri| LIST
  WATCH -->|"subject (strongRef)<br/>+ denormalized tmdbId"| ITEM
```

## Rules

- Anything Popfeed's lexicon can express lives in Popfeed records; `computer.sims.log.watch` adds only what it can't (per-watch tags and notes).
- Watch status is **list membership** — there is no status field on listItems. Movies land in `watched_movies`; shows logged per-episode sit in `currently_watching_tv_shows` until fully watched.
- Records store ids and Popfeed display fields, never other resolved metadata; titles are resolved via TMDB at read time.
- One listItem per work (upserted on `identifiers.tmdbId`); one watch record per play — rewatches are additional watch records, and TV episode plays append to the listItem's `watchedEpisodes`.

## Lexicon sources

Vendored copies live in `lexicons/`. `social.popfeed.feed.*` shapes were verified against the Popfeed developer's live repo (2026-07-25) after the vendored snapshot proved stale — notable divergences: no status/startedAt/completedAt fields, TV identified by `tmdbId` (not `tmdbTvSeriesId`), media-specific list types. Popfeed also has `social.popfeed.feed.review` (integer rating 1–10) — not yet adopted; ratings are out of scope for now.
