# Spaces OAuth scopes: design brief

*Research brief, 2026-08-22. Read-only investigation — no code changed. Goal:
work out the OAuth scope story tvlog needs to reach `com.atproto.space.*` /
`com.atproto.simplespace.*` on the spaces-alpha PDS, why `transition:generic`
can't, and the concrete migration.*

All package evidence is from the `alpha` dist-tag builds
(`0.0.0-spaces-alpha-20260818163953`) of `@atproto/oauth-scopes`,
`@atproto/oauth-provider`, `@atproto/pds`, and `@atproto/lex-resolver`, plus
`@atproto/oauth-client-node@0.4.9` and `@atproto/syntax` as installed in this
repo, and Bluesky's `bluesky-social/bulletin` (default branch `main`). File
paths below are package-relative inside those tarballs unless prefixed with the
repo path.

---

## TL;DR (the five answers)

1. **Scope grammar.** The alpha ships a real granular grammar in
   `@atproto/oauth-scopes`: `repo:`, `rpc:`, `blob:`, `account:`, `identity:`,
   a new `space:` resource permission, and `include:<nsid>` for
   lexicon-defined permission sets. `space:` **can** be written inline, but
   `include:` is the blessed route (bundles space + collections + actions +
   manage into one consent-displayable, lexicon-resolved unit). **`transition:generic`
   grants no space access at all** — it is explicitly overridden to grant
   nothing extra for spaces. That is exactly why the capability probe fails on
   an OAuth token and a plain full-access session works.

2. **Permission-set resolution.** A PDS resolves `include:computer.sims.log.permissions`
   by (a) DNS TXT lookup `_lexicon.log.sims.computer` → `did=<authority-did>`,
   (b) fetching `at://<did>/com.atproto.lexicon.schema/computer.sims.log.permissions`
   via `com.atproto.sync.getRecord` **with commit-signature verification**, (c)
   requiring `defs.main.type === "permission-set"`. Sim needs: one TXT record,
   plus `com.atproto.lexicon.schema` records (rkey = the NSID) published to the
   authority DID's repo. **A normal bsky.social account is fine** as the
   authority — the resolver only needs a signed, sync-fetchable record.

3. **Mainline compat.** `authorize()` in `oauth-client-node@0.4.9` **does**
   accept a per-call `scope` that overrides client-metadata scope
   (`oauth-client.js:106`) — but the AS enforces requested-⊆-declared
   (`client.js:221-230`), so per-authorization scope can only *narrow* the
   declared set, never exceed it. The alpha AS tolerates exotic *declared*
   scopes in client metadata (only requires `atproto`, no dupes). **bsky.social's
   deployed validator could not be confirmed** — treat "a single shared metadata
   doc carrying `include:`/`space:` tokens" as a live-app regression risk.

4. **Permission set contents.** Draft below. Two `space` entries (diary +
   watchlist), both `authority: "*"` (required for cross-member reads/writes in
   a social app), each with its collection, full record actions, and the manage
   ops. Plus the `space` *type* lexicons (needed for the consent screen) and, if
   spike accounts also write the public shelf, granular `repo:`/`blob:` for those.

5. **Migration.** Use **two OAuth clients** (two client-metadata URLs), routed
   by resolved PDS at login: the existing one stays `atproto transition:generic`
   for bsky.social (zero regression), a new one declares the spaces scope for
   `pds.sims.computer`. Publish lexicons + TXT **before** any spaces login (an
   unresolvable permission set hard-fails the authorization request).

---

## Q1 — The scope grammar

### The scope value types (`@atproto/oauth-scopes` alpha)

`atproto-oauth-scope.js` enumerates everything a scope string can hold:

- **Static values** (`STATIC_SCOPE_VALUES`): `atproto`, `transition:email`,
  `transition:generic`, `transition:chat.bsky`.
- **Resource permissions**, each a `Parser` with a prefix
  (`scopes/*-permission.js`): `account:`, `blob:`, `identity:`, `repo:`,
  `rpc:`, **`space:`**.
