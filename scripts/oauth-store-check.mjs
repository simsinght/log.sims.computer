// Offline check for the dual-client OAuth store wiring — no live PDS, no OAuth.
// Imports the EXACT store code the clients use (src/lib/atproto/oauth-store.ts,
// via Node's native type-stripping) and asserts the two invariants the callback
// depends on: (1) both tagged state stores and the session store share ONE
// underlying map, and (2) a nonce written by a tagged store resolves back to
// that tag, single-use. Run: node scripts/oauth-store-check.mjs
import {
  taggedStateStore,
  sharedSessionStore,
  resolveClientTagFromState,
} from "../src/lib/atproto/oauth-store.ts";

const results = [];
const assert = (name, cond, detail) =>
  results.push({ name, pass: !!cond, detail });

const spaces = taggedStateStore("spaces");
const legacy = taggedStateStore("default");

const spacesValue = { iss: "https://pds.sims.computer", verifier: "v-spaces" };
const legacyValue = { iss: "https://bsky.social", verifier: "v-legacy" };

// A nonce written through the spaces wrapper is visible through the legacy
// wrapper's get -> the two share one underlying state map.
spaces.set("nonce-A", spacesValue);
legacy.set("nonce-B", legacyValue);
assert(
  "state map is shared across tagged wrappers",
  legacy.get("nonce-A") === spacesValue && spaces.get("nonce-B") === legacyValue,
  { a: legacy.get("nonce-A"), b: spaces.get("nonce-B") },
);

// The nonce -> tag side-record reflects which wrapper wrote it.
assert(
  "spaces-written nonce resolves to spaces",
  resolveClientTagFromState("nonce-A") === "spaces",
);
assert(
  "default-written nonce resolves to default",
  resolveClientTagFromState("nonce-B") === "default",
);

// Single-use: a consumed nonce falls back to default on a second read.
assert(
  "tag resolution is single-use (consumed)",
  resolveClientTagFromState("nonce-A") === "default",
);

// Unknown / absent state falls back to the legacy client.
assert(
  "unknown nonce falls back to default",
  resolveClientTagFromState("nonce-unknown") === "default",
);
assert(
  "null state falls back to default",
  resolveClientTagFromState(null) === "default",
);

// del clears BOTH the state entry and any lingering tag record.
spaces.set("nonce-C", { iss: "x", verifier: "v-c" });
legacy.del("nonce-C");
assert(
  "del clears the shared state entry",
  spaces.get("nonce-C") === undefined,
);
assert(
  "del clears the tag record",
  resolveClientTagFromState("nonce-C") === "default",
);

// Session store is shared too (keyed by DID; no per-client tagging).
const sessionA = sharedSessionStore();
const sessionB = sharedSessionStore();
const sess = { did: "did:plc:abc", tokenSet: { access_token: "t" } };
sessionA.set("did:plc:abc", sess);
assert(
  "session map is shared across instances",
  sessionB.get("did:plc:abc") === sess,
  sessionB.get("did:plc:abc"),
);
sessionB.del("did:plc:abc");
assert(
  "session del is shared",
  sessionA.get("did:plc:abc") === undefined,
);

const passed = results.filter((r) => r.pass).length;
for (const r of results) {
  console.log(
    `${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : `  ${JSON.stringify(r.detail)}`}`,
  );
}
console.log(`\n${passed}/${results.length} assertions passed`);
process.exit(passed === results.length ? 0 : 1);
