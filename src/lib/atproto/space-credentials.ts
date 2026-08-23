/**
 * SpaceCredentialManager — the hybrid the SDK evaluation (docs/plans/
 * spaces-sdk-eval.md) called for. The alpha `@atproto/api` gives typed
 * `com.atproto.space.*` methods but does NONE of the security-critical dance:
 * no delegation-token -> credential exchange, no DPoP proof generation, no
 * credential caching. This module ports scripts/space-probe.mjs's flow into
 * typed app code and feeds the resulting `authorization`/`dpop` headers into
 * the alpha's typed read methods via their `opts.headers`.
 *
 * Why a session-less "bare" agent for the credentialed calls: the logged-in
 * agent's fetch handler owns the Authorization header. The OAuth session
 * *unconditionally* re-sets it to the user's token (oauth-session.js), which
 * would clobber our `DPoP <credential>`. A session-less AtpAgent adds no auth
 * of its own (atp-agent.js only sets Authorization when it holds a session
 * token AND the request has none), so our injected headers pass through intact
 * — while still going out through the alpha's typed methods and matching URLs.
 *
 * Only cross-member reads live here. Reading your OWN space-repo is a plain
 * Bearer self-op and goes through the write.ts seam, not this manager.
 */
import { AtpAgent, type Agent } from "@atproto/api";
import {
  dpopProof,
  generateDpopKeypair,
  jwtExpSeconds,
  type DpopKeypair,
} from "@/lib/atproto/dpop";
import {
  formatSpaceRecordUri,
  normalizeSpaceUri,
  parseSpaceUri,
} from "@/lib/atproto/space-uri";
import { resolveIdentity } from "@/lib/atproto/identity";

// Credentials live ~2h; evict this far before the JWT's own `exp` so an
// in-flight request never races the expiry.
const SAFETY_MARGIN_MS = 5 * 60 * 1000;
// Used only if a credential's `exp` can't be read — err short, not long.
const FALLBACK_TTL_MS = 110 * 60 * 1000;

interface CachedCredential {
  credential: string;
  expiresAtMs: number;
}

// Per-session (keyed by the user's DID) state: ONE DPoP keypair — every
// credential this session mints is bound to it via cnf.jkt — plus the resolved
// PDS URL and a per-space credential cache. Held in module memory rather than
// the session cookie: an iron-session cookie can't carry a CryptoKey, and a
// non-extractable in-memory key is strictly safer than serializing a private
// JWK into a cookie sent on every request. Tradeoff: the cache is per-process,
// so a server restart or a second instance just re-mints (cheap, self-healing);
// horizontal scaling would want sticky sessions or a shared store — follow-up.
interface SessionCredState {
  keypair: DpopKeypair;
  pdsUrl?: string;
  credentials: Map<string, CachedCredential>;
}

const sessions = new Map<string, SessionCredState>();

async function getSessionState(sessionDid: string): Promise<SessionCredState> {
  let state = sessions.get(sessionDid);
  if (!state) {
    state = { keypair: await generateDpopKeypair(), credentials: new Map() };
    sessions.set(sessionDid, state);
  }
  return state;
}

