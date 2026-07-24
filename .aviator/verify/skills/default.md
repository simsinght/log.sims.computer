# Verify skill: log.sims.computer

## What this app is

A personal movie & TV log on atproto (AT Protocol). Logging-first: diary entries with free-form tags matter more than ratings. Users authenticate with their atproto identity; records are written to their own PDS.

## Authenticating (do this first for any logged-in surface)

Navigate to `/api/auth/test-login`. If test credentials are configured in this environment (they are in preview), this establishes a session as a dedicated test account and redirects to `/`. Confirm success: the header (top-right) shows the handle `simtest.bsky.social` instead of a Sign in link.

- If `/api/auth/test-login` returns 404, test credentials are absent — verify only logged-out surfaces and note the limitation.
- **Never attempt the OAuth sign-in path** (`/login` → the primary handle form). It redirects off-origin to a PDS and requires human consent; off-origin traffic is invisible to you and the flow cannot complete. Checking that `/login` renders the form is all that's possible.
- The "app password" disclosure on `/login` posts same-origin and would work, but you don't have credential values — use `/api/auth/test-login` instead.
- Writing data while authenticated is safe and expected: everything lands in the throwaway test account's PDS, not a real user's.

## Surfaces

- `/login` — OAuth handle form (do not submit) plus an "app password" disclosure section.
- `GET /api/auth/session` — `{did, handle}` when authed, 401 otherwise. `POST /api/auth/logout` clears the session.

- `/` — identity/home page with a link to search.
- `/search` — TMDB-backed search. The input is debounced (~300ms): after typing, wait for the grid to update before judging results. Posters must load through `/_next/image?...` on this origin — a visible poster implies the same-origin rule held. Nonsense queries show a no-results state, not an error. A movie/TV/all filter toggle is present.
- `/api/healthz` — liveness, `{"ok": true}`.

## App-specific gotchas

- All API traffic is same-origin by design (TMDB is proxied server-side; the API key must never appear in the browser). If the browser calls api.themoviedb.org or image.tmdb.org directly, that is itself a failure worth reporting.
- The favicon is `/icon.svg` (linked in head); a 404 for `/favicon.ico` in the console would be a regression.

## For criteria authors (humans)

Phrase acceptance criteria as browser-observable behavior. Shell-command criteria ("npm run typecheck passes") are not analyzable by the browser collector and come back as errors.
