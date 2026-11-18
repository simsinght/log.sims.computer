// Live two-account permissioned-spaces check against a spaces PDS (default
// https://pds.sims.computer), on the 12/13 Nov 2026 spaces API:
//   createSpace / getSpace, memberspace putMembers / listMembers /
//   removeMembers, a space write + self-read, and a cross-member credentialed
//   listRecords (getDelegationToken -> authorizeSpaceSync -> signed read):
//   a member can read, a non-member can't.
//
// It uses two EXISTING test accounts; it never creates accounts:
//   SPACE_PROBE_A_IDENTIFIER / SPACE_PROBE_A_PASSWORD   (space authority)
//   SPACE_PROBE_B_IDENTIFIER / SPACE_PROBE_B_PASSWORD   (member, then removed)
//   SPACE_PROBE_PDS   optional, default https://pds.sims.computer
//   SPACE_PROBE_OUT   optional path for the full (redacted) trace as JSON
// Passwords must be the accounts' full passwords: since the 17 Nov build
// (atproto#5923) the PDS refuses app-password sessions on every space method.
//
// It creates a fresh, test-named space (computer.sims.test.spaceProbe, skey
// probe-<time>), and deletes its record and the space at the end. It also lists
// the member flags of A's other spaces, read-only.
//
// Run: node --env-file=.env.local scripts/space-probe.mjs
import { writeFileSync } from 'node:fs'
import { P256Keypair } from '@atproto/crypto'
import { createSpaceSigHeaders } from '@atproto/space'

const PDS = (process.env.SPACE_PROBE_PDS || 'https://pds.sims.computer').replace(/\/$/, '')
const SPACE_TYPE = 'computer.sims.test.spaceProbe'
const SKEY = `probe-${Date.now().toString(36)}`
const COLLECTION = 'computer.sims.test.probeRecord'
// The PDS sits behind Cloudflare, which challenges non-browser user agents.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

const need = (k) => {
  const v = process.env[k]
  if (!v) {
    console.error(`missing ${k} (see the header of scripts/space-probe.mjs)`)
    process.exit(2)
  }
  return v
}

// ---- redacted trace ---------------------------------------------------------
const trace = []
const short = (s) => (typeof s === 'string' && s.length > 40 ? `${s.slice(0, 10)}…(${s.length} chars)` : s)
const SECRET_KEYS = ['accessJwt', 'refreshJwt', 'token', 'credential', 'delegationToken', 'password']
const redact = (b) => {
  if (!b || typeof b !== 'object') return b
  const o = JSON.parse(JSON.stringify(b))
  for (const k of SECRET_KEYS) if (o[k]) o[k] = k === 'password' ? '<redacted>' : short(o[k])
  return o
}
const authKind = (h) => (h?.authorization ? h.authorization.split(' ')[0] : '(none)')

async function xrpc(method, nsid, { params, body, headers, note } = {}) {
  let url = `${PDS}/xrpc/${nsid}`
  if (params) url += `?${new URLSearchParams(params)}`
  const res = await fetch(url, {
    method,
    headers: { 'user-agent': UA, ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text.slice(0, 200) }
  trace.push({ step: note, method, nsid, auth: authKind(headers), params, body: redact(body), status: res.status, response: redact(json) })
  return { status: res.status, body: json }
}

// ---- accounts ---------------------------------------------------------------
async function login(label, identifier, password) {
  const r = await xrpc('POST', 'com.atproto.server.createSession', { body: { identifier, password }, note: `[${label}] createSession` })
  if (!r.body?.accessJwt) {
    console.error(`[${label}] createSession failed: ${r.status} ${r.body?.error ?? ''} ${r.body?.message ?? ''}`)
    process.exit(3)
  }
  return { label, did: r.body.did, handle: r.body.handle, auth: { authorization: `Bearer ${r.body.accessJwt}` } }
}

// ---- space credential -------------------------------------------------------
async function mintCredential(acct, space) {
  const dt = await xrpc('GET', 'com.atproto.space.getDelegationToken', { params: { space }, headers: acct.auth, note: `[${acct.label}] getDelegationToken` })
  if (!dt.body?.token) return { error: dt }
  const keypair = await P256Keypair.create()
  // Unauthenticated: the delegation token and the credential key go in the body.
  const ex = await xrpc('POST', 'com.atproto.space.authorizeSpaceSync', {
    body: { space, credentialKey: keypair.did(), delegationToken: dt.body.token },
    note: `[${acct.label}] authorizeSpaceSync`,
  })
  if (!ex.body?.credential) return { error: ex }
  return { credential: ex.body.credential, keypair, spaceRev: ex.body.spaceRev }
}
async function credRead(acct, cred, writerDid, nsid, params, note) {
  const { headers } = await createSpaceSigHeaders({
    authorization: `Atproto-Space-Credential ${cred.credential}`,
    audience: writerDid,
    keypair: cred.keypair,
  })
  return xrpc('GET', nsid, { params, headers, note: `[${acct.label}] ${note}` })
}
const jwtPayload = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))

