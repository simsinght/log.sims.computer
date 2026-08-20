// Permissioned-spaces "hello world" against the LIVE PDS at pds.sims.computer.
// Self-contained: account creation + full space round trip, incl. the DPoP
// delegation-token -> space-credential exchange, using Node's webcrypto only.
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const PDS = 'https://pds.sims.computer'
const INVITE_ALPHA = 'pds-sims-computer-qyxgp-74ij6'
const INVITE_BETA = 'pds-sims-computer-mjngu-tlvxb'
const SPACE_TYPE = 'computer.sims.watchClub'
const SKEY = 'watch-club'
const WATCH_COLLECTION = 'computer.sims.log.watch'

const trace = []
const short = (s) => (typeof s === 'string' && s.length > 40 ? `${s.slice(0, 12)}…(${s.length} chars)` : s)
const redactHeaders = (h) => {
  if (!h) return undefined
  const o = {}
  for (const [k, v] of Object.entries(h)) {
    if (k === 'authorization') o[k] = v.replace(/(Bearer|DPoP) (.+)/, (_, s, t) => `${s} ${short(t)}`)
    else if (k === 'dpop') o[k] = short(v)
    else o[k] = v
  }
  return o
}
const trimBody = (b) => {
  if (b && typeof b === 'object') {
    const o = JSON.parse(JSON.stringify(b))
    for (const secret of ['accessJwt', 'refreshJwt', 'token', 'credential']) {
      if (o[secret]) o[secret] = short(o[secret])
    }
    return o
  }
  return b
}

// ---- crypto helpers (ES256 / DPoP) ------------------------------------------
const b64u = (buf) => Buffer.from(buf).toString('base64url')
const b64uStr = (s) => Buffer.from(s, 'utf8').toString('base64url')

async function genKey() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey)
  return { priv: kp.privateKey, bareJwk: { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y } }
}
async function signJwt(header, payload, priv) {
  const signingInput = `${b64uStr(JSON.stringify(header))}.${b64uStr(JSON.stringify(payload))}`
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, new TextEncoder().encode(signingInput))
  return `${signingInput}.${b64u(new Uint8Array(sig))}`
}
async function dpopProof(key, htm, htu, credential) {
  const u = new URL(htu)
  const payload = { jti: randomBytes(16).toString('hex'), htm, htu: u.origin + u.pathname, iat: Math.floor(Date.now() / 1000) }
  if (credential) {
    const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential))
    payload.ath = Buffer.from(dig).toString('base64url')
  }
  return signJwt({ alg: 'ES256', typ: 'dpop+jwt', jwk: key.bareJwk }, payload, key.priv)
}

// ---- HTTP -------------------------------------------------------------------
async function xrpc(method, lxm, { params, body, headers, note } = {}) {
  let url = `${PDS}/xrpc/${lxm}`
  if (params) url += `?${new URLSearchParams(params)}`
  const opts = { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers } }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(url, opts)
  const t = await res.text()
  let j
  try { j = JSON.parse(t) } catch { j = t }
  trace.push({
    step: note,
    method,
    lxm,
    auth: headers?.authorization ? redactHeaders(headers).authorization : '(none)',
    dpop: headers?.dpop ? 'yes' : undefined,
    params: params || undefined,
    body: body ? trimBody(body) : undefined,
    status: res.status,
    response: trimBody(j),
  })
  return { status: res.status, body: j }
}

async function mintCredential(label, accessJwt, space) {
  const dt = await xrpc('GET', 'com.atproto.space.getDelegationToken', {
    params: { space }, headers: { authorization: `Bearer ${accessJwt}` }, note: `[${label}] getDelegationToken`,
  })
  const token = dt.body.token
  if (!token) throw new Error(`[${label}] no delegation token: ${JSON.stringify(dt.body)}`)
  const key = await genKey()
  const proof = await dpopProof(key, 'POST', `${PDS}/xrpc/com.atproto.space.getSpaceCredential`)
  const ex = await xrpc('POST', 'com.atproto.space.getSpaceCredential', {
    body: { space }, headers: { authorization: `Bearer ${token}`, dpop: proof }, note: `[${label}] getSpaceCredential (exchange)`,
  })
  const credential = ex.body.credential
  if (!credential) throw new Error(`[${label}] no credential: ${JSON.stringify(ex.body)}`)
  return { credential, key }
}
async function credRead(label, cred, lxm, params, note) {
  const proof = await dpopProof(cred.key, 'GET', `${PDS}/xrpc/${lxm}`, cred.credential)
  return xrpc('GET', lxm, { params, headers: { authorization: `DPoP ${cred.credential}`, dpop: proof }, note: `[${label}] ${note}` })
}

