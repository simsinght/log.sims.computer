# Verify skill: log.sims.computer

## What this app is

A personal movie & TV log on atproto (AT Protocol). Logging-first: diary entries with free-form tags matter more than ratings. Authentication and PDS record-writing arrive in later slices; currently the app is a logged-out surface.

## Surfaces

- `/` — identity/home page with a link to search.
- `/search` — TMDB-backed search. The input is debounced (~300ms): after typing, wait for the grid to update before judging results. Posters must load through `/_next/image?...` on this origin — a visible poster implies the same-origin rule held. Nonsense queries show a no-results state, not an error. A movie/TV/all filter toggle is present.
- `/api/healthz` — liveness, `{"ok": true}`.

## App-specific gotchas

- All API traffic is same-origin by design (TMDB is proxied server-side; the API key must never appear in the browser). If the browser calls api.themoviedb.org or image.tmdb.org directly, that is itself a failure worth reporting.
- The favicon is `/icon.svg` (linked in head); a 404 for `/favicon.ico` in the console would be a regression.

## For criteria authors (humans)

Phrase acceptance criteria as browser-observable behavior. Shell-command criteria ("npm run typecheck passes") are not analyzable by the browser collector and come back as errors.
