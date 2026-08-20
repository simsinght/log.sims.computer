# spaces-alpha SDK evaluation

## Exact versions

- `@atproto/api` — `0.0.0-spaces-alpha-20260818163953` (npm dist-tag `alpha`)
- `@atproto/xrpc` — `0.0.0-spaces-alpha-20260818163953`
- Transitive `@atproto/*` also cut at the same tag: `common-web`, `lexicon`, `syntax` = `0.0.0-spaces-alpha-20260818163953`; `lex-data` 0.1.7, `lex-json` 0.1.6.
- App currently pins `@atproto/api` `^0.20.33` (resolved 0.20.33 in the lockfile).

## Method inventory

Generated typed clients exist for the full permissioned-spaces surface. Accessed as
`agent.com.atproto.space.*` and `agent.com.atproto.simplespace.*` (namespace classes
`ComAtprotoSpaceNS` / `ComAtprotoSimplespaceNS` in `node_modules/@atproto/api/dist/client/index.js`).

- `com.atproto.space.*`: applyWrites, createRecord, deleteRecord, putRecord, getRecord,
  listRecords, getBlob, listBlobs, getRepo, getLatestCommit, listRepos, listRepoOps,
  listSpaces, getDelegationToken, getSpaceCredential, notifyWrite, notifySpaceDeleted,
  registerNotify, unregisterNotify.
- `com.atproto.simplespace.*`: createSpace, updateSpace, deleteSpace, getSpace, listMembers,
  addMember, removeMember, checkUserAccess.

Every one is a thin generated stub: `this._client.call('<nsid>', params/qp, body, opts)`
(+ `.toKnownErr` mapping). There is **no** higher-level orchestration method.

## Gating questions

### (a) Delegation-token → space-credential exchange, or raw stubs?
**Raw stubs only.** Both `getDelegationToken` (`client/index.js` ComAtprotoSpaceNS) and
`getSpaceCredential` are plain `this._client.call(...)`. Nothing chains getDelegationToken →
getSpaceCredential → credentialed read. The caller must orchestrate the exact sequence
`space-probe.mjs:85-99` (`mintCredential`) does by hand.

### (b) DPoP proof generation for space credentials?
**No — zero DPoP code in the SDK.** Grepping `api/dist` + `xrpc/dist` for `dpop` yields hits
only in `client/lexicons.js` (schema *description* text: "bound through its cnf.jkt claim to the
key that signed the request's DPoP proof"). No ES256 proof signing, no `jti`, no `ath` digest
anywhere. The omit-`ath`-on-exchange / include-`ath`-on-reads wrinkle
(`space-probe.mjs:51-59, 92, 101`) is therefore entirely the caller's responsibility — the SDK
neither gets it right nor wrong; it does not participate. (`@atproto/oauth-client-*` handles DPoP
for the *user session*, a different key and flow, not space credentials.) The XRPC `call(...)`
does accept arbitrary `opts.headers` (`HeadersMap`), so a caller can inject
`authorization: DPoP <cred>` + a self-signed `dpop` proof header into the typed read methods.

### (c) Credential lifetime / refresh management?
**Not handled — caching is entirely the caller's job.** `getSpaceCredential` returns
`{ credential }` (see `getSpaceCredential.d.ts` OutputSchema) and the SDK stores/refreshes
nothing. The ~2h TTL, DPoP-key binding, and per-request single-use `jti` are all unmanaged.

### (d) Lexicon IDs and shapes compatible with PDS @ bddc99fb?
**Yes — compatible; alpha is a backward-compatible superset.** NSIDs identical. Shapes match
`space-probe.mjs` exactly:
- `simplespace.createSpace` in `{ type, skey?, policy{$type}, appAccess{$type} }` → probe sends
  the same (memberListPolicy / open). Alpha adds *additional* policy/appAccess variants
  (`ManagingAppPolicy`, `AllowList`) — additive union members, not a break.
- `simplespace.addMember` `{ space, did }`; `space.createRecord`
  `{ space, repo, collection, rkey?, validate?, record }`; `space.getRecord` params
  `{ space, repo, collection, rkey }` → `{ uri, cid, value }` — all match the probe.
- `getDelegationToken` params `{ space }` → `{ token }`; `getSpaceCredential` in `{ space,
  clientAttestation? }` → `{ credential }`. The `clientAttestation?` field is **new** (app-identity
  gating) and optional; the probe's open-access flow omits it, so no incompatibility.

Drift note: the alpha was cut 2026-08-18, newer than the PDS pin (bddc99fb). Observed drift is
purely additive (clientAttestation, extra policy variants) — safe against the pinned PDS for the
probe's member-list/open flow. Unauthenticated `describeServer` on pds.sims.computer confirms the
live PDS (`did:web:pds.sims.computer`); `com.atproto.space.listSpaces` without auth returns 401
(endpoint present, auth-gated) — consistent with the alpha client's expectations.

### (e) Does upgrading break the app?
**No.** App imports only core exports — `AtpAgent`, `Agent`, `AtpSessionData`
(`src/lib/atproto/*`, `src/lib/session.ts`, `scripts/*`). All still exported from the alpha main
entry (`index.d.ts:22-28`, `atp-agent.d.ts`). Typecheck run in the worktree:
- Baseline `@atproto/api@0.20.33`: `tsc --noEmit` clean (rc 0).
- Alpha `0.0.0-spaces-alpha-20260818163953` (api + xrpc): `tsc --noEmit` clean (rc 0), no new
  errors, `npm install` resolved with no ERESOLVE peer conflicts.

## VERDICT: hybrid

Use the alpha's typed XRPC methods, keep the probe-derived DPoP/credential logic in our own lib.

The alpha buys real value: fully typed clients for every `com.atproto.space.*` /
`com.atproto.simplespace.*` call with request/response shapes that match the pinned PDS, and it
drops into the app with a clean typecheck and no API breakage. But it stops at the wire: it does
**none** of the security-critical dance — no delegation-token→credential exchange orchestration,
no DPoP proof generation (the omit/include-`ath` wrinkle is 100% ours), and no credential
caching/refresh for the ~2h DPoP-bound, single-use-`jti` credentials. So "build on alpha" is
wrong (the hard, easy-to-get-wrong parts are unimplemented) and "extract probe-lib" is wasteful
(the alpha's typed methods and matching shapes are usable today). The hybrid: a thin
`SpaceCredentialManager` porting `space-probe.mjs`'s `mintCredential` / `dpopProof` (ES256 via
webcrypto, ath-omit-on-exchange, per-request jti) + credential cache keyed by space+DPoP-key,
which then feeds `authorization`/`dpop` headers into the alpha's typed `space.getRecord`,
`space.listRecords`, `space.createRecord`, `simplespace.*` methods via their `opts.headers`.

## Worktree state
- `package.json` switched to the alpha (api + xrpc) and `npm install`-ed so the typecheck ran
  against real modules. Left staged-uncommitted per instructions; `node_modules` is gitignored.
  Revert the two dependency lines to `@atproto/api ^0.20.33` (drop the xrpc pin) if not adopting.