- **`include:`** (`scopes/include-scope.js`) — *not* a resource permission; it
  pulls permissions from a lexicon-defined permission set.

A scope string is space-delimited; `atproto` is mandatory (see Q3).

### The `space:` grammar (`scopes/space-permission.js`)

```
space:<type>?authority=<self|*|did>&skey=<*|rkey>&collection=<nsid|*>&action=<...>&manage=<...>
```

| param | positional | multiple | default | allowed |
|---|---|---|---|---|
| `type` | yes | no | — (required) | an NSID, or `*` |
| `authority` | no | no | `self` | `self`, `*`, or a DID |
| `skey` | no | no | `*` | `*`, or a valid record key |
| `collection` | no | **yes** | `[]` (empty = *no* write targets) | NSID(s), or `*` |
| `action` | no | **yes** | `read,create,update,delete` | `read_self`, `read`, `create`, `update`, `delete` |
| `manage` | no | **yes** | `[]` | `create`, `update`, `delete` |

Semantics from `SpacePermission.matches()` / `withResolvedAuthority()` /
`withDefaultCollections()`:

- `authority: "self"` is resolved to the granting user's DID **at token
  issuance** (`withResolvedAuthority`); an unresolved `self` matches nothing.
  `authority: "*"` matches any owner DID. This is *whose* spaces (by owner) the
  token may act on — see Q4.
- `read` implies `read_self`; reads are collection-independent (a `read`/`read_self`
  action ignores `collection`). Writes require the action **and** a matching
  `collection`.
- `manage` is a separate axis from `action` — it gates space/membership
  lifecycle, not records (see Q2 map).
- A bare `space:<type>` with no `collection` gets the type's declared
  collections filled in at issuance from the published `space` lexicon
  (`withDefaultCollections`, called by the provider's
  `LexiconManager.expandSpaceCollections`).

### Is `include:` the *only* route to space access? No — but it is the route.

`space:` parses and matches as a first-class scope, so you *can* put
`space:computer.sims.log.diary?authority=*&collection=computer.sims.log.watch&action=read,create,update,delete&manage=create,update,delete`
directly in the scope string. Two reasons `include:` is preferred anyway:

- It bundles multiple space types + collections + actions + manage into one
  lexicon document, which the consent screen renders as a named, human-readable
  unit (`permission-set.title`/`detail`).
- Either way you must publish the `space` *type* lexicons (the consent screen
  resolves them; Q2), so `include:` adds only one more record (the set itself)
  while giving you a single scope token to declare and request.

