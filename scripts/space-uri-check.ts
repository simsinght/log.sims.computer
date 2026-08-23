/**
 * Standalone round-trip checks for src/lib/atproto/space-uri.ts.
 * No test framework: run with `node scripts/space-uri-check.ts` (Node's native
 * TS strip-types). Exits non-zero on the first failed assertion.
 */
import {
  SPACE_URI_SCHEME,
  parseSpaceUri,
  formatSpaceUri,
  parseSpaceRecordUri,
  formatSpaceRecordUri,
  normalizeSpaceUri,
} from "../src/lib/atproto/space-uri.ts";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail === undefined ? "" : ` :: ${JSON.stringify(detail)}`}`);
  }
}

const AUTH = "did:plc:alpha123";
const WRITER = "did:plc:beta456";
const spaceUri = `${SPACE_URI_SCHEME}${AUTH}/space/computer.sims.watchClub/watch-club`;
const recordUri = `${spaceUri}/${WRITER}/computer.sims.log.watch/rkey-1`;

// space URI parse -> format round trip
const sp = parseSpaceUri(spaceUri);
check("space parse authority", sp.authority === AUTH, sp);
check("space parse type", sp.type === "computer.sims.watchClub", sp);
check("space parse skey", sp.skey === "watch-club", sp);
check("space format round-trips", formatSpaceUri(sp) === spaceUri, formatSpaceUri(sp));

// record URI parse -> format round trip
const rp = parseSpaceRecordUri(recordUri);
check("record parse writerDid", rp.writerDid === WRITER, rp);
check("record parse collection", rp.collection === "computer.sims.log.watch", rp);
check("record parse rkey", rp.rkey === "rkey-1", rp);
check("record format round-trips", formatSpaceRecordUri(rp) === recordUri, formatSpaceRecordUri(rp));

// both schemes accepted on parse; at:// emitted
const atsUri = `ats://${AUTH}/space/computer.sims.watchClub/watch-club`;
check("ats:// parses", parseSpaceUri(atsUri).authority === AUTH);
check("normalize ats:// -> at://", normalizeSpaceUri(atsUri) === spaceUri, normalizeSpaceUri(atsUri));
check("normalize is idempotent", normalizeSpaceUri(spaceUri) === spaceUri, normalizeSpaceUri(spaceUri));

// malformed inputs throw
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}
check("rejects non-at URI", throws(() => parseSpaceUri("https://example.com/space/x/y")));
check("rejects missing space marker", throws(() => parseSpaceUri(`${SPACE_URI_SCHEME}${AUTH}/repo/x/y`)));
check("rejects record URI as space URI", throws(() => parseSpaceUri(recordUri)));
check("rejects space URI as record URI", throws(() => parseSpaceRecordUri(spaceUri)));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
