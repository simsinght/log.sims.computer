// Publishes tvlog's lexicon documents as com.atproto.lexicon.schema records to
// the authority account's repo, so a spaces-capable PDS can resolve
// `include:computer.sims.log.permissions` (and the space type lexicons the
// consent screen renders). Modeled on bluesky-social/bulletin's
// lib/lexicon-publisher.ts, but signs in from an interactive prompt rather than
// a dev-network introspection endpoint.
//
// The password is read from stdin only — NEVER from argv or the environment —
// and is never printed or logged.
//
// Usage:
//   node scripts/publish-lexicons.mjs            # prompts, publishes for real
//   node scripts/publish-lexicons.mjs --dry-run  # no network, prints the plan
//   node scripts/publish-lexicons.mjs --dry-run --did=did:plc:abc  # real URIs
//
// Only lexicons whose NSID sits under the tvlog authority group
// (computer.sims.log.*) are published — the popfeed reference lexicons vendored
// alongside them belong to a different authority (social.popfeed.*) and must be
// published by that authority, not this account.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import readline from "node:readline";
import { resolveIdentity } from "../src/lib/atproto/identity.ts";

const LEXICON_COLLECTION = "com.atproto.lexicon.schema";
const AUTHORITY_PREFIX = "computer.sims.log.";

// The NSID authority is the DNS-ordered domain (segments minus the name,
// reversed): computer.sims.log.permissions -> log.sims.computer. This is the
// name the resolver does a TXT lookup on (_lexicon.<domain>).
function nsidAuthorityDomain(nsid) {
  return nsid.split(".").slice(0, -1).reverse().join(".");
}

async function loadOwnedLexicons(dir) {
  const docs = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const doc = JSON.parse(await readFile(join(dir, entry.name), "utf8"));
    if (typeof doc.id === "string" && doc.id.startsWith(AUTHORITY_PREFIX)) {
      docs.push(doc);
    } else {
      console.log(`skip (not under ${AUTHORITY_PREFIX}*): ${entry.name}`);
    }
  }
  return docs.sort((a, b) => a.id.localeCompare(b.id));
}

async function xrpc(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(
      `${url} failed (${response.status}): ${await response.text()}`,
    );
  }
  return await response.json();
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Reads a line without echoing it to the terminal. On a non-TTY stdin (piped
// input) muting isn't possible, so it falls back to a plain read — the value is
// still never printed or logged by this script.
function promptSecret(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  let muted = false;
  const write = rl._writeToOutput?.bind(rl);
  if (process.stdin.isTTY && write) {
    rl._writeToOutput = (str) => {
      if (!muted || str.includes("\n") || str.includes("\r")) write(str);
    };
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (muted) process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function publishDoc(pdsUrl, did, accessJwt, doc) {
  const getUrl = new URL(`${pdsUrl}/xrpc/com.atproto.repo.getRecord`);
  getUrl.searchParams.set("repo", did);
  getUrl.searchParams.set("collection", LEXICON_COLLECTION);
  getUrl.searchParams.set("rkey", doc.id);
  const existing = await fetch(getUrl, {
    headers: { authorization: `Bearer ${accessJwt}` },
  });
  if (existing.ok) {
    const body = await existing.json();
    if (digest(body.value) === digest(doc)) {
      console.log(`unchanged: ${doc.id}`);
      return;
    }
  }
  await xrpc(`${pdsUrl}/xrpc/com.atproto.repo.putRecord`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessJwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      repo: did,
      collection: LEXICON_COLLECTION,
      rkey: doc.id,
      record: doc,
    }),
  });
  console.log(`published: ${doc.id}`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const didArg = process.argv
    .find((a) => a.startsWith("--did="))
    ?.slice("--did=".length);

  const docs = await loadOwnedLexicons(join(process.cwd(), "lexicons"));
  if (docs.length === 0) {
    throw new Error(`No lexicons under ${AUTHORITY_PREFIX}* found in ./lexicons`);
  }

  const domains = new Set(docs.map((d) => nsidAuthorityDomain(d.id)));
  if (domains.size !== 1) {
    throw new Error(
      `Owned lexicons resolve to more than one DNS authority: ${[...domains].join(", ")}`,
    );
  }
  const domain = [...domains][0];

  console.log(`Lexicons to publish (${docs.length}):`);
  for (const doc of docs) console.log(`  - ${doc.id}`);

  let did;
  if (dryRun) {
    did = didArg ?? "did:plc:DRYRUNxxxxxxxxxxxxxxxxxxxx";
    console.log(`\n[dry-run] no network calls; authority DID = ${did}`);
    for (const doc of docs) {
      console.log(`[dry-run] would putRecord ${LEXICON_COLLECTION}/${doc.id}`);
    }
  } else {
    const handle = await prompt("Authority handle (e.g. sims.computer): ");
    if (!handle) throw new Error("A handle is required.");
    const password = await promptSecret("App password (input hidden): ");
    if (!password) throw new Error("An app password is required.");

    const { pdsUrl } = await resolveIdentity(handle);
    const login = await xrpc(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: handle, password }),
    });
    const accessJwt = String(login.accessJwt);
    did = String(login.did);
    console.log(`\nSigned in as ${did} on ${pdsUrl}`);

    for (const doc of docs) {
      await publishDoc(pdsUrl, did, accessJwt, doc);
    }
  }

  console.log("\nRecord URIs:");
  for (const doc of docs) {
    console.log(`  at://${did}/${LEXICON_COLLECTION}/${doc.id}`);
  }

  console.log("\nDNS TXT record the authority owner must create:");
  console.log(`  Name:  _lexicon.${domain}`);
  console.log(`  Type:  TXT`);
  console.log(`  Value: did=${did}`);
  console.log(
    `\nVerify after DNS propagates:\n  dig +short TXT _lexicon.${domain}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
