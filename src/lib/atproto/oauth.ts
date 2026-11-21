import { NodeOAuthClient } from "@atproto/oauth-client-node";
import { JoseKey } from "@atproto/jwk-jose";
import { BASE_URL } from "@/config/baseUrl";
import path from "node:path";
import {
  dataDir,
  openKeyValueMap,
  readJsonFile,
  writeFileAtomic,
} from "@/lib/durableStore";
import {
  resolveClientTagFromState,
  setSessionBackend,
  sharedSessionStore,
  taggedStateStore,
  type OAuthClientTag,
} from "@/lib/atproto/oauth-store";

export type { OAuthClientTag };
export { resolveClientTagFromState };

export const OAUTH_SCOPE = "atproto transition:generic";

// The spaces client's scope. It drops transition:generic (which grants no space
// access at all — see docs/plans/spaces-oauth-scopes.md) in favour of the
// granular grants a spaces-capable account needs:
//   - include:computer.sims.log.permissions — the diary + shared-watchlist
//     space grants, resolved from the published permission set.
//   - repo:social.popfeed.feed.list / .listItem — the public "shelf" cards a
//     spaces account still writes to its public repo.
//   - blob accept=image/... — the poster blobs uploaded alongside those cards.
// Reads of public repo data aren't scope-gated, so no repo read grant is needed.
export const SPACES_OAUTH_SCOPE =
  "atproto include:computer.sims.log.permissions repo:social.popfeed.feed.list repo:social.popfeed.feed.listItem blob?accept=image/jpeg&accept=image/png&accept=image/webp";

const HANDLE_RESOLVER = "https://bsky.social";

// OAuthClientTag ("default" | "spaces") is defined in ./oauth-store and
// re-exported above. It records which client a session was created with, so
// getAuthedAgent restores with the same client_id the token was issued to.

function metadataFor(tag: OAuthClientTag): { path: string; scope: string } {
  return tag === "spaces"
    ? { path: "spaces-client-metadata.json", scope: SPACES_OAUTH_SCOPE }
    : { path: "client-metadata.json", scope: OAUTH_SCOPE };
}

function buildMetadata(tag: OAuthClientTag, baseUrl: string) {
  const base = baseUrl.replace(/\/$/, "");
  const { path, scope } = metadataFor(tag);
  return {
    client_id: `${base}/api/auth/${path}`,
    client_name: "tvlog",
    client_uri: base,
    redirect_uris: [`${base}/api/auth/callback`] as [string, ...string[]],
    scope,
    grant_types: ["authorization_code", "refresh_token"] as [
      "authorization_code",
      "refresh_token",
    ],
    response_types: ["code"] as ["code"],
    application_type: "web" as const,
    token_endpoint_auth_method: "private_key_jwt" as const,
    token_endpoint_auth_signing_alg: "ES256",
    dpop_bound_access_tokens: true,
    jwks_uri: `${base}/api/auth/jwks.json`,
  };
}

export function clientMetadata(baseUrl: string = BASE_URL) {
  return buildMetadata("default", baseUrl);
}

// Second client for spaces-capable PDSes. Shares the jwks/callback with the
// legacy client but declares the granular spaces scope; bsky.social logins never
// see this metadata (see the login route's PDS-based routing).
export function spacesClientMetadata(baseUrl: string = BASE_URL) {
  return buildMetadata("spaces", baseUrl);
}

interface OAuthGlobals {
  keyPromise?: Promise<JoseKey>;
  clientPromises?: Partial<Record<OAuthClientTag, Promise<NodeOAuthClient>>>;
}

const globals = globalThis as typeof globalThis & {
  __atprotoOAuth?: OAuthGlobals;
};
globals.__atprotoOAuth ??= {};
const store = globals.__atprotoOAuth;

const SIGNING_KID = "log-sims-oauth";
const SIGNING_KEY_FILE = "oauth-signing-key.json";

// The confidential client's private_key_jwt key. The authorization server ties
// every refresh token to the key that obtained it, so a key regenerated on
// boot (the old behaviour) breaks every session's next refresh even if the
// session store survived. With TVLOG_DATA_DIR set the key is generated once
// and kept in the data dir; without it, a fresh key per process as before.
async function loadOrCreateSigningKey(): Promise<JoseKey> {
  const dir = dataDir();
  if (!dir) return JoseKey.generate(["ES256"], SIGNING_KID);

  const file = path.join(dir, SIGNING_KEY_FILE);
  const saved = readJsonFile<Record<string, unknown>>(file);
  if (saved) {
    try {
      return await JoseKey.fromJWK(saved, SIGNING_KID);
    } catch {
      console.error("[oauth] stored signing key unusable; generating a new one");
    }
  }
  const key = await JoseKey.generate(["ES256"], SIGNING_KID);
  try {
    writeFileAtomic(file, JSON.stringify(key.privateJwk));
  } catch (err) {
    console.error("[oauth] could not persist signing key; it will change on restart", {
      code: (err as { code?: string })?.code,
    });
  }
  return key;
}

function getSigningKey(): Promise<JoseKey> {
  store.keyPromise ??= loadOrCreateSigningKey();
  return store.keyPromise;
}

export async function getPublicJwks() {
  const key = await getSigningKey();
  return { keys: [key.publicJwk] };
}

async function buildClient(tag: OAuthClientTag): Promise<NodeOAuthClient> {
  const key = await getSigningKey();
  // Durable (file-backed) when TVLOG_DATA_DIR is set, else in memory. Installed
  // once; both clients then share it.
  setSessionBackend(() => openKeyValueMap("oauth-sessions"));
  return new NodeOAuthClient({
    clientMetadata: tag === "spaces" ? spacesClientMetadata() : clientMetadata(),
    keyset: [key],
    handleResolver: HANDLE_RESOLVER,
    // Both clients share ONE underlying state map and ONE session map (via the
    // globalThis singletons in ./oauth-store). The state store is wrapped per
    // client so it records this flow's nonce -> tag, letting the callback restore
    // with the same client_id the token was issued to.
    stateStore: taggedStateStore(tag),
    sessionStore: sharedSessionStore(),
  });
}

export function getOAuthClient(
  tag: OAuthClientTag = "default",
): Promise<NodeOAuthClient> {
  store.clientPromises ??= {};
  store.clientPromises[tag] ??= buildClient(tag);
  return store.clientPromises[tag];
}

export function getSpacesOAuthClient(): Promise<NodeOAuthClient> {
  return getOAuthClient("spaces");
}
