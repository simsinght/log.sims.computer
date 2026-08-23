// Offline check for the space credential DPoP logic — no live PDS, no accounts.
// Imports the EXACT proof code SpaceCredentialManager ships (src/lib/atproto/
// dpop.ts, loaded via Node's native type-stripping) and asserts the wire-shape
// invariants the credential dance depends on. Mirrors scripts/space-probe.mjs's
// structure. Run: node scripts/space-io-check.mjs
import { createHash } from "node:crypto";
import {
  generateDpopKeypair,
  dpopProof,
  credentialAth,
  jwtExpSeconds,
} from "../src/lib/atproto/dpop.ts";

const PDS = "https://pds.sims.computer";
const EXCHANGE = `${PDS}/xrpc/com.atproto.space.getSpaceCredential`;
const READ = `${PDS}/xrpc/com.atproto.space.getRecord`;
// A stand-in credential string; the flow never inspects its contents, only its
// SHA-256, so any stable string exercises the ath binding.
const CREDENTIAL = "eyJhbGciOiJFUzI1NiJ9.fake-space-credential.sig";

const results = [];
const assert = (name, cond, detail) =>
  results.push({ name, pass: !!cond, detail });

function decode(jwt) {
  const [h, p] = jwt.split(".");
  return {
    header: JSON.parse(Buffer.from(h, "base64url").toString("utf8")),
    payload: JSON.parse(Buffer.from(p, "base64url").toString("utf8")),
  };
}

const key = await generateDpopKeypair();

// The exchange proof (POST getSpaceCredential): NO ath, htm POST, htu the bare
// endpoint.
const exchange = decode(await dpopProof(key, "POST", EXCHANGE));
assert("exchange proof omits ath", exchange.payload.ath === undefined, exchange.payload);
assert("exchange htm is POST", exchange.payload.htm === "POST");
assert("exchange htu is origin+pathname", exchange.payload.htu === EXCHANGE);
assert("header alg ES256 / typ dpop+jwt", exchange.header.alg === "ES256" && exchange.header.typ === "dpop+jwt", exchange.header);
assert(
  "header carries bare public jwk (crv/kty/x/y)",
  exchange.header.jwk &&
    exchange.header.jwk.crv === "P-256" &&
    exchange.header.jwk.kty === "EC" &&
    typeof exchange.header.jwk.x === "string" &&
    typeof exchange.header.jwk.y === "string" &&
    exchange.header.jwk.d === undefined,
  exchange.header.jwk,
);

// A read proof (GET, with credential): ath present and equal to
// base64url(sha256(credential)); htm GET; htu strips the query string.
const readProof = decode(await dpopProof(key, "GET", `${READ}?space=x&repo=y`, CREDENTIAL));
const expectedAth = createHash("sha256").update(CREDENTIAL).digest("base64url");
assert("read proof includes ath", typeof readProof.payload.ath === "string", readProof.payload);
assert("read ath == base64url(sha256(credential))", readProof.payload.ath === expectedAth, {
  got: readProof.payload.ath,
  want: expectedAth,
});
assert("credentialAth() matches recomputed sha256", (await credentialAth(CREDENTIAL)) === expectedAth);
assert("read htm is GET", readProof.payload.htm === "GET");
assert("read htu drops query string", readProof.payload.htu === READ);

// jti is single-use: fresh per proof.
const a = decode(await dpopProof(key, "GET", READ, CREDENTIAL));
const b = decode(await dpopProof(key, "GET", READ, CREDENTIAL));
assert("jti differs across proofs", a.payload.jti !== b.payload.jti, {
  a: a.payload.jti,
  b: b.payload.jti,
});
assert("jti is 128-bit hex", /^[0-9a-f]{32}$/.test(a.payload.jti), a.payload.jti);
assert("iat is an integer (seconds)", Number.isInteger(a.payload.iat));

// jwtExpSeconds reads a JWT exp without verifying.
const exp = Math.floor(Date.now() / 1000) + 7200;
const fakeJwt = `x.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.y`;
assert("jwtExpSeconds reads exp", jwtExpSeconds(fakeJwt) === exp);
assert("jwtExpSeconds tolerates junk", jwtExpSeconds("not-a-jwt") === null);

const passed = results.filter((r) => r.pass).length;
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : `  ${JSON.stringify(r.detail)}`}`);
}
console.log(`\n${passed}/${results.length} assertions passed`);
process.exit(passed === results.length ? 0 : 1);
