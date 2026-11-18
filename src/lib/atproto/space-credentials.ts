/**
 * SpaceCredentialManager — cross-member reads of another writer's space-repo.
 * The alpha `@atproto/api` gives typed `com.atproto.space.*` methods but does
 * not obtain, cache, or present space credentials; this module does, using
 * `@atproto/space` for the request signature and `@atproto/crypto` for keys.
 *
 * Flow (12/13 Nov 2026 spaces API):
 *   1. getDelegationToken — on the user's own PDS, with the user's session.
 *   2. authorizeSpaceSync — on the space AUTHORITY's PDS, unauthenticated: the
 *      delegation token and a fresh P-256 did:key (`credentialKey`) go in the
 *      body. Returns a credential bound to that key (`cnf.kid`), ~600 s life.
 *   3. Credentialed reads — on the WRITER's PDS, with
 *        Authorization: Atproto-Space-Credential <credential>
 *        Atproto-Space-Audience: <writer DID>
 *      plus an RFC 9421 signature over both, made with the credential's key
 *      (createSpaceSigHeaders).
 *
 * Only listRecords is used, and it carries no MAC, so there is no HPKE/MAC
 * verification here. getRecord/getRepo/listRepoOps reads with a credential
 * would need MAC verification (@atproto/space verifyRecordMac etc.) first.
 *
 * Why session-less "bare" agents for steps 2-3: the logged-in agent's fetch
 * handler owns the Authorization header (the OAuth session unconditionally
 * re-sets it), which would clobber the credential. A session-less AtpAgent adds
 * no auth of its own, so the injected headers pass through intact.
 *
 * Reading your OWN space-repo is a plain session self-op and goes through the
 * write.ts seam, not this manager.
 */
import { AtpAgent, type Agent } from "@atproto/api";
import { P256Keypair } from "@atproto/crypto";
import { createSpaceSigHeaders } from "@atproto/space";
import {
  formatSpaceRecordUri,
  normalizeSpaceUri,
  parseSpaceUri,
} from "@/lib/atproto/space-uri";
import { resolveIdentity } from "@/lib/atproto/identity";

type AudienceDid = Parameters<typeof createSpaceSigHeaders>[0]["audience"];

// Evict this far before the credential's own `exp` so an in-flight request
// never races the expiry. Credentials default to 600 s.
const SAFETY_MARGIN_MS = 60 * 1000;
// Used only if a credential's `exp` can't be read: assume well under the
// 600 s default rather than over it.
const FALLBACK_TTL_MS = 4 * 60 * 1000;
// DID -> PDS URL. Short-lived: a PDS move is rare, and a stale entry only costs
// failed reads until it expires.
const PDS_TTL_MS = 10 * 60 * 1000;

interface CachedCredential {
  credential: string;
  // Each credential is bound to its own fresh key (cnf.kid); requests made with
  // the credential are signed with it.
  keypair: P256Keypair;
  expiresAtMs: number;
}

// Per-session (keyed by the user's DID) credential cache, keyed by space URI.
// Held in module memory, not the session cookie: a private key must not ride
// in a cookie. A restart or a second instance just re-mints (cheap).
const sessions = new Map<string, Map<string, CachedCredential>>();
const pdsCache = new Map<string, { url: string; expiresAtMs: number }>();

function credentialsFor(sessionDid: string): Map<string, CachedCredential> {
  let m = sessions.get(sessionDid);
  if (!m) {
    m = new Map();
    sessions.set(sessionDid, m);
  }
  return m;
}

async function pdsUrlFor(did: string): Promise<string> {
  const hit = pdsCache.get(did);
  if (hit && hit.expiresAtMs > Date.now()) return hit.url;
  const url = (await resolveIdentity(did)).pdsUrl;
  pdsCache.set(did, { url, expiresAtMs: Date.now() + PDS_TTL_MS });
  return url;
}

const bareAgents = new Map<string, AtpAgent>();
function bareAgent(service: string): AtpAgent {
  let a = bareAgents.get(service);
  if (!a) {
    a = new AtpAgent({ service });
    bareAgents.set(service, a);
  }
  return a;
}

