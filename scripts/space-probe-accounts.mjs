#!/usr/bin/env node
// Creates the two throwaway accounts scripts/space-probe.mjs logs in with, and
// appends their credentials to one or more env files as
//   SPACE_PROBE_A_IDENTIFIER / SPACE_PROBE_A_PASSWORD
//   SPACE_PROBE_B_IDENTIFIER / SPACE_PROBE_B_PASSWORD
//
// Run it yourself in a terminal (it asks for the PDS admin password, hidden):
//   node scripts/space-probe-accounts.mjs [envfile ...]
// Default env file: .env.local next to this repo's package.json.
//
// The admin password is only used to mint two single-use invite codes; it is
// never written anywhere. Set PDS_ADMIN_PASSWORD to skip the prompt. Account
// passwords are random, never printed, and are full passwords on purpose:
// app passwords cannot use spaces.
//
// Optional: SPACE_PROBE_PDS (default https://pds.sims.computer).
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PDS = (process.env.SPACE_PROBE_PDS || 'https://pds.sims.computer').replace(/\/$/, '')
// The PDS sits behind Cloudflare, which rejects some default client UAs.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const KEYS = ['SPACE_PROBE_A_IDENTIFIER', 'SPACE_PROBE_A_PASSWORD', 'SPACE_PROBE_B_IDENTIFIER', 'SPACE_PROBE_B_PASSWORD']

const here = dirname(fileURLToPath(import.meta.url))
const envFiles = (process.argv.slice(2).length ? process.argv.slice(2) : [resolve(here, '..', '.env.local')]).map((p) => resolve(p))

function die(msg) {
  console.error(`space-probe-accounts: ${msg}`)
  process.exit(1)
}

for (const f of envFiles) {
  if (!existsSync(f)) die(`${f} does not exist`)
  const text = readFileSync(f, 'utf8')
  const present = KEYS.filter((k) => new RegExp(`^${k}=`, 'm').test(text))
  if (present.length) die(`${f} already has ${present.join(', ')}; remove those lines first if you want new accounts`)
}

function promptHidden(label) {
  return new Promise((done) => {
    const { stdin, stderr } = process
    if (!stdin.isTTY) die('no terminal to ask for the admin password; run this in a terminal or set PDS_ADMIN_PASSWORD')
    stderr.write(label)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let buf = ''
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          stderr.write('\n')
          return done(buf)
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false)
          stderr.write('\n')
          process.exit(130)
        }
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1)
        else buf += ch
      }
    }
    stdin.on('data', onData)
  })
}

async function xrpc(nsid, body, headers = {}) {
  const res = await fetch(`${PDS}/xrpc/${nsid}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA, ...headers },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 200) }
  }
  if (!res.ok) die(`${nsid} -> ${res.status} ${json.error ?? ''} ${json.message ?? json.raw ?? ''}`.trim())
  return json
}

const describe = await fetch(`${PDS}/xrpc/com.atproto.server.describeServer`, { headers: { 'user-agent': UA } }).then((r) => r.json())
const domain = describe.availableUserDomains?.[0]
if (!domain) die(`${PDS} lists no availableUserDomains`)

let admin
if (describe.inviteCodeRequired) {
  const pw = process.env.PDS_ADMIN_PASSWORD || (await promptHidden(`PDS admin password for ${PDS} (hidden): `))
  if (!pw) die('no admin password given')
  admin = { authorization: `Basic ${Buffer.from(`admin:${pw}`).toString('base64')}` }
}

const suffix = randomBytes(3).toString('hex')
const created = {}
for (const who of ['a', 'b']) {
  const handle = `tvprobe-${who}-${suffix}${domain}`
  const password = randomBytes(24).toString('base64url')
  const inviteCode = admin ? (await xrpc('com.atproto.server.createInviteCode', { useCount: 1 }, admin)).code : undefined
  const acct = await xrpc('com.atproto.server.createAccount', {
    handle,
    email: `tvprobe-${who}-${suffix}@example.com`,
    password,
    ...(inviteCode ? { inviteCode } : {}),
  })
  created[who] = { handle, password, did: acct.did }
  console.log(`created ${handle} (${acct.did})`)
}

const block =
  `\n# space-probe test accounts on ${PDS} (created ${new Date().toISOString().slice(0, 10)}; throwaway, full passwords)\n` +
  `SPACE_PROBE_A_IDENTIFIER=${created.a.handle}\n` +
  `SPACE_PROBE_A_PASSWORD=${created.a.password}\n` +
  `SPACE_PROBE_B_IDENTIFIER=${created.b.handle}\n` +
  `SPACE_PROBE_B_PASSWORD=${created.b.password}\n`
for (const f of envFiles) {
  appendFileSync(f, block)
  console.log(`wrote credentials to ${f}`)
}
console.log('done. next: node --env-file=.env.local scripts/space-probe.mjs')
