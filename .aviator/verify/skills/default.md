# Verify skill: tvlog

## What this app is

**tvlog** — a personal TV log on atproto (AT Protocol). TV-only: you search and log TV shows; there is no movie search or movie logging in the UI. Logging-first: diary entries with free-form tags matter more than ratings. Users authenticate with their atproto identity; records are written to their own PDS. (The domain is still log.sims.computer, but the app calls itself "tvlog" everywhere user-visible.)

## Authenticating (do this first for any logged-in surface)

Navigate to `/api/auth/test-login`. If test credentials are configured in this environment (they are in preview), this establishes a session as a dedicated test account and redirects to `/`. Confirm success: the top-right of the header shows a **round profile icon** (not a "Sign in" link), and a **round search button (FAB) appears fixed at the bottom-right** of the screen.

- If `/api/auth/test-login` returns 404, test credentials are absent — verify only logged-out surfaces and note the limitation.
- **Never attempt the OAuth sign-in path** (`/login` → the primary handle form). It redirects off-origin to a PDS and requires human consent; off-origin traffic is invisible to you and the flow cannot complete. Checking that `/login` renders the form is all that's possible.
- The "app password" disclosure on `/login` posts same-origin and would work, but you don't have credential values — use `/api/auth/test-login` instead.
- Writing data while authenticated is safe and expected: everything lands in the throwaway test account's PDS, not a real user's.

## Surfaces

- `/` — **logged out**: the landing page — the "tvlog" wordmark, the tagline "a personal TV log", and a prominent "Sign in" button linking to `/login`. There is **no search access when logged out** (search uses a personal TMDB key). **Signed in**: the **diary** — watch entries grouped by day, newest first, each with title, optional season/episode, tag chips, optional note, and a rewatch marker. (Older imported movie entries may still appear in the diary and should render fine; they just can't be created from the UI.)
- **Header (signed in)** — top-right is a single round **profile icon** (aria-label "Account menu"). Clicking it opens a small popover menu containing a **"Log out"** button. There is no visible handle/username and no "Log a watch" button anywhere.
- **Search FAB (signed in)** — a round floating action button fixed at the **bottom-right** (aria-label "Search") with a magnifying-glass icon. It is the only entry point to search; tapping it navigates to `/search`.
- `/search` — **signed in only**. If visited while logged out, it shows a "Sign in to search" prompt with a Sign in link rather than a search box. When signed in: a TMDB-backed **TV-only** search. The input is debounced (~300ms): after typing, wait for the grid to update before judging results. Posters must load through `/_next/image?...` on this origin — a visible poster implies the same-origin rule held. Nonsense queries show a no-results state, not an error. There is **no movie/TV filter toggle** (results are always TV shows). Each result card has a "Log" button opening a dialog (watched date, optional season/episode, free-form tags, note, rewatch) that writes records to the test account's PDS — logging entries during verification is safe and expected.
- **Tag chips link to `/tags/<tag>`, which is not implemented yet** — it 404s by design in this slice. Don't click tag chips while judging console cleanliness, and don't report the 404 as a failure.
- `GET /api/auth/session` — always 200: `{authenticated: true, did, handle}` or `{authenticated: false}`. (Deliberately not a 401 — a 401 on this probe pollutes the browser console on every logged-out page load.) `POST /api/auth/logout` clears the session.
- `/api/healthz` — liveness, `{"ok": true}`. `/api/diary`, `/api/log`, `/api/tmdb/title` back the diary and logging flows. `/api/tmdb/search` returns TV results only.

## App-specific gotchas

- All API traffic is same-origin by design (TMDB is proxied server-side; the API key must never appear in the browser). If the browser calls api.themoviedb.org or image.tmdb.org directly, that is itself a failure worth reporting.
- The favicon is `/icon.svg` (linked in head); a 404 for `/favicon.ico` in the console would be a regression.
- Target device is a phone: surfaces are verified at a phone viewport. Touch targets (profile icon, FAB, buttons) should be comfortably tappable.

## For criteria authors (humans)

Phrase acceptance criteria as browser-observable behavior. Shell-command criteria ("npm run typecheck passes") are not analyzable by the browser collector and come back as errors.