// The credential/read errors that mean "this credential is no good, re-mint":
// an outright 401, or the token-rejection error names the PDS surfaces.
function isInvalidCredential(err: unknown): boolean {
  const e = err as { status?: number; error?: string; message?: string };
  if (e?.status === 401) return true;
  const text = `${e?.error ?? ""} ${e?.message ?? ""}`.toLowerCase();
  return /invalidtoken|expiredtoken|invalidcredential|notauthorized|badjwt|invaliddpopproof|use_dpop_nonce/.test(
    text,
  );
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
    private readonly pdsUrl: string,
    // Session-less agent: pass-through for our injected auth/dpop headers.
    private readonly bare: AtpAgent,
    private readonly keypair: DpopKeypair,
  ) {}

  static async create(
    sessionAgent: Agent,
    sessionDid: string,
  ): Promise<SpaceCredentialManager> {
    const state = await getSessionState(sessionDid);
    state.pdsUrl ??= (await resolveIdentity(sessionDid)).pdsUrl;
    const bare = new AtpAgent({ service: state.pdsUrl });
    return new SpaceCredentialManager(
      sessionAgent,
      sessionDid,
      state.pdsUrl,
      bare,
      state.keypair,
    );
  }

  private endpoint(nsid: string): string {
    return `${this.pdsUrl}/xrpc/${nsid}`;
  }

  // getDelegationToken (user session auth) -> getSpaceCredential (Bearer the
  // delegation token + a DPoP proof that OMITS `ath`). The delegation call goes
  // through the logged-in agent so it carries the user's real auth; the
  // exchange goes through the bare agent so our injected headers survive.
  private async mint(spaceUri: string): Promise<string> {
    const dt = await this.sessionAgent.com.atproto.space.getDelegationToken({
      space: spaceUri,
    });
    const token = dt.data.token;
    if (!token) throw new Error("getDelegationToken returned no token");

    const proof = await dpopProof(
      this.keypair,
      "POST",
      this.endpoint("com.atproto.space.getSpaceCredential"),
    );
    const ex = await this.bare.com.atproto.space.getSpaceCredential(
      { space: spaceUri },
      { headers: { authorization: `Bearer ${token}`, dpop: proof } },
    );
    const credential = ex.data.credential;
    if (!credential) throw new Error("getSpaceCredential returned no credential");
    return credential;
  }

  private async credentialFor(
    spaceUri: string,
    forceRefresh = false,
  ): Promise<string> {
    const state = await getSessionState(this.sessionDid);
    const cached = state.credentials.get(spaceUri);
    if (!forceRefresh && cached && cached.expiresAtMs > Date.now()) {
      return cached.credential;
    }
    state.credentials.delete(spaceUri);
    const credential = await this.mint(spaceUri);
    const exp = jwtExpSeconds(credential);
    const expiresAtMs =
      (exp != null ? exp * 1000 : Date.now() + FALLBACK_TTL_MS) -
      SAFETY_MARGIN_MS;
    state.credentials.set(spaceUri, { credential, expiresAtMs });
    return credential;
  }

  // Run a credentialed GET, attaching `authorization: DPoP <cred>` plus a fresh
  // proof (new jti, `ath` bound to the credential). On an invalid-credential
  // response: drop the cache, re-mint once, retry once.
  private async credRead<T>(
    spaceUri: string,
    nsid: string,
    call: (headers: { authorization: string; dpop: string }) => Promise<T>,
  ): Promise<T> {
    const htu = this.endpoint(nsid);
    const headersFor = async (credential: string) => ({
      authorization: `DPoP ${credential}`,
      dpop: await dpopProof(this.keypair, "GET", htu, credential),
    });

    let credential = await this.credentialFor(spaceUri);
    try {
      return await call(await headersFor(credential));
    } catch (err) {
      if (!isInvalidCredential(err)) throw err;
      credential = await this.credentialFor(spaceUri, true);
      return await call(await headersFor(credential));
    }
  }

  async getRecord(
    spaceUri: string,
    repo: string,
    collection: string,
    rkey: string,
  ): Promise<SpaceRecord> {
    const space = normalizeSpaceUri(spaceUri);
    const res = await this.credRead(
      space,
      "com.atproto.space.getRecord",
      (headers) =>
        this.bare.com.atproto.space.getRecord(
          { space, repo, collection, rkey },
          { headers },
        ),
    );
    const parts = parseSpaceUri(space);
    return {
      uri: formatSpaceRecordUri({ ...parts, writerDid: repo, collection, rkey }),
      cid: res.data.cid,
      value: (res.data.value ?? {}) as Record<string, unknown>,
    };
  }

  async listRecords(
    spaceUri: string,
    repo: string,
    params: { collection: string; limit?: number; cursor?: string },
  ): Promise<{ records: SpaceRecord[]; cursor?: string }> {
    const space = normalizeSpaceUri(spaceUri);
    const parts = parseSpaceUri(space);
    const res = await this.credRead(
      space,
      "com.atproto.space.listRecords",
      (headers) =>
        this.bare.com.atproto.space.listRecords(
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
