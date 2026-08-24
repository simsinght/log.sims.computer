# Watch parties v1 (spaces-v2): design groundwork

*Research brief, 2026-08-23. Read-only investigation — no code changed; this is
the only file written. Goal: work out the lexicon + record + invite-link + scope
story for tvlog's EVENTS tab — watch parties built on permissioned spaces
(`docs/plans/spaces-v1.md`, `docs/plans/spaces-oauth-scopes.md`,
`docs/access-patterns.md` are the upstream context).*

A watch party = a multi-writer permissioned space: the host creates the space,
invitees are added as members and RSVP, members comment among themselves. It
generalizes the shared-watchlist shape already proven multi-writer on
`pds.sims.computer`, adding an event (time/place) and a per-party comment thread.

---

## TL;DR (the five answers)

1. **`atmo.rsvp` is an app, not a namespace.** It is an open-source event
   viewer/creator ("Your stuff stays yours. Events live on your account, not
   ours. atmo.rsvp is just a view.") that reads and writes the **community
   calendar lexicons** (`community.lexicon.calendar.*`) — the same records Smoke
   Signal produces. There is no `atmo.rsvp` lexicon to adopt; the thing worth
   adopting sits under `community.lexicon.calendar`.

2. **The event/RSVP standard is `community.lexicon.calendar`.** Originally minted
   by Smoke Signal as `events.smokesignal.calendar.*`, the core event/rsvp/
   location types were donated to `lexicon-community` and now live under the
   `community.lexicon` NSID. Full record shapes are in this doc. All of them are
   **built for public repos** — they predate spaces and have **no space-aware
   variant**. Because spaces don't validate lexicons (`validationStatus:
   "unknown"`), the shapes drop into a space unchanged; interop is free.

3. **Recommendation: hybrid.** Reuse `community.lexicon.calendar.event` and
   `community.lexicon.calendar.rsvp` **verbatim** as the party's event + RSVP
   records inside the space, and add **two tvlog sidecar record types** for what
   the community shapes can't express: `computer.sims.log.watchParty` (the
   show/episode reference via `tmdbId`, spoiler policy) and
   `computer.sims.log.partyComment` (spoiler-scoped, threaded comments). Reasoning
   in §2.

4. **The comment model is Frontpage's.** `content` + `createdAt` + `post` (root
   strongRef) + optional `parent` (strongRef) — flat by default, threaded when
   `parent` is set. This is the simplest shape that fits spaces' addressing. tvlog
   adds one field: `spoilerFor` (episode boundary), see §3.

5. **One new space type, one permission-set delta.** Add space type
   `computer.sims.log.party` (skey = per-party tid, `authority: "*"`) carrying the
   four collections above, plus an `include:` entry. Detailed delta in §5.

---

## 1. Lexicon landscape findings (with evidence)

### `atmo.rsvp`

An application, open-source, Bluesky sign-in, framed explicitly as a *view* over
records that live on the user's own account — "Works across apps / See events
from any app on the open social web." It does not define its own event schema; it
interoperates over the community calendar lexicons (the same records Smoke Signal
writes). So the owner's "atmo.rsvp" is a pointer to the **community calendar
lexicon ecosystem**, not a namespace to reuse.
Evidence: <https://atmo.rsvp/>, and the AT Protocol "atmospheric website" post
which shows embedding "events created with Smoke Signals or atmo.rsvp"
(<https://atproto.com/blog/atmospheric-website>).

### Smoke Signal → Lexicon Community

Smoke Signal (Nick Gerakines, smokesignal.events) is the original atproto events
+ RSVP app. It first minted `events.smokesignal.calendar.*`; the community then
formed **Lexicon Community** and took ownership of the event/rsvp/location types,
which migrated to the `community.lexicon` NSID. Newer records reference
`community.lexicon.calendar.rsvp#going` etc.
Evidence: "Community Lexicons" (<https://blog.smokesignal.events/posts/3lthgjbbhyk2c-community-lexicons>),
lexicon source <https://github.com/SmokeSignal-Events/lexicon>, community repo
<https://github.com/lexicon-community/lexicon>.

Adoption: Smoke Signal, atmo.rsvp, and multiple local atproto community sites
(atproto.boston, seattle.atprotocol.community) all run on these records. This is
the closest thing to a de-facto event standard in the atmosphere today.
Acudo (<https://blog.smokesignal.events/posts/3lwunvmen5k2b-...>) layers
cryptographically **signed** RSVPs (attestations) on top for ticketing — not
needed for a friends-level watch party, noted for completeness.

### `community.lexicon.calendar.event` (record, key `tid`)

Required: `createdAt`, `name`. Optional: `description`, `startsAt`, `endsAt`,
`mode` (`#inperson` default / `#virtual` / `#hybrid`), `status` (`#scheduled`
default / `#planned` / `#cancelled` / `#postponed` / `#rescheduled`), `locations`
(array; union of `#uri`, `location.address`, `location.fsq`, `location.geo`,
`location.hthree`), `uris` (array of `{uri, name?}`), `rsvpExpected` (bool).

Fit for a watch party: excellent. "A Love Island party at a bar" → `mode:
inperson` + `location.address` with `name: "The Wheatsheaf"`. "Prestige-TV night
at someone's media setup" → `mode: inperson` + address, or `mode: virtual` with a
`uris` entry for a remote co-watch. `status` covers cancel/postpone. The *only*
watch-party concept it can't hold is **which show/episode** — that's the sidecar
(§2).

### `community.lexicon.calendar.rsvp` (record, key `tid`)

Required: `subject` (`com.atproto.repo.strongRef` → the event record), `status`
(`#going` default / `#interested` / `#notgoing`). Minimal and exactly right; the
strongRef target is the event, so an RSVP in a member's own space-repo points at
the host's event record by URI+CID.

### `community.lexicon.location.*` (objects, embedded — not records)

- `.address`: required `country` (ISO-3166); optional `postalCode`, `region`,
  `locality`, `street`, `name`. The `name` field carries the venue vibe ("The
  Wheatsheaf", "Andi's living room").
- `.geo`: `latitude`/`longitude` (strings) + optional `altitude`, `name`.
- `.fsq` (Foursquare venue id) and `.hthree` (H3 cell) also exist — not needed.

### Comment lexicons surveyed

- **Frontpage** `fyi.unravel.frontpage.comment` (record, key `tid`): `content`
  (maxGraphemes 10000), `createdAt`, `post` (strongRef → root), optional `parent`
  (strongRef). Flat-or-threaded by presence of `parent`. Clean, minimal, exactly
  the spaces addressing model. Source:
  <https://github.com/likeandscribe/frontpage/blob/main/lexicons/fyi/unravel/frontpage/comment.json>.
- **`app.bsky.feed.post` reply refs**: `reply: { root, parent }` (both strongRef)
  — same idea, heavier record (it's a full post). Overkill here.
- **Snorre.io / Bluesky-as-comments** pattern: reuse `app.bsky.feed.post` — public
  only, not applicable inside a space.

Frontpage's is the shape to copy.

---

## 2. Interop tradeoff → recommendation: **hybrid**

The choice is between (a) reuse `community.lexicon.calendar.*` verbatim in-space,
(b) mint bespoke `computer.sims.log.party/.rsvp/.comment`, or (c) hybrid.

What reuse actually buys, and when:

- Interop with existing tooling/appviews and cross-posting public **only pays off
  if the record is public**. Inside a permissioned space, no external appview can
  read it anyway (the discoverability gap + the credential dance mean only members
  with a space credential read it). So the interop benefit is **latent** — it
  materializes only if a party is later cross-posted to the public repo, or if
  spaces ever federate to third-party appviews.
- But the cost of reuse is essentially **zero**: spaces don't validate lexicons,
  the community event shape is an outstanding fit for a watch party already, and
  the `include:` authority guard checks only the space *type* NSID, not the
  collection NSIDs — so a `computer.sims.log.party` space can legally carry
  `community.lexicon.calendar.*` collections (confirmed in
  `docs/plans/spaces-oauth-scopes.md` §Q4, "only the space `type` is
  authority-checked").

So there is no reason to *not* reuse the community event + rsvp shapes, and one
good reason to do it (a free, standards-aligned event record that a future
"promote this party to a public event" feature gets for nothing). The only gap is
tvlog-specific data, which a sidecar covers.

**Recommendation — hybrid:**

| Concern | Record | Namespace |
|---|---|---|
| When/where the party is | `community.lexicon.calendar.event` | community (verbatim) |
| Who's coming | `community.lexicon.calendar.rsvp` | community (verbatim) |
| What we're watching (tmdbId, episode, spoiler policy) | `computer.sims.log.watchParty` | tvlog sidecar |
| Talking among members | `computer.sims.log.partyComment` | tvlog sidecar |

The `watchParty` sidecar strong-refs the community event, so the event stays a
clean, portable, cross-postable record while tvlog's show-awareness (the `tmdbId`
convention the whole app already keys on, per `records.ts`) lives beside it. This
beats option (b) — bespoke everything throws away the free event interop for no
gain — and beats pure (a), which can't express which episode the party is for or
scope spoilers.

Naming note: the host's space is one **party = one space**, so a host can run many
parties over time (unlike the single fixed diary/watchlist spaces). skey is
per-party (a tid), not a fixed literal.

---

## 3. Proposed record shapes (JSON sketches)

Records inside the space are addressed `<spaceUri>/<writer-did>/<collection>/<rkey>`.
Who writes what:

- **Host** writes the `event` and the `watchParty` sidecar (one each, into the
  host's own space-repo).
- **Each member** writes their own `rsvp` and their own `partyComment`s (into
  their own space-repo — the multi-writer shape).

### `community.lexicon.calendar.event` — used verbatim (host writes)

```json
{
  "$type": "community.lexicon.calendar.event",
  "name": "Love Island finale @ The Wheatsheaf",
  "description": "Season finale watch-along. Get there by 8.",
  "createdAt": "2026-08-23T18:00:00Z",
  "startsAt": "2026-08-29T20:00:00Z",
  "mode": "community.lexicon.calendar.event#inperson",
  "status": "community.lexicon.calendar.event#scheduled",
  "locations": [
    {
      "$type": "community.lexicon.location.address",
      "country": "GB",
      "locality": "London",
      "name": "The Wheatsheaf"
    }
  ],
  "rsvpExpected": true
}
```

### `computer.sims.log.watchParty` — tvlog sidecar (host writes, rkey = event's tid)

```json
{
  "$type": "computer.sims.log.watchParty",
  "event": { "uri": "ats://…/community.lexicon.calendar.event/3l…", "cid": "bafy…" },
  "media": {
    "mediaType": "tv",
    "tmdbId": 220848,
    "title": "Love Island UK",
    "season": 11,
    "episode": 58
  },
  "spoilerPolicy": "upToEpisode",
  "createdAt": "2026-08-23T18:00:00Z"
}
```

- `event` strong-refs the community event (kept separate so the event stays
  portable/cross-postable).
- `media` mirrors the `tmdbId`/`mediaType` convention used everywhere in
  `records.ts`; `season`/`episode` optional (a movie or whole-show party omits
  them).
- `spoilerPolicy`: `none` | `upToEpisode` | `strict` — drives comment gating
  (below). Keep the enum tiny for v1.

### `computer.sims.log.partyComment` — tvlog sidecar (each member writes)

```json
{
  "$type": "computer.sims.log.partyComment",
  "party": { "uri": "ats://…/computer.sims.log.watchParty/3l…", "cid": "bafy…" },
  "content": "Ekin-Su robbed",
  "parent": { "uri": "ats://…/computer.sims.log.partyComment/3l…", "cid": "bafy…" },
  "spoilerFor": { "season": 11, "episode": 58 },
  "createdAt": "2026-08-29T21:15:00Z"
}
```

- `party` = root ref (Frontpage's `post`); `parent` optional (Frontpage's
  `parent`) → flat by default, threaded when set.
- `spoilerFor` optional episode boundary; with `watchParty.spoilerPolicy`, the app
  can blur comments ahead of a reader's own progress. v1 can ship the field and
  render blur later — it's cheap to write now, expensive to retrofit.
- `content` cap: mirror Frontpage (maxGraphemes 10000).

These `computer.sims.log.*` records ship **without lexicon files** for validation
(spaces don't validate — same as `computer.sims.log.watchlistItem` today, per
`records.ts`), but the space *type* lexicon must still be published for the
consent screen (§5).

---

## 4. Invite-link flow (sequence)

Member-add (access) and the invite link (discovery) are two separate channels;
they **must be sequenced** — the link is useless until the host has added the
invitee, because a non-member's `getSpace` returns RepoNotFound (tvlog's
`isSpaceMissing` collapses "missing" and "no access" into one signal, per
`spaces.ts`).

URL shape (path + query, so the app reads it client-side):

```
https://tvlog.sims.computer/party/join?space=<url-encoded spaceUri>&inviter=<did>
```

`space` carries the space URI (the out-of-band discovery datum — the protocol
gives no other way for an invitee to learn it; see the discourse thread on the
[space discoverability gap](https://discourse.atmosphere.community/t/discoverability-of-spaces-at-the-protocol-level-for-permissioned-spaces/1072)).
`inviter` is optional attribution only.

Sequence:

1. **Host** creates the party space (`simplespace.createSpace`, type
   `computer.sims.log.party`, skey = a fresh tid), writes the `event` +
   `watchParty` records.
2. **Host** adds each invitee as a member (`simplespace.addMember` by handle/DID —
   the existing `addSpaceMember` path). *This is what grants access.* Do it before
   or at the same time as sharing the link.
3. **Host** shares the invite link (any channel — DM, text, QR at the bar).
4. **Invitee opens the link:**
   - *Signed-out* → app stores the invite (space URI + inviter) in login state,
     sends them through login, resumes on return.
   - *Signed-in, spaces-capable* → app calls `simplespace.getSpace(space)`.
     - Success (host added them in step 2) → show the party (event, who's in),
       prompt **RSVP**. The RSVP write is the invitee's **first write** into the
       space → makes the space permanently discoverable to them
       (`listSpaces` will now return it — that's the discoverability mechanic). A
       `partyComment` would work equally as a first write, but RSVP is the natural
       one.
     - RepoNotFound → host hasn't added them yet: show "Ask the host to add you"
       (don't imply the link is broken).
   - *Signed-in, not spaces-capable* (bsky.social) → graceful explainer: "Watch
     parties need a spaces-enabled account" (mirror the capability gating already
     in `initSpacesForSession`/`resolveRouting`). No write attempted.

Note the ordering dependency for wave-2 onboarding: an invitee on bsky.social
can't be added at all (not spaces-capable) — parties are between
`pds.sims.computer` accounts until/unless spaces reach mainline.

---

## 5. Permission-set delta (added to `computer.sims.log.permissions`)

Parties differ from diary/watchlist in two ways that shape the scope: **skey
varies per party** (many parties per host) and the space carries **community
collections** alongside tvlog ones.

**New space permission entry** (append to the `permissions` array in
`computer.sims.log.permissions`, alongside the existing diary + watchlist
entries):

```json
{
  "type": "permission",
  "resource": "space",
  "spaceType": "computer.sims.log.party",
  "authority": "*",
  "skey": "*",
  "collection": [
    "community.lexicon.calendar.event",
    "community.lexicon.calendar.rsvp",
    "computer.sims.log.watchParty",
    "computer.sims.log.partyComment"
  ],
  "action": ["read", "create", "update", "delete"],
  "manage": ["create", "update", "delete"]
}
```

- `authority: "*"` — required: members read/write parties **owned by other
  members** (a party you were invited to), exactly as the watchlist entry argues
  in `spaces-oauth-scopes.md` §Q4. `self` would break joining others' parties.
- `skey: "*"` — a host owns many party spaces (one per party), each a distinct
  tid; unlike diary/watchlist's fixed literal skey.
- `collection` mixes `community.lexicon.*` and `computer.sims.log.*` — legal
  because the `include:` authority guard checks only the space *type*
  (`computer.sims.log.party`, under the `computer.sims.log` group prefix), not the
  collection NSIDs (`spaces-oauth-scopes.md` §Q4).
- `manage` all three — safe: `assertSpaceOwner` still gates member add/remove per
  space, so holding the grant doesn't let a member manage someone else's party.

**New space *type* lexicon** `computer.sims.log.party` (must be published to the
authority DID — the consent screen resolves every space type via
`getSpacesFromScope`, per `spaces-oauth-scopes.md` §Q2):

```json
{
  "lexicon": 1,
  "id": "computer.sims.log.party",
  "defs": {
    "main": {
      "type": "space",
      "key": "tid",
      "name": "tvlog watch party",
      "description": "A watch party — who's coming, what you're watching, and the chat.",
      "collections": [
        "community.lexicon.calendar.event",
        "community.lexicon.calendar.rsvp",
        "computer.sims.log.watchParty",
        "computer.sims.log.partyComment"
      ]
    }
  }
}
```

- `key: "tid"` (not `literal:`) — because each party gets a fresh skey.
  **Confirm** the alpha `space` lexicon accepts `key: "tid"`; diary/watchlist both
  use `literal:` and that's the only spelling exercised so far (open question).

The `include:computer.sims.log.permissions` scope token **does not change** — it
already pulls whatever the set contains; only the set's contents grow. No client-
metadata scope-string change is needed if the party permission is folded into the
existing permission set (the two-client routing from `spaces-oauth-scopes.md` §Q5
stands). Re-publish the permission-set record and the new party type lexicon
**before** any party login (an unresolvable set hard-fails authorization).

Publish delta (records to `did:plc:gqorgf2irpe5vy6osekgc3be`, collection
`com.atproto.lexicon.schema`):

- Update `computer.sims.log.permissions` (add the party entry).
- Add `computer.sims.log.party` (space type).
- The four collection lexicons do **not** need publishing for validation
  (spaces don't validate), and `community.lexicon.calendar.*` are resolvable
  already if ever needed — no action.

---

## 6. Slice breakdown (spec-first / verify-aware)

Ordered, each a stacked PR. "Browser-verifiable" = exercisable in the spaces
sandbox via the app UI with a `pds.sims.computer` account (needs spike-PDS creds
in the preview config — the `spaces-v1.md` caveat still applies); "script-
verified" = proven with a Node probe like `scripts/space-probe.mjs` where the UI
isn't there yet or verify previews can't hold two logged-in members.

1. **Lexicon + permission-set publish (gating, script-verified).** Author
   `computer.sims.log.party` space-type lexicon + party entry in the permission
   set; publish both records; confirm resolution via `sync.getRecord` and a
   consent-screen render. Blocks everything (unresolvable set hard-fails login).
   Verify: script (resolve the records) + one manual OAuth consent screenshot.

2. **Party space lifecycle + create-party form (browser-verifiable).** Extend
   `spaces.ts` with a party space def whose skey is a per-call tid (not a fixed
   literal) and a `createParty(agent, {event fields, media})` that createSpace →
   writes `event` + `watchParty`. Minimal create form on the new Events tab.
   Verify: browser (host creates a party, party appears in their own list).

3. **Invite link + join/RSVP (browser-verifiable, two accounts).** `/party/join`
   route implementing §4 (getSpace probe → RSVP write → discoverability);
   member-add reuses `addSpaceMember`. Verify: browser with two sandbox accounts
   (host adds member + shares link; member opens, RSVPs, party then shows for them
   via `listSpaces`). The two-member step may need script assist if the preview
   can't hold two sessions — script-verify the RSVP-makes-discoverable claim.

4. **Comments (browser-verifiable).** `partyComment` write + read across members
   (the cross-member read is the delegation→credential→DPoP dance already built
   for the shared watchlist — reuse `SpaceCredentialManager`). Flat render first;
   `parent` threading and `spoilerFor` blur can trail. Verify: browser (two
   members converse) + script for the cross-member credential read.

5. **Events tab IA + upcoming list (browser-verifiable).** See §7 for the source-
   of-truth question. Assemble the tab from: own parties (created, known by
   convention) + joined parties (`listSpaces` after first write) + pending invites
   (app-side cache, since a not-yet-RSVP'd invite is invisible to `listSpaces`).
   Verify: browser.

Slice 1 is the hard gate; 2–4 are the feature; 5 is assembly. 3 and 5 carry the
protocol-truth risk (discoverability timing), so weight script evidence there.

---

## 7. Tab / IA implications (brief)

The Events tab (a bottom-pane tab on mobile) minimally shows an **upcoming
parties** list. Sourcing it is constrained by the same `listSpaces`-only-returns-
written-to semantics that shape the whole design:

- **Parties you host** — known deterministically? No. Unlike the single fixed
  diary/watchlist, a host has *many* party spaces at varying tids, so there's no
  fixed URI to `getSpace`. The host **has** written to them (created the space +
  event), so `listSpaces` **does** return them, filtered to type
  `computer.sims.log.party`. So: `listSpaces` is the source for hosted parties.
- **Parties you joined** — `listSpaces` returns them **only after your first write
  (the RSVP)**. Pre-RSVP, they're invisible to the protocol.
- **Pending invites (added as member, not yet RSVP'd)** — invisible to
  `listSpaces`. Must be an **app-side cache**: when someone opens an invite link,
  cache {spaceUri, inviter, seenAt} so the tab can surface "invited, tap to RSVP"
  even before the discoverability-granting write. This is the one piece of state
  the protocol can't reconstruct.

So the tab = `listSpaces(type: party)` (hosted + joined, deduped by owner) ∪
app-cached pending invites. Visual design left to the FE session. Note this makes
`listSpaces` type-filtering a hard requirement — confirm the alpha
`com.atproto.space.listSpaces` supports a `type`/collection filter, else the app
filters client-side by parsing space URIs (open question).

---

## 8. Open questions / not confirmed

- ~~**`key: "tid"` on a `space` lexicon.**~~ **RESOLVED 2026-08-23** from the
  alpha branch's `com.atproto.simplespace.createSpace` lexicon: `skey` is
  optional, format `record-key`, and "If not provided, one will be
  auto-generated (TID)". Generated per-party skeys are first-class; the
  one-space-per-party design stands, no fallback needed. (Same source also
  shows a `publicPolicy` variant in the policy union — a future public watch
  party is a policy choice, not a redesign.)
- **`listSpaces` filtering.** The alpha's `listSpaces` accepts `type` and `did`
  params (seen in its handler), so server-side filter by space type exists —
  confirm the response's per-entry shape when implementing (entries carry `uri`;
  type is parseable from it regardless).
- **Cross-member comment read latency/scale.** Reading all members' `partyComment`
  records = one credential-flow sweep per member repo (like the watchlist's
  `spaceMemberDids` fan-out in `records.ts`). Fine at party scale (<~30 members);
  no appview, so no server-side thread assembly — flag if a party ever gets large.
- **Cross-posting a party public.** The hybrid keeps the community `event`
  portable, but actually promoting a space record to the public repo is a
  copy-write, not a move (different location). Not in v1; the shape choice keeps
  the door open.
- **Spoiler gating depth.** v1 writes `spoilerFor`/`spoilerPolicy` but rendering
  blur-by-reader-progress needs the reader's own watch state joined in — deferred;
  the fields are cheap to write now.
- **`atmo.rsvp` GitHub source not opened.** Confirmed it's an app over the
  community lexicons from its site + the atproto blog; did not read its repo to
  confirm it writes *no* private extension fields. Low risk — the community shapes
  are the interop surface either way.
</content>
</invoke>
