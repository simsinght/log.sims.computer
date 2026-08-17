# UX round 3 — post-hosting feedback

Feedback from Sim's first day using tvlog on the phone (2026-08-16), after the v2
stack shipped and the app went live at tvlog.sims.computer:

```
remove top right sign in. prompt pwa install
jump to release date of ep
catch up — add all other eps up to that date (backfill)
swipe down to dismiss mobile log tray
ep title under show, remove "Next"
```

Two stacked PRs, low-hanging fruit before the appview gets thicker.

## PR 1 — `ux-polish` (→ main)

1. **No top-right "Sign in" when logged out.** The landing already has the big
   Sign in button; /search, /watchlist, /settings logged-out prompts have their
   own. `AppChrome` renders nothing top-right when there is no session.
2. **PWA install prompt.** `InstallPrompt` client component, rendered from
   `AppChrome` for both signed-in and signed-out visitors. Hidden when already
   standalone or previously dismissed (`localStorage tvlog.installPromptDismissed`).
   Chromium: shown only after `beforeinstallprompt` fires, with an **Install**
   button that calls `prompt()`. iOS Safari: shown with "Tap Share, then Add to
   Home Screen" instructions (no install API exists). Otherwise nothing renders —
   in particular the verify collector (Chromium, non-iOS UA, no install event)
   should never see it; that is correct, not a failure. Bottom-anchored card,
   safe-area aware, sits above the search FAB when signed in.
   Rationale: iOS standalone PWAs get their own cookie jar, so nudging install
   *before* sign-in avoids "I signed in but the home-screen app is logged out".
3. **Watching card layout.** Drop the "Next · S<n>E<m>" line. Card body:
   show title → **episode title** (single line, truncated) → bottom row with a
   small `S<n>E<m>` label and the round checkmark log button (aria-label
   `Log S<n>E<m>` unchanged).
4. **Swipe down to dismiss the log sheet** on phone widths. Drag from the handle /
   header (or from anywhere when the content is scrolled to top) translates the
   sheet with the finger; release past ~90px or a quick flick closes it,
   otherwise it snaps back. Wheel-picker columns and text inputs are never
   hijacked. Backdrop tap, ×, and Escape still close it. Desktop dialog untouched.
5. **Jump to the episode's air date.** `LogTarget.airDate` (from TMDB
   `air_date`, populated from both the Watching card and the show page). With
   "Other" selected and an aired air date known, a small **"Use air date"**
   button under the wheel picker sets the picked date to that day (local noon)
   and re-centers all three wheel columns.

## PR 2 — `catch-up-backfill` (→ ux-polish)

**Catch up.** When logging S<n>E<m> that isn't the first episode, the sheet
offers a "Catch up" toggle: also log every earlier aired episode (season ≥ 1,
before S<n>E<m>) that the account hasn't watched yet, at the same watch date
(each preceding episode one second earlier so the diary keeps episode order).
Server-side `POST /api/log/catch-up` computes the plan from the account's
listItem `watchedEpisodes` + TMDB season data, supports `dryRun` for the
sheet's live count, writes watch records in `applyWrites` batches, and merges
all episodes into the listItem in one `putRecord`. Home "Watching" then shows
the correct next episode.
