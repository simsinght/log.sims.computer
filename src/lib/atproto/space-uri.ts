/**
 * The single home for space-URI string handling. No other file may parse or
 * build these URIs — centralizing them means the unsettled `at://` vs `ats://`
 * scheme question (see docs/plans/spaces-v1.md) is a one-line change here.
 *
 * A space URI puts the authority DID and a `space` marker where a public repo
 * URI would carry a collection:
 *
 *   space:         at://<authority-did>/space/<type>/<skey>
 *   space record:  at://<authority-did>/space/<type>/<skey>/<writer-did>/<collection>/<rkey>
 *
 * Parsing accepts both `at://` and `ats://`; formatting always emits SCHEME.
 */

// Change this single constant if upstream settles on `ats://`.
export const SPACE_URI_SCHEME = "at://";

const SPACE_MARKER = "space";
const SCHEME_RE = /^ats?:\/\//;

export interface SpaceUriParts {
  authority: string;
  type: string;
  skey: string;
}

export interface SpaceRecordUriParts extends SpaceUriParts {
  writerDid: string;
  collection: string;
  rkey: string;
}

function stripScheme(uri: string): string {
  const m = SCHEME_RE.exec(uri);
  if (!m) throw new Error(`not an at:// or ats:// URI: ${uri}`);
  return uri.slice(m[0].length);
}

export function parseSpaceUri(uri: string): SpaceUriParts {
  const parts = stripScheme(uri).split("/");
  if (parts.length !== 4 || parts[1] !== SPACE_MARKER) {
    throw new Error(`not a space URI: ${uri}`);
  }
  const [authority, , type, skey] = parts;
  return { authority, type, skey };
}

export function formatSpaceUri(p: SpaceUriParts): string {
  return `${SPACE_URI_SCHEME}${p.authority}/${SPACE_MARKER}/${p.type}/${p.skey}`;
}

export function parseSpaceRecordUri(uri: string): SpaceRecordUriParts {
  const parts = stripScheme(uri).split("/");
  if (parts.length !== 7 || parts[1] !== SPACE_MARKER) {
    throw new Error(`not a space record URI: ${uri}`);
  }
  const [authority, , type, skey, writerDid, collection, rkey] = parts;
  return { authority, type, skey, writerDid, collection, rkey };
}

export function formatSpaceRecordUri(p: SpaceRecordUriParts): string {
  return `${formatSpaceUri(p)}/${p.writerDid}/${p.collection}/${p.rkey}`;
}

// Re-emit a space URI under SCHEME, accepting either scheme on input. Lets the
// seam store one canonical form regardless of what upstream handed us.
export function normalizeSpaceUri(uri: string): string {
  return formatSpaceUri(parseSpaceUri(uri));
}