// ---- run --------------------------------------------------------------------
const assertions = []
const check = (name, cond, detail) => assertions.push({ name, pass: !!cond, detail })

const A = await login('A', need('SPACE_PROBE_A_IDENTIFIER'), need('SPACE_PROBE_A_PASSWORD'))
const B = await login('B', need('SPACE_PROBE_B_IDENTIFIER'), need('SPACE_PROBE_B_PASSWORD'))
const space = `at://${A.did}/space/${SPACE_TYPE}/${SKEY}`
let created = false
let rkey = null

try {
  // Survey (read-only): member flags in A's pre-existing spaces.
  const ls = await xrpc('GET', 'com.atproto.space.listSpaces', { params: { spaceDid: A.did }, headers: A.auth, note: '[A] listSpaces' })
  const survey = []
  for (const s of ls.body?.spaces ?? []) {
    if (!s.space?.startsWith(`at://${A.did}/`)) continue
    const m = await xrpc('GET', 'com.atproto.memberspace.listMembers', { params: { space: s.space }, headers: A.auth, note: `[A] listMembers (survey)` })
    survey.push({ space: s.space, status: m.status, error: m.body?.error, members: m.body?.members })
  }
  check('listSpaces (spaceDid) answers', ls.status === 200, { status: ls.status, err: ls.body?.error })

  // 1. create + get
  const c = await xrpc('POST', 'com.atproto.space.createSpace', {
    body: { spaceType: SPACE_TYPE, skey: SKEY, policy: { $type: 'com.atproto.memberspace.policy' } },
    headers: A.auth, note: '[A] createSpace',
  })
  created = c.status === 200
  check('createSpace returns the expected space', c.body?.space === space, { status: c.status, got: c.body?.space ?? c.body, want: space })
  const g = await xrpc('GET', 'com.atproto.space.getSpace', { params: { space }, headers: A.auth, note: '[A] getSpace' })
  check('getSpace returns {space, memberspace policy}', g.body?.space === space && g.body?.policy?.$type === 'com.atproto.memberspace.policy', g.body)

  // 2. membership
  const put = await xrpc('POST', 'com.atproto.memberspace.putMembers', {
    body: { space, members: [{ did: B.did, read: true, write: true }] }, headers: A.auth, note: '[A] putMembers B',
  })
  check('putMembers ok', put.status === 200, { status: put.status, err: put.body?.error })
  const lm = await xrpc('GET', 'com.atproto.memberspace.listMembers', { params: { space }, headers: A.auth, note: '[A] listMembers' })
  const bEntry = (lm.body?.members ?? []).find((m) => m.did === B.did)
  check('listMembers shows B with read+write', bEntry?.read === true && bEntry?.write === true, lm.body?.members)

  // 3. write + self-read
  const w = await xrpc('POST', 'com.atproto.space.createRecord', {
    body: { space, repo: A.did, collection: COLLECTION, record: { $type: COLLECTION, note: 'space-probe test record', createdAt: new Date().toISOString() } },
    headers: A.auth, note: '[A] createRecord',
  })
  rkey = w.body?.uri?.split('/').pop() ?? null
  check('createRecord ok', w.status === 200 && !!rkey, { status: w.status, uri: w.body?.uri, err: w.body?.error })
  const self = await xrpc('GET', 'com.atproto.space.listRecords', { params: { space, repo: A.did, collection: COLLECTION }, headers: A.auth, note: '[A] listRecords own repo (session)' })
  check('self-read sees the record', (self.body?.records ?? []).some((r) => r.rkey === rkey), { status: self.status, n: self.body?.records?.length })

  // 4. cross-member reads
  const plain = await xrpc('GET', 'com.atproto.space.listRecords', { params: { space, repo: A.did, collection: COLLECTION }, headers: B.auth, note: '[B] listRecords A repo with plain session (neg)' })
  check('B plain-session read of A repo is denied', plain.status >= 400, { status: plain.status, err: plain.body?.error })
  const bCred = await mintCredential(B, space)
  if (bCred.error) {
    check('member B obtains a credential', false, { status: bCred.error.status, err: bCred.error.body?.error, msg: bCred.error.body?.message })
  } else {
    const p = jwtPayload(bCred.credential)
    check('member B obtains a credential', true, { lifetimeSec: p.exp - p.iat, cnfKidMatches: p.cnf?.kid === bCred.keypair.did(), spaceRev: bCred.spaceRev })
    const r = await credRead(B, bCred, A.did, 'com.atproto.space.listRecords', { space, repo: A.did, collection: COLLECTION }, 'listRecords A repo (credential)')
    check('member B reads A record with credential', (r.body?.records ?? []).some((x) => x.rkey === rkey), { status: r.status, err: r.body?.error, msg: r.body?.message })
    const wrongAud = await credRead(B, bCred, B.did, 'com.atproto.space.listRecords', { space, repo: A.did, collection: COLLECTION }, 'listRecords A repo, audience=B (neg)')
    check('credential with the wrong audience is refused', wrongAud.status >= 400, { status: wrongAud.status, err: wrongAud.body?.error })
  }

  // 5. remove B -> B is a non-member
  const rm = await xrpc('POST', 'com.atproto.memberspace.removeMembers', { body: { space, dids: [B.did] }, headers: A.auth, note: '[A] removeMembers B' })
  check('removeMembers ok', rm.status === 200, { status: rm.status, err: rm.body?.error })
  const lm2 = await xrpc('GET', 'com.atproto.memberspace.listMembers', { params: { space }, headers: A.auth, note: '[A] listMembers after remove' })
  check('B gone from listMembers', !(lm2.body?.members ?? []).some((m) => m.did === B.did), lm2.body?.members)
  const nonMember = await mintCredential(B, space)
  check('non-member B cannot obtain a credential', !!nonMember.error, nonMember.error ? { status: nonMember.error.status, err: nonMember.error.body?.error } : 'credential issued!')
  if (!nonMember.error) {
    const r = await credRead(B, nonMember, A.did, 'com.atproto.space.listRecords', { space, repo: A.did, collection: COLLECTION }, 'listRecords as non-member (neg)')
    check('non-member read denied', r.status >= 400, { status: r.status })
  }

  console.log(JSON.stringify({ pds: PDS, space, survey }, null, 2))
} finally {
  // cleanup: only what this run created
  if (rkey) await xrpc('POST', 'com.atproto.space.deleteRecord', { body: { space, repo: A.did, collection: COLLECTION, rkey }, headers: A.auth, note: '[A] deleteRecord (cleanup)' })
  if (created) {
    const d = await xrpc('POST', 'com.atproto.space.deleteSpace', { body: { space }, headers: A.auth, note: '[A] deleteSpace (cleanup)' })
    check('cleanup: deleteSpace ok', d.status === 200, { status: d.status, err: d.body?.error })
  }
}

if (process.env.SPACE_PROBE_OUT) writeFileSync(process.env.SPACE_PROBE_OUT, JSON.stringify({ space, assertions, trace }, null, 2))
const passed = assertions.filter((a) => a.pass).length
for (const a of assertions) console.log(`${a.pass ? 'PASS' : 'FAIL'}  ${a.name}  ${JSON.stringify(a.detail)}`)
console.log(`\n${passed}/${assertions.length} assertions passed`)
process.exit(passed === assertions.length ? 0 : 1)
