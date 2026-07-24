# Spec

## Product

A Letterboxd-style personal log for movies **and TV**, backed by atproto records in the owner's existing Bluesky PDS. Single-user first (sim), but nothing should preclude other atproto users logging in later.

**Logging-first.** This is a diary, not a review site. Ratings and reviews exist but are secondary; the core loop is "I watched a thing, log it fast, tag it freely."

Core UX (Letterboxd-inspired):

- **Diary**: chronological log of watches; rewatches are first-class.
- **Tags on every log entry**: free-form and used indiscriminately — who-with, where, mood, whatever (e.g. `with-alex`, `at-cinema`). Tag pages aggregate entries. This is a hard requirement — it's the most-loved Letterboxd feature.
- **Watchlist / currently-watching / abandoned** status.
- **TV specifics**: per-season and per-episode progress tracking.
- Poster-grid browsing, TMDB-powered search and metadata.
- Ratings/notes: available, de-emphasized in the UI.

## Architecture

Follows the [Bookhive](https://github.com/nperez0111/bookhive) pattern:

- **Web app** (Next.js, TypeScript): UI + backend-for-frontend. Handles atproto OAuth via `@atproto/oauth-client-node` (confidential client, `client_metadata` JSON hosted at the public client_id URL, DPoP, session cookie for the browser). Writes records directly to the user's PDS.
- **Appview** (node worker): ingests the firehose via [Jetstream](https://docs.bsky.app/blog/jetstream) filtered to our collections, materializes into SQLite for feeds, tag pages, and stats. Rebuildable from PDS state at any time.
- **Metadata**: TMDB (api key via env). Cache metadata locally; records store only TMDB ids, never titles/posters.
- **Deploy**: Docker on a Synology NAS, behind Cloudflare at `log.sims.computer`.

## Lexicons

**Interop with Popfeed is a requirement**: the primary records are `social.popfeed.feed.*`, so this log is visible to/from [Popfeed](https://popfeed.social) natively. Popfeed is closed-source; our schema copy comes from [Bookhive's vendored snapshot](https://github.com/nperez0111/bookhive), so **before writing any records, inspect live `social.popfeed.feed.*` records from real users' PDSs** (com.atproto.repo.listRecords) to confirm current shapes. Precedent for third-party writers: the paperbnd KOReader plugin writes `social.popfeed.feed.listItem`.

Primary (Popfeed interop):

- **`social.popfeed.feed.listItem`** — one per tracked work: `identifiers` (tmdbId, tmdbTvSeriesId, imdbId, …), `creativeWorkType` (`movie` / `tv_show` / `tv_season` / `tv_episode`), `status` (`#finished` / `#in_progress` / `#backlog` / `#abandoned`), `listUri`, `title`, `addedAt` / `startedAt` / `completedAt`, `watchedEpisodes[{seasonNumber, episodeNumber, tmdbId}]`, poster/backdrop blobs.
- **`social.popfeed.feed.list`** — named lists (`name`, `listType`, `itemOrder[]` for ordering).

Companion namespace `computer.sims.log.*` (NSID authority = sims.computer, which we own) — only for what Popfeed's public schema can't express:

- **`computer.sims.log.watch`** — a diary entry, the logging-first heart of the app:
  - `subject`: strongRef to the `social.popfeed.feed.listItem` (plus denormalized tmdb id for resilience).
  - `watchedAt`: datetime; `rewatch`: boolean; optional `season` / `episode`.
  - `tags`: `string[]` — the indiscriminate Letterboxd-style tags.
  - `note`: optional short text.

Design rule: anything Popfeed's lexicon *can* express goes in Popfeed records (status changes, episode progress, completion dates); `computer.sims.log.watch` only adds the per-watch diary/tag layer on top. If Popfeed's rating/review record surfaces later (not in the vendored copy), adopt it and drop any homegrown equivalent.

## Imports

Two sources, both one-shot CLI scripts writing records via the PDS API:

1. **Trakt** (years of TV + movie history, no VIP): JSON from [`traktexport`](https://pypi.org/project/traktexport/) — history, ratings, watchlist.
2. **Letterboxd** (movies, ~2025→now, including tags): official CSV export (diary.csv carries tags, ratings, rewatch flags).

Dedup rule: Letterboxd wins for movies in the overlap window; Trakt is authoritative for TV.

## Development workflow

Built via **Aviator runbooks/verify** on e2b cloud sandboxes, with a **custom preview image**: agents implement against this repo, changes land as PRs, and verify exercises the running app through preview. Verify's preview drives the app via Playwright against a public per-sandbox URL.

Preview contract (what the app must honor):

- `.aviator/scripts/preview-setup.sh` builds and starts the app on **port 3000**, backgrounded, and exits 0 once it responds. It receives `PREVIEW_URL` (the public https URL) and any configured secrets as env vars, runs as root with cwd = repo root.
- The app must respect `PREVIEW_URL` as its public base URL (atproto OAuth client metadata, redirect URIs) — preview URLs are real public HTTPS, so OAuth can genuinely work in preview.
- **Design rule: all browser-visible traffic stays same-origin.** Verify's Playwright collector drops cross-origin network traffic, so TMDB (and anything else) is proxied through the app's own API routes — which we want anyway to keep keys server-side.
- `TMDB_API_KEY` arrives via Aviator's account secret store, referenced in the verify preview config.

Verification auth (from the OAuth milestone onward): verify's collector cannot complete an interactive OAuth dance, so the app supports a **second auth path** — app-password session via `com.atproto.server.createSession` — used by a throwaway Bluesky **test account** whose credentials (`ATP_TEST_HANDLE`, `ATP_TEST_APP_PASSWORD`) live in the Aviator secret store and flow into preview via the config's `secrets:` list. A verify skill at `.aviator/verify/skills/` documents the login flow for the collector. During verification, records land in the test account's PDS — the owner's real account is only ever touched via OAuth at manual sign-off. The app-password path double-serves as the non-interactive auth for the importers.

`infra/e2b.Dockerfile` is the source of the custom template (pasted into Aviator's custom-template builder; its build pipeline forbids ADD/COPY, and Aviator injects claude-code + git into the image). The image is base environment only — the preview sandbox checks out the working branch itself, so the setup script does the install/build.

## Roadmap

1. Scaffold: Next.js app + lexicon JSON definitions + codegen.
2. atproto OAuth login (own account) + TMDB search.
3. Log a watch end-to-end (record in PDS) + diary view.
4. Tags + tag pages; ratings/reviews; watchlist.
5. Jetstream appview + stats.
6. Importers (Trakt JSON, Letterboxd CSV).
7. Deploy to nimbus @ log.sims.computer.