// ---- accounts ---------------------------------------------------------------
async function createAccount(handle, email, invite) {
  const password = randomBytes(12).toString('hex')
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createAccount`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ handle, email, password, inviteCode: invite }),
  })
  const body = await res.json()
  if (!body.did) throw new Error(`createAccount ${handle} failed: ${JSON.stringify(body)}`)
  return { handle, email, password, did: body.did, accessJwt: body.accessJwt }
}

// ---- run --------------------------------------------------------------------
const assertions = []
const assert = (name, cond, detail) => { assertions.push({ name, pass: !!cond, detail }); }

const alpha = await createAccount('alpha-watch.pds.sims.computer', 'alpha@sims.computer', INVITE_ALPHA)
const beta = await createAccount('beta-watch.pds.sims.computer', 'beta@sims.computer', INVITE_BETA)
const authA = { authorization: `Bearer ${alpha.accessJwt}` }
const authB = { authorization: `Bearer ${beta.accessJwt}` }
const space = `at://${alpha.did}/space/${SPACE_TYPE}/${SKEY}`

// 1. alpha creates the space (member-list policy, open app access)
const create = await xrpc('POST', 'com.atproto.simplespace.createSpace', {
  body: { type: SPACE_TYPE, skey: SKEY, policy: { $type: 'com.atproto.simplespace.defs#memberListPolicy' }, appAccess: { $type: 'com.atproto.simplespace.defs#open' } },
  headers: authA, note: '[alpha] createSpace',
})
assert('createSpace returns expected space uri', create.body.uri === space, { got: create.body.uri, want: space })

// 2. alpha adds beta as a member
await xrpc('POST', 'com.atproto.simplespace.addMember', { body: { space, did: beta.did }, headers: authA, note: '[alpha] addMember beta' })

// 3. list members
const members = await xrpc('GET', 'com.atproto.simplespace.listMembers', { params: { space }, headers: authA, note: '[alpha] listMembers' })
const memberDids = (members.body.members || []).map((m) => m.did)
assert('beta is a member', memberDids.includes(beta.did), memberDids)
assert('owner alpha is NOT in member list', !memberDids.includes(alpha.did), memberDids)

// 4. alpha writes a record into the space
const alphaRec = { $type: WATCH_COLLECTION, tmdbId: 603, watchedAt: '2026-08-17T21:30:00.000Z', note: 'first record in a permissioned space' }
const write = await xrpc('POST', 'com.atproto.space.createRecord', {
  body: { space, repo: alpha.did, collection: WATCH_COLLECTION, rkey: 'alpha-watch-1', record: alphaRec }, headers: authA, note: '[alpha] createRecord',
})
const alphaUri = write.body.uri
assert('alpha record uri contains alpha did + space marker', !!alphaUri && alphaUri.includes(alpha.did) && alphaUri.includes('/space/'), alphaUri)

// 7a. NEGATIVE: read alpha's record with NO auth
const noAuth = await xrpc('GET', 'com.atproto.space.getRecord', {
  params: { space, repo: alpha.did, collection: WATCH_COLLECTION, rkey: 'alpha-watch-1' }, note: '[neg] getRecord no auth',
})
assert('no-auth read is denied (>=400)', noAuth.status >= 400, { status: noAuth.status, err: noAuth.body?.error })

// 7b. NEGATIVE: beta reads alpha's repo with a PLAIN access token (no space credential)
const betaPlain = await xrpc('GET', 'com.atproto.space.getRecord', {
  params: { space, repo: alpha.did, collection: WATCH_COLLECTION, rkey: 'alpha-watch-1' }, headers: authB, note: '[neg] beta plain-token reads alpha repo',
})
assert('beta plain-token cross-repo read is denied', betaPlain.status >= 400, { status: betaPlain.status, err: betaPlain.body?.error })

// 5. beta reads alpha's record back via a space credential
const betaCred = await mintCredential('beta', beta.accessJwt, space)
const betaGet = await credRead('beta', betaCred, 'com.atproto.space.getRecord', { space, repo: alpha.did, collection: WATCH_COLLECTION, rkey: 'alpha-watch-1' }, 'getRecord alpha repo (credential)')
assert('beta reads alpha record intact', JSON.stringify(betaGet.body?.value) === JSON.stringify(alphaRec), betaGet.body?.value)
assert('round-tripped cid matches create', betaGet.body?.cid === write.body?.cid, { got: betaGet.body?.cid, want: write.body?.cid })
const betaList = await credRead('beta', betaCred, 'com.atproto.space.listRecords', { space, repo: alpha.did, collection: WATCH_COLLECTION }, 'listRecords alpha repo (credential)')
assert('listRecords sees alpha record', (betaList.body?.records || []).some((r) => r.rkey === 'alpha-watch-1'), betaList.body?.records)

// 6. beta writes into its OWN space-repo; alpha reads it back
const betaRec = { $type: WATCH_COLLECTION, tmdbId: 1891, watchedAt: '2026-08-17T22:00:00.000Z', note: 'member write into betas own space-repo' }
const betaWrite = await xrpc('POST', 'com.atproto.space.createRecord', {
  body: { space, repo: beta.did, collection: WATCH_COLLECTION, rkey: 'beta-watch-1', record: betaRec }, headers: authB, note: '[beta] createRecord (own repo)',
})
const betaUri = betaWrite.body.uri
assert('beta record uri contains beta did', !!betaUri && betaUri.includes(beta.did), betaUri)
const alphaCred = await mintCredential('alpha', alpha.accessJwt, space)
const alphaGet = await credRead('alpha', alphaCred, 'com.atproto.space.getRecord', { space, repo: beta.did, collection: WATCH_COLLECTION, rkey: 'beta-watch-1' }, 'getRecord beta repo (credential)')
assert('alpha reads beta record intact', JSON.stringify(alphaGet.body?.value) === JSON.stringify(betaRec), alphaGet.body?.value)
assert('alpha-read beta cid matches beta create', alphaGet.body?.cid === betaWrite.body?.cid, { got: alphaGet.body?.cid, want: betaWrite.body?.cid })

// 8. listSpaces as alpha
const listSpacesA = await xrpc('GET', 'com.atproto.space.listSpaces', { headers: authA, note: '[alpha] listSpaces' })
assert('alpha listSpaces contains the space', (listSpacesA.body?.spaces || []).some((s) => s.uri === space), listSpacesA.body?.spaces)
// bonus: beta wrote too, so it should show for beta
const listSpacesB = await xrpc('GET', 'com.atproto.space.listSpaces', { headers: authB, note: '[beta] listSpaces' })
assert('beta listSpaces contains the space (beta wrote to it)', (listSpacesB.body?.spaces || []).some((s) => s.uri === space), listSpacesB.body?.spaces)

// ---- output -----------------------------------------------------------------
const out = {
  accounts: {
    alpha: { handle: alpha.handle, did: alpha.did, email: alpha.email, password: alpha.password },
    beta: { handle: beta.handle, did: beta.did, email: beta.email, password: beta.password },
  },
  spaceUri: space,
  records: { alpha: { uri: alphaUri, cid: write.body?.cid, validationStatus: write.body?.validationStatus }, beta: { uri: betaUri, cid: betaWrite.body?.cid, validationStatus: betaWrite.body?.validationStatus } },
  assertions,
  trace,
}
writeFileSync('/private/tmp/claude-501/-Users-sim-workspace/004f1b09-319e-441e-a075-017e4e61223c/scratchpad/spike_result.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify({ accounts: out.accounts, spaceUri: space, records: out.records, assertions }, null, 2))
console.log('\n--- full trace written to spike_result.json ---')
