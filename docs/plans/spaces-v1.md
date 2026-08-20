# Spaces v1: tvlog learns permissioned data

*Direction set 2026-08-19. Authoritative plan for the next leg. Context: a
self-hosted PDS running the permissioned-data reference branch (atproto PR
#5187 pinned @ bddc99fb) is LIVE at `pds.sims.computer` (invite-only, Container
Manager project on nimbus, data at /volume1/docker/pds). The full space round
trip — member-list space, multi-writer, delegation→credential→DPoP cross-reads
— was proven against it on 2026-08-17; `scripts/space-probe.mjs` in this repo
is the working reference client for that dance. The public tvlog app at
tvlog.sims.computer is unaffected by everything here and keeps working for
bsky.social users.*

## Goal

tvlog becomes the application layer for permissioned watch data, per the
audience taxonomy (see the table in the 2026-08-18 design discussion):

- **Shelf** (Popfeed lists/listItems): public repo — unchanged.
- **Diary** (`computer.sims.log.watch`: tags, notes, mood): the user's personal
  space — single writer, friends as members/readers.
- **Shared watchlist**: a multi-writer space (the protocol's club shape,
  already proven multi-writer on the live PDS).

## Slices, in order

1. **SDK evaluation (do first, it gates everything).** Bluesky published
   `0.0.0-spaces-alpha-*` builds of `@atproto/api` + `@atproto/xrpc`
   (dist-tag `alpha`, 2026-08-17) with `com.atproto.space` client methods.
   Evaluate against `scripts/space-probe.mjs`'s hand-rolled flow: does the
   alpha handle the delegation→credential→DPoP dance (incl. per-request
   proofs, the omit-`ath`-on-credential-exchange wrinkle)? If yes, build on
   it; if not, extract the probe's flow into a small client lib behind an
   interface (the handoff doc's seam #3).

2. **PDS-account login.** tvlog must sign in `pds.sims.computer` accounts:
   - Handle resolution: one `_atproto.<name>.pds.sims.computer` TXT record per
     account in Cloudflare (pure DNS — the deep-subdomain TLS trap doesn't
     apply to TXT). Records addable only after each account exists.
   - Verify the PDS's hosted OAuth signup door (oauth-provider-ui is in the
     build): can a new user create an account (invite code + password) mid
     OAuth flow from tvlog's login? If yes, wave-2 onboarding = a URL + a code,
     no Bluesky app. If not, fall back to Bluesky-app custom-PDS signup.
   - Sim signs up first (code ending sn2fy-nlfld, handle `sim`); Andi
     (k3fnj-jlurt, `andi`) and Mika (tfxyl-yj7n5, `mika`) are wave 2, AFTER
     the app gives their accounts something to do.

3. **Write-path seam.** One write interface taking a destination — public repo
   (`com.atproto.repo.*`) vs space (`com.atproto.space.*`). Private is a
   location, not a schema: same record types either way. URI handling isolated
   in one module (space URIs put the authority DID + `space` marker where a
   collection normally sits; `at://` vs `ats://` is still unsettled upstream).

4. **App-managed spaces.** On first sign-in from a spike-PDS account, tvlog
   ensures: the user's diary space (`simplespace.createSpace`, member-list
   policy) and — owner-initiated — a shared watchlist space with invited
   members. Membership management UI is minimal: add/remove by handle.

5. **Diary + shared watchlist read/write through spaces.** Diary entries from
   spike accounts write to the diary space instead of the public repo; the
   shared watchlist gets its multi-writer surface (any member adds; all see).
   Reads use the credential flow with short-lived credential caching (~2h TTL
   minted per space; cache in the session, refresh on 401).

## Constraints & known sharp edges

- Spaces don't validate app lexicons (`validationStatus: "unknown"`) — client
  discipline only.
- `space.createRecord` returns no commit/rev; sync/oplog machinery
  (`getLatestCommit`, `listRepoOps`, LtHash verification) is deliberately OUT
  of scope for v1 — the app trusts its own host. The syncer/appview is the
  next leg after this one.
- Member removal only bites at credential expiry (~2h) — upstream-acknowledged;
  don't build UI that promises instant revocation.
- The spike PDS is a WIP branch: all accounts/spaces on it are disposable, and
  nothing of Sim's real identity moves there (real DID now carries a self-held
  rotation key at priority 0 — that work is done and separate).
- Aviator verify: previews CAN reach pds.sims.computer (it's public), so
  verify runs need spike-PDS test creds in the preview config before space
  slices get browser-verified; until then, verify covers the public-app
  behavior and space work is verified by script/manual evidence.

## Process

- Worktrees live in `~/workspace/wt-log/<branch>` (Sim's convention — never
  work in the main checkout; the FE session may resume in parallel).
- Same stacked-PR + spec-first (`aviator verify`) flow as ux-v2 where verify
  applies.
- Reference material: `scripts/space-probe.mjs` (working credential dance),
  the "Off the Record" artifact (deniable-commit explainer), memory files
  `project-log-sims-computer` + `atproto-tooling-2026`, and the branch clone
  (re-clone atproto PR #5187 @ bddc99fb when needed — scratchpad copies are
  session-temporary).
