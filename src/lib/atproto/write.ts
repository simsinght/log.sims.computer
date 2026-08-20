/**
 * The single write interface for tvlog records. Every create/put/delete/batch
 * write to a repo goes through here with a WriteDestination, so a record type
 * (e.g. computer.sims.log.watch) can be written to the user's public repo
 * (com.atproto.repo.*) or into a permissioned space (com.atproto.space.*)
 * without the call site knowing which.
 *
 * Private is a location, not a schema: the same record shapes go either way.
 * Self-ops (writing/reading your OWN repo, in a space or not) use the user's
 * normal Bearer session — no DPoP/credential dance. Cross-member reads need the
 * credential flow, which is a later slice and deliberately not built here.
 *
 * All space URI handling lives in ./space-uri — this module never string-munges
 * a space URI itself.
 */
import type { Agent } from "@atproto/api";
// Relative path + .ts extension (not the @/ alias) so the importer's CLI, run
// by Node's native TS strip-types, can resolve this module too.
import {
  normalizeSpaceUri,
  parseSpaceUri,
  formatSpaceRecordUri,
} from "./space-uri.ts";

export type WriteDestination =
  | { kind: "publicRepo" }
  | { kind: "space"; spaceUri: string };

export const PUBLIC_REPO: WriteDestination = { kind: "publicRepo" };

// Common result across destinations. Deliberately omits commit/rev: space
// writes return none (the app trusts its own host; sync machinery is out of
// scope for v1), so the seam does not promise it for the public repo either.
export interface WriteResult {
  uri: string;
  cid: string;
  validationStatus?: string;
}

export interface WriteParams {
  repo: string;
  collection: string;
  record: Record<string, unknown>;
  rkey?: string;
  validate?: boolean;
}

export interface BatchCreate {
  collection: string;
  value: Record<string, unknown>;
  rkey?: string;
}

export async function createRecord(
  agent: Agent,
  dest: WriteDestination,
  params: WriteParams,
): Promise<WriteResult> {
  if (dest.kind === "space") {
    const res = await agent.com.atproto.space.createRecord({
      space: normalizeSpaceUri(dest.spaceUri),
      repo: params.repo,
      collection: params.collection,
      rkey: params.rkey,
      record: params.record,
      validate: params.validate,
    });
    return reshape(res.data);
  }
  const res = await agent.com.atproto.repo.createRecord({
    repo: params.repo,
    collection: params.collection,
    rkey: params.rkey,
    record: params.record,
    validate: params.validate,
  });
  return reshape(res.data);
}

export async function putRecord(
  agent: Agent,
  dest: WriteDestination,
  params: WriteParams & { rkey: string },
): Promise<WriteResult> {
  if (dest.kind === "space") {
    const res = await agent.com.atproto.space.putRecord({
      space: normalizeSpaceUri(dest.spaceUri),
      repo: params.repo,
      collection: params.collection,
      rkey: params.rkey,
      record: params.record,
      validate: params.validate,
    });
    return reshape(res.data);
  }
  const res = await agent.com.atproto.repo.putRecord({
    repo: params.repo,
    collection: params.collection,
    rkey: params.rkey,
    record: params.record,
    validate: params.validate,
  });
  return reshape(res.data);
}

export async function deleteRecord(
  agent: Agent,
  dest: WriteDestination,
  params: { repo: string; collection: string; rkey: string },
): Promise<void> {
  if (dest.kind === "space") {
    await agent.com.atproto.space.deleteRecord({
      space: normalizeSpaceUri(dest.spaceUri),
      repo: params.repo,
      collection: params.collection,
      rkey: params.rkey,
    });
    return;
  }
  await agent.com.atproto.repo.deleteRecord({
    repo: params.repo,
    collection: params.collection,
    rkey: params.rkey,
  });
}

export async function applyWritesCreate(
  agent: Agent,
  dest: WriteDestination,
  params: { repo: string; creates: BatchCreate[]; validate?: boolean },
): Promise<void> {
  if (dest.kind === "space") {
    await agent.com.atproto.space.applyWrites({
      space: normalizeSpaceUri(dest.spaceUri),
      repo: params.repo,
      validate: params.validate,
      writes: params.creates.map((c) => ({
        $type: "com.atproto.space.applyWrites#create",
        collection: c.collection,
        rkey: c.rkey,
        value: c.value,
      })) as never,
    });
    return;
  }
  await agent.com.atproto.repo.applyWrites({
    repo: params.repo,
    validate: params.validate,
    writes: params.creates.map((c) => ({
      $type: "com.atproto.repo.applyWrites#create",
      collection: c.collection,
      rkey: c.rkey,
      value: c.value,
    })) as never,
  });
}

export interface SeamRecord {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
}

// Self-read counterpart: lists records from the caller's OWN repo. In a space
// that is a plain-Bearer self-op — cross-member reads (credential flow) are a
// later slice and are NOT this function.
export async function listRecords(
  agent: Agent,
  dest: WriteDestination,
  params: { repo: string; collection: string; limit?: number; cursor?: string },
): Promise<{ records: SeamRecord[]; cursor?: string }> {
  if (dest.kind === "space") {
    const spaceUri = normalizeSpaceUri(dest.spaceUri);
    const space = parseSpaceUri(spaceUri);
    const res = await agent.com.atproto.space.listRecords({
      space: spaceUri,
      repo: params.repo,
      collection: params.collection,
      limit: params.limit,
      cursor: params.cursor,
    });
    // Space records identify by (collection, rkey); synthesize the full record
    // URI so callers get the same shape as the public repo path.
    return {
      records: res.data.records.map((r) => ({
        uri: formatSpaceRecordUri({
          ...space,
          writerDid: params.repo,
          collection: r.collection,
          rkey: r.rkey,
        }),
        cid: r.cid,
        value: (r.value ?? {}) as Record<string, unknown>,
      })),
      cursor: res.data.cursor,
    };
  }
  const res = await agent.com.atproto.repo.listRecords({
    repo: params.repo,
    collection: params.collection,
    limit: params.limit,
    cursor: params.cursor,
  });
  return {
    records: res.data.records.map((r) => ({
      uri: r.uri,
      cid: r.cid,
      value: r.value as Record<string, unknown>,
    })),
    cursor: res.data.cursor,
  };
}

function reshape(data: {
  uri: string;
  cid: string;
  validationStatus?: string;
}): WriteResult {
  return {
    uri: data.uri,
    cid: data.cid,
    validationStatus: data.validationStatus,
  };
}