Bulletin uses `include:` (Q's context confirmed from source).

### `transition:generic` grants **no** space access

`scope-permissions-transition.js` (`ScopePermissionsTransition`, the class the
PDS wraps every OAuth token's scope in — `pds/dist/auth-verifier.js:400`):

```js
allowsBlob(o)  { if (this.hasTransitionGeneric) return true; return super.allowsBlob(o); }
allowsRepo(o)  { if (this.hasTransitionGeneric) return true; return super.allowsRepo(o); }
allowsRpc(o)   { /* generic => any non-chat.bsky lxm, or '*' */ }
/**
 * Grants nothing extra: `transition:generic` predates permissioned data, so a
 * legacy token must never reach a space. Overridden rather than omitted to
 * keep that a decision rather than an oversight.
 */
allowsSpace(o) { return super.allowsSpace(o); }   // <-- no shortcut
```

So `transition:generic` = full public repo + blob + (non-chat) RPC, and
**zero** space capability. This is the precise cause of the probe failure.

### Why a plain Bearer session still works (the asymmetry)

`pds/dist/api/com/atproto/space/util.js`, `assertSpaceScope`:

```js
export function assertSpaceScope(auth, spaceUri, op) {
  if (auth.credentials.type !== 'oauth') return;   // <-- legacy tokens exempt
  const { spaceDid, spaceType, skey } = toSpaceRef(spaceUri);
  auth.credentials.permissions.assertSpace({ type: spaceType, authority: spaceDid, skey, ...op });
}
```

Granular scope is enforced **only for `type: 'oauth'` credentials**. Legacy
Bearer tokens (a real `createSession` full-access token, or app-password
sessions) carry no granular grants at all, so there is nothing to check — they
are instead bounded by the handlers, which require the caller to be the repo
they name. That is why the hand-rolled probe / app-password path reaches spaces
while a `transition:generic` OAuth token is refused: only the OAuth path runs
the scope check, and `transition:generic` fails it.

(One caveat for the legacy path: `getDelegationToken` is declared with
`scopes: ACCESS_FULL` — `pds/dist/api/com/atproto/space/getDelegationToken.js`.
For **Bearer JWTs** that means the token must be a full-access session token
(`com.atproto.access`), not an app-password (`com.atproto.appPass`). For OAuth
(DPoP) requests the `ACCESS_FULL` AuthScope gate does **not** apply — the OAuth
branch in `auth-verifier.js:380-410` governs purely by the granular scope — so
an OAuth token with a space `action=read` grant is sufficient to mint a
delegation token.)

---

## Q2 — Permission-set resolution

### What each space endpoint requires (the verifier map)

From `pds/dist/api/com/atproto/{space,simplespace}/*.js`, every handler builds a
`SpacePermission` target `{ type: spaceType, authority: spaceDid, skey, ...op }`
where `spaceDid` is the space URI's owner DID:

| endpoint | op asserted | extra |
|---|---|---|
| `simplespace.createSpace` | `manage: create` | |
| `simplespace.updateSpace` | `manage: update` | `assertSpaceOwner` |
| `simplespace.deleteSpace` | `manage: delete` | `assertSpaceOwner` |
| `simplespace.addMember` | `manage: update` | `assertSpaceOwner` |
| `simplespace.removeMember` | `manage: update` | `assertSpaceOwner` |
| `simplespace.listMembers` | `action: read_self` | `assertSpaceOwner` |
| `simplespace.getSpace` | `action: read_self` | owner **or** space credential |
| `space.createRecord` | `action: create` + `collection` | `repo` must == caller |
| `space.putRecord` | `action: create` **or** `update` (by existence) + `collection` | |
| `space.deleteRecord` | `action: delete` + `collection` | |
| `space.applyWrites` | per-op `action` + `collection` | |
| `space.getRecord`/`listRecords`/`getBlob`/`listBlobs`/`getRepo`/`getLatestCommit`/`listRepoOps` | `assertSpaceRead`: self-read needs `action: read_self`; **cross-member needs a space credential** | |
| `space.getDelegationToken` | `action: read` (whole-space read) | OAuth: scope only; Bearer: `ACCESS_FULL` |
| `space.getSpaceCredential` | *(delegation-token auth, not user scope)* | membership checked here |

Key consequence: reading **your own** repo in a space is a plain `read_self`
self-op; reading **another member's** repo requires the delegation→credential
dance, and the OAuth grant that unlocks that dance is a whole-space
`action: read` on the space (which the owner DID must satisfy — hence the
`authority` question in Q4).

### The resolution mechanism (`@atproto/lex-resolver` + oauth-provider)

`oauth-provider/dist/lexicon/lexicon-manager.js` → `lexicon-getter.js` (cached)
→ `lex-resolver/dist/lex-resolver.js`. `LexResolver.get(nsid)` does:

1. **Authority via DNS.** `resolveLexiconAuthority(nsid)` →
   `getDomainTxtDid("_lexicon." + nsid.authority)`. It reads TXT records, takes
   the single line starting `did=`, and asserts it is a DID.
   `nsid.authority` is the **DNS-ordered** domain: `@atproto/syntax` `NSID.authority`
   = `segments.slice(0, -1).reverse().join('.')`. For
   `computer.sims.log.permissions` that is **`log.sims.computer`**, so the record
   is **`_lexicon.log.sims.computer`**.
2. **AT URI.** `at://<did>/com.atproto.lexicon.schema/<nsid>` (rkey = the full
   NSID string).
3. **Fetch + verify.** Resolves the DID doc → PDS endpoint + signing key,
   fetches via `com.atproto.sync.getRecord` (CAR), then `verifyRecordProof`:
   reads the commit, checks `commit.did`, **verifies the commit signature**,
   walks the MST to `com.atproto.lexicon.schema/<nsid>`, and confirms
   `record.$type === 'com.atproto.lexicon.schema'`.
4. **Validate.** `lexiconDocumentSchema.safeParse`, and `lexicon.id === rkey`.
   `LexiconManager.getPermissionSet` then requires
   `lexicon.defs.main.type === 'permission-set'`.

Because the fetch is `sync.getRecord` + commit-signature verification, the
authority repo must be a genuine, signed repo — **which any bsky.social account
is**. So Sim can host the lexicons on his existing bsky.social account
(`did:plc:gqorgf2irpe5vy6osekgc3be`, handle `sims.computer`); the schema records
are ordinary records written with a normal repo write (Bulletin's publisher
uses `com.atproto.repo.putRecord`, `lib/lexicon-publisher.ts`).

### The `include:` authority guard (`scopes/include-scope.js`)

`IncludeScope.isAllowedPermission` enforces that every permission pulled from
the set sits under the set's own NSID **group prefix** (everything up to the
last dot). For `computer.sims.log.permissions` the prefix is
`computer.sims.log`. For a `space` permission, **only the space `type` is
authority-checked** (collections may live under a different authority). tvlog's
types (`computer.sims.log.diary`, `computer.sims.log.watchlist`) and its
collections (`computer.sims.log.watch`, `computer.sims.log.watchlistItem`) all
sit under `computer.sims.log`, so they pass.

### The consent screen also resolves the `space` *type* lexicons

`oauth-provider/dist/oauth-provider.js:344-353` renders the authorize page with
both `getPermissionSetsFromScope` **and** `getSpacesFromScope`; the latter
resolves each space `type` NSID as a `type: "space"` lexicon and rethrows any
failure as `invalid_scope` ("Unable to retrieve space declarations"). **So tvlog
must publish a `space` lexicon per type too**, not just the permission set. (At
token issuance `buildTokenScope` only needs the `space` type lexicon for *bare*
`space:` scopes without collections; our set carries explicit collections, so
issuance itself wouldn't need them — but the consent page does, so publish them.)

### What Sim needs, concretely

- **DNS**: `_lexicon.log.sims.computer` TXT →
  `did=did:plc:gqorgf2irpe5vy6osekgc3be` (single `did=` line only — the resolver
  rejects multiple).
- **Records** in `did:plc:gqorgf2irpe5vy6osekgc3be`'s repo, collection
  `com.atproto.lexicon.schema`, rkey = the NSID, value = the lexicon doc:
  - `computer.sims.log.permissions` (the permission set)
  - `computer.sims.log.diary` (space type)
  - `computer.sims.log.watchlist` (space type)

---

## Q3 — Mainline compatibility

### Per-authorization scope override — yes, but only narrowing

`oauth-client/dist/oauth-client.js:106`:

```js
scope: options?.scope ?? this.clientMetadata.scope,
```

`authorize(input, { scope })` puts the requested scope into the PAR. The AS then
enforces requested-⊆-declared, per `oauth-provider/dist/client/client.js:221-230`:

```js
const declaredScopes = this.metadata.scope?.split(' ');
for (const scope of parameters.scope.split(' ')) {
  if (!declaredScopes.includes(scope))
    throw new InvalidScopeError(parameters, `Scope "${scope}" is not declared in the client metadata`);
}
```

The match is **verbatim token equality**, not semantic subset. So per-call
`scope` can drop tokens from the declared set but cannot introduce new ones (or
even a differently-normalized form). Consequence: any scope tvlog ever wants to
request must appear literally in that client's metadata.

### Does the alpha AS accept exotic *declared* scopes?

`oauth-provider/dist/client/client-manager.js:115-149` (`validateClientMetadata`)
only requires: `scope` present, contains `atproto`, no duplicates. It does **not**
run each declared token through `isAtprotoOauthScope`. So on the alpha PDS a
single client metadata carrying `include:`/`space:`/`repo:` tokens is accepted.

### bsky.social (mainline) — the unconfirmed risk

I could not verify the live bsky.social entryway's client-metadata validator or
scope grammar support (no live probe in a read-only brief). Two failure modes:

- **(a) Declared-scope rejection**: if mainline validates each declared scope
  token and rejects unknown ones, a shared metadata doc carrying
  `include:computer.sims.log.permissions` would fail client resolution and break
  **every** bsky.social login — the live app. This is the dangerous one and it
  is unconfirmed.
- **(b) Requested-scope failure**: avoided by design if tvlog requests only
  `atproto transition:generic` for bsky.social users (mainline understands those).

The granular grammar (`@atproto/oauth-scopes`) has a non-alpha line (latest
`0.5.9`), so mainline may already tolerate it — but "may" is not good enough for
the production login path. **Recommendation:** don't put exotic tokens in the
metadata that bsky.social sees at all (two clients, Q5).

---

## Q4 — What tvlog's permission set should contain

### Collections tvlog writes (confirmed from the repo)

`src/lib/atproto/records.ts`: `LIST_COLLECTION = social.popfeed.feed.list`,
`LIST_ITEM_COLLECTION = social.popfeed.feed.listItem`,
`WATCH_COLLECTION = computer.sims.log.watch`,
`WATCHLIST_ITEM_COLLECTION = computer.sims.log.watchlistItem`; `uploadBlob`
with `image/jpeg`. Routing (`src/lib/atproto/routing.ts`): diary → the diary
space (own-repo, collection `computer.sims.log.watch`); shared watchlist → the
watchlist space (collection `computer.sims.log.watchlistItem`); shelf
(popfeed lists) stays public repo.

### `authority`: what it means and why `"*"`

`authority` in a space permission is the **owner DID whose spaces the token may
act on** (`SpacePermission.matches` compares `this.authority` against
`target.authority`, which the PDS sets to the space URI's owner DID). It is *not*
the same as the NSID-authority guard in `include:` (that checks the space
*type*'s namespace). Options: `self` (resolved to the granting user's own DID),
`*` (any owner), or a specific DID.

tvlog is social: a user reads friends' diaries and co-writes shared watchlists
**owned by other members**. Every cross-owner operation — `getDelegationToken`
on a friend's diary space, `createRecord` into a shared watchlist owned by
another member — asserts against the *owner's* DID, which `self` (the caller's
own DID) will never match. So both space types need **`authority: "*"`**, exactly
as Bulletin does. This is only the app-delegation boundary; the owner's PDS still
enforces membership independently (`getSpaceCredential` →
`simpleSpaceManager.authorizeCredential`, and writes require `repo == caller`).
`authority: "self"` would be tighter but would break friend-reads of the diary,
so it is not viable here.

### `manage` → simplespace lifecycle

`manage: ["create","update","delete"]` maps to `createSpace` (`create`),
`updateSpace`/`addMember`/`removeMember` (`update`), `deleteSpace` (`delete`).
Granting all three to every tvlog user is safe: `addMember`/`removeMember`/
`updateSpace`/`deleteSpace` additionally call `assertSpaceOwner`, so a non-owner
member holding the manage grant still cannot manage someone else's space.

### Draft — `computer.sims.log.permissions`

```json
{
  "lexicon": 1,
  "id": "computer.sims.log.permissions",
  "defs": {
    "main": {
      "type": "permission-set",
      "title": "tvlog",
      "detail": "Read and write your tvlog diary and shared watchlists",
      "permissions": [
        {
          "type": "permission",
          "resource": "space",
          "spaceType": "computer.sims.log.diary",
          "authority": "*",
          "skey": "diary",
          "collection": ["computer.sims.log.watch"],
          "action": ["read", "create", "update", "delete"],
          "manage": ["create", "update", "delete"]
        },
        {
          "type": "permission",
          "resource": "space",
          "spaceType": "computer.sims.log.watchlist",
          "authority": "*",
          "skey": "watchlist",
          "collection": ["computer.sims.log.watchlistItem"],
          "action": ["read", "create", "update", "delete"],
          "manage": ["create", "update", "delete"]
        }
      ]
    }
  }
}
```

Notes: `spaceType` (not `type`) is the JSON spelling — `lib/syntax-lexicon.js`
remaps `spaceType` → the scope string's `type` (`type` is taken by the
permission discriminator). `skey` is set to the fixed convention value (`"diary"`
/ `"watchlist"`) matching `src/lib/atproto/spaces.ts`; `"*"` would also work
since there is one space per type per owner. `collection` is per-type (only the
collection actually written into that space).

### Draft — `space` type lexicons (required for consent)

```json
{
  "lexicon": 1,
  "id": "computer.sims.log.diary",
  "defs": {
    "main": {
      "type": "space",
      "key": "literal:diary",
      "name": "tvlog diary",
      "description": "Your private watch diary — tags, notes, and mood.",
      "collections": ["computer.sims.log.watch"]
    }
  }
}
```

```json
{
  "lexicon": 1,
  "id": "computer.sims.log.watchlist",
  "defs": {
    "main": {
      "type": "space",
      "key": "literal:watchlist",
      "name": "tvlog shared watchlist",
      "description": "A watchlist any member can add to and everyone can see.",
      "collections": ["computer.sims.log.watchlistItem"]
    }
  }
}
```

(`key: "literal:<skey>"` matches Bulletin's `my.bulletin.board`
(`key: "literal:self"`) and tvlog's fixed skeys.)

### Non-space permissions, if spike accounts also write the public shelf

The permission set only grants space access. If a `pds.sims.computer` account
also creates public popfeed lists and uploads list images (the public "shelf"),
its OAuth token needs the granular equivalents of what `transition:generic`
covers on bsky.social — add to the **spaces client** scope string (not the set):

```
repo:social.popfeed.feed.list repo:social.popfeed.feed.listItem
blob?accept=image/jpeg&accept=image/png&accept=image/webp
```

`repo:<collection>` defaults to `action=create,update,delete`
(`scopes/repo-permission.js`). `computer.sims.log.watch` is **not** needed as a
`repo:` scope for spike accounts — it goes to the diary *space*, not the public
repo. Drop these entirely if spike accounts never write the public shelf.

---

## Q5 — Migration path

### Recommended: two OAuth clients, routed by PDS

`src/lib/atproto/oauth.ts` currently builds one `NodeOAuthClient` from one
`clientMetadata()` with `scope: "atproto transition:generic"`, and
`src/app/api/auth/login/route.ts` calls `client.authorize(identifier, {state})`.
Because the AS enforces requested-⊆-declared **and** bsky.social's tolerance of
exotic declared scopes is unconfirmed, the safe design is two clients:

- **Legacy client** — unchanged. `client_id = <base>/api/auth/client-metadata.json`,
  `scope = "atproto transition:generic"`. bsky.social (and any non-spaces PDS)
  uses this. **The live app's login path does not change at all.**
- **Spaces client** — new metadata route, e.g.
  `client_id = <base>/api/auth/client-metadata-spaces.json`,
  scope (minimal):

  ```
  atproto include:computer.sims.log.permissions
  ```

  or, if spike accounts also write the public shelf:

  ```
  atproto blob?accept=image/jpeg&accept=image/png&accept=image/webp repo:social.popfeed.feed.list repo:social.popfeed.feed.listItem include:computer.sims.log.permissions
  ```

At login, resolve the account's PDS first (there is already
`resolveIdentity(...).pdsUrl`), then pick the client: `pds.sims.computer` →
spaces client; everything else → legacy client. Both call `authorize()`
normally; no per-call `scope` override is required (each client's declared scope
is already the right one). Keep two entries in `stateStore`/`sessionStore`
keyed as today.

*Alternative (single client, per-authorization scope):* one metadata doc whose
declared scope is the **superset** (`atproto transition:generic
include:computer.sims.log.permissions ...`), then `authorize(handle, { scope })`
narrows to `atproto transition:generic` for bsky.social and to the spaces subset
for the sandbox. This is simpler code but only safe **if** bsky.social is
confirmed to accept a client-metadata scope containing `include:` (Q3 risk (a)).
Do not ship this without that confirmation.

### What breaks for existing sessions

- Existing bsky.social sessions: **nothing** (legacy client untouched).
- Any currently signed-in `pds.sims.computer` OAuth session: still holds a
  `transition:generic` token → still cannot reach spaces. Those users must
  re-authorize through the spaces client to obtain a token carrying the space
  grants. (App-password/full-access script sessions are unaffected — they were
  never scope-gated.)

### Ordered checklist

1. **Author lexicons** (docs-only here; real files later): the three JSON docs
   above (`computer.sims.log.permissions`, `.diary`, `.watchlist`).
2. **Publish records** to `did:plc:gqorgf2irpe5vy6osekgc3be` (Sim's bsky.social
   repo), collection `com.atproto.lexicon.schema`, rkey = each NSID (Bulletin's
   `lib/lexicon-publisher.ts` is a working template — `putRecord` per doc).
3. **DNS TXT** `_lexicon.log.sims.computer` → `did=did:plc:gqorgf2irpe5vy6osekgc3be`
   (single `did=` line). Verify with `dig +short TXT _lexicon.log.sims.computer`
   and by resolving `at://did:plc:gqorgf2irpe5vy6osekgc3be/com.atproto.lexicon.schema/computer.sims.log.permissions`
   via `com.atproto.sync.getRecord`.
4. **Scope change** — add the spaces client (new metadata route + second
   `NodeOAuthClient`) and PDS-based routing at login. Leave the legacy client
   exactly as-is.
5. **Test matrix**:
   - *Ordering guard*: confirm that steps 2-3 are live **before** any spaces
     login — the provider hard-fails the authorization request with
     `invalid_scope` if the permission set can't be resolved
     (`request-manager.js:188-200`), and again at token issuance
     (`token-manager.js:68`).
   - *sandbox happy path*: login on `pds.sims.computer` via the spaces client →
     consent screen renders the set + space declarations → token carries the
     resolved space scopes → `detectSpacesCapability` true → diary create/read
     (self), shared-watchlist create/read (self + cross-member via
     delegation→credential), membership add/remove.
   - *bsky.social regression*: login on bsky.social via the legacy client →
     identical to today; public shelf + blob + `computer.sims.log.watch` public
     writes all work; spaces stay disabled.
   - *negative*: a `pds.sims.computer` account still holding an old
     `transition:generic` token is refused on `com.atproto.space.*` (proves the
     re-authorize requirement).

---

## Open questions / not confirmed

- **bsky.social deployed validator (Q3, the big one).** Whether mainline
  entryway rejects unknown *declared* scope tokens, and whether it supports the
  granular grammar / `include:` at all, was not verified live. The two-client
  recommendation sidesteps this; if the single-client alternative is ever
  wanted, probe bsky.social first (register a throwaway client whose metadata
  scope contains `include:...` and see if authorization starts).
- **Does the alpha OAuth token actually satisfy `getDelegationToken`
  end-to-end?** The code path says yes (OAuth branch ignores the `ACCESS_FULL`
  AuthScope gate and enforces only the granular `action:read`), but this was
  read from source, not exercised against `pds.sims.computer` with a real OAuth
  token. Worth a live check once the spaces client exists.
- **Whether spike accounts write the public shelf.** Determines if the spaces
  client needs the `repo:`/`blob:` tokens. The write seam supports both; the
  product decision isn't recorded in the repo.
- **`clientAttestation` / app-identity gating.** `getSpaceCredential` accepts an
  optional `clientAttestation` (`clientAttestationVerifier.verify`) and the
  space `appAccess` policy can be `open` vs app-restricted. tvlog uses `open`
  (`src/lib/atproto/spaces.ts`), so attestation is not required today, but if
  spaces later restrict by app, tvlog would need a client attestation flow —
  out of scope for this brief.
- **`_lexicon` on a deep subdomain.** The record name is `_lexicon.log.sims.computer`
  (a TXT record, so the deep-subdomain TLS trap noted in `spaces-v1.md` does not
  apply), but confirm Cloudflare serves it cleanly alongside the existing
  `_atproto.*` handle records.
```