// Read a JWT's `exp` (seconds) without verifying it — only to schedule cache
// eviction, never to trust the token.
function jwtExpSeconds(jwt: string): number | null {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

// The read errors that mean "this credential is no good, re-mint once": an
// outright 401, an invalid/expired token, or a revoked credential.
function isInvalidCredential(err: unknown): boolean {
  const e = err as { status?: number; error?: string; message?: string };
  if (e?.status === 401) return true;
  const text = `${e?.error ?? ""} ${e?.message ?? ""}`.toLowerCase();
  return /invalidtoken|expiredtoken|credentialrevoked/.test(text);
}

// A writer the member list names but who has never written to the space has no
// space-repo yet; treat that as empty rather than failing the whole sweep.
function isRepoNotFound(err: unknown): boolean {
  return (err as { error?: string })?.error === "RepoNotFound";
}

export interface SpaceRecord {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
}

export class SpaceCredentialManager {
  private constructor(
    private readonly sessionAgent: Agent,
    private readonly sessionDid: string,
  ) {}

  static async create(
    sessionAgent: Agent,
    sessionDid: string,
  ): Promise<SpaceCredentialManager> {
    return new SpaceCredentialManager(sessionAgent, sessionDid);
  }

  // getDelegationToken (user session, own PDS) -> authorizeSpaceSync (bare,
  // authority's PDS, token + fresh credential key in the body).
  private async mint(spaceUri: string): Promise<CachedCredential> {
    const dt = await this.sessionAgent.com.atproto.space.getDelegationToken({
      space: spaceUri,
    });
    const delegationToken = dt.data.token;
    if (!delegationToken) throw new Error("getDelegationToken returned no token");

    const keypair = await P256Keypair.create();
    const authorityPds = await pdsUrlFor(parseSpaceUri(spaceUri).authority);
    const res = await bareAgent(
      authorityPds,
    ).com.atproto.space.authorizeSpaceSync({
      space: spaceUri,
      credentialKey: keypair.did(),
      delegationToken,
    });
    const credential = res.data.credential;
    if (!credential) throw new Error("authorizeSpaceSync returned no credential");

    const exp = jwtExpSeconds(credential);
    const expiresAtMs =
      (exp != null ? exp * 1000 : Date.now() + FALLBACK_TTL_MS) -
      SAFETY_MARGIN_MS;
    return { credential, keypair, expiresAtMs };
  }

  private async credentialFor(
    spaceUri: string,
    forceRefresh = false,
  ): Promise<CachedCredential> {
    const cache = credentialsFor(this.sessionDid);
    const cached = cache.get(spaceUri);
    if (!forceRefresh && cached && cached.expiresAtMs > Date.now()) {
      return cached;
    }
    cache.delete(spaceUri);
    const fresh = await this.mint(spaceUri);
    cache.set(spaceUri, fresh);
    return fresh;
  }

  // Run a credentialed read against `writerDid`'s PDS with the credential,
  // audience and signature headers. On an invalid-credential response: drop
  // the cache, re-mint once, retry once.
  private async credRead<T>(
    spaceUri: string,
    writerDid: string,
    call: (agent: AtpAgent, headers: Record<string, string>) => Promise<T>,
  ): Promise<T> {
    const agent = bareAgent(await pdsUrlFor(writerDid));
    const headersFor = async (c: CachedCredential) =>
      (
        await createSpaceSigHeaders({
          authorization: `Atproto-Space-Credential ${c.credential}`,
          audience: writerDid as AudienceDid,
          keypair: c.keypair,
        })
      ).headers;

    let cred = await this.credentialFor(spaceUri);
    try {
      return await call(agent, await headersFor(cred));
    } catch (err) {
      if (!isInvalidCredential(err)) throw err;
      cred = await this.credentialFor(spaceUri, true);
      return await call(agent, await headersFor(cred));
    }
  }

  async listRecords(
    spaceUri: string,
    repo: string,
    params: { collection: string; limit?: number; cursor?: string },
  ): Promise<{ records: SpaceRecord[]; cursor?: string }> {
    const space = normalizeSpaceUri(spaceUri);
    const parts = parseSpaceUri(space);
    let res;
    try {
      res = await this.credRead(space, repo, (agent, headers) =>
        agent.com.atproto.space.listRecords(
          {
            space,
            repo,
            collection: params.collection,
            limit: params.limit,
            cursor: params.cursor,
          },
          { headers },
        ),
      );
    } catch (err) {
      if (isRepoNotFound(err)) return { records: [] };
      throw err;
    }
    return {
      records: res.data.records.map((r) => ({
        uri: formatSpaceRecordUri({
          ...parts,
          writerDid: repo,
          collection: r.collection,
          rkey: r.rkey,
        }),
        cid: r.cid,
        value: (r.value ?? {}) as Record<string, unknown>,
      })),
      cursor: res.data.cursor,
    };
  }
}
