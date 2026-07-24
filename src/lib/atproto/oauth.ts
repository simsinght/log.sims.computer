import {
  NodeOAuthClient,
  type NodeSavedSession,
  type NodeSavedSessionStore,
  type NodeSavedState,
  type NodeSavedStateStore,
} from "@atproto/oauth-client-node";
import { JoseKey } from "@atproto/jwk-jose";
import { BASE_URL } from "@/config/baseUrl";

export const OAUTH_SCOPE = "atproto transition:generic";
const HANDLE_RESOLVER = "https://bsky.social";

export function clientMetadata(baseUrl: string = BASE_URL) {
  const base = baseUrl.replace(/\/$/, "");
  return {
    client_id: `${base}/api/auth/client-metadata.json`,
    client_name: "log.sims.computer",
    client_uri: base,
    redirect_uris: [`${base}/api/auth/callback`] as [string, ...string[]],
    scope: OAUTH_SCOPE,
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

interface OAuthGlobals {
  keyPromise?: Promise<JoseKey>;
  stateStore?: Map<string, NodeSavedState>;
  sessionStore?: Map<string, NodeSavedSession>;
  clientPromise?: Promise<NodeOAuthClient>;
}

const globals = globalThis as typeof globalThis & {
  __atprotoOAuth?: OAuthGlobals;
};
globals.__atprotoOAuth ??= {};
const store = globals.__atprotoOAuth;

function getSigningKey(): Promise<JoseKey> {
  store.keyPromise ??= JoseKey.generate(["ES256"], "log-sims-oauth");
  return store.keyPromise;
}

export async function getPublicJwks() {
  const key = await getSigningKey();
  return { keys: [key.publicJwk] };
}

function stateStore(): NodeSavedStateStore {
  store.stateStore ??= new Map();
  const map = store.stateStore;
  return {
    get: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value);
    },
    del: (key) => {
      map.delete(key);
    },
  };
}

function sessionStore(): NodeSavedSessionStore {
  store.sessionStore ??= new Map();
  const map = store.sessionStore;
  return {
    get: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value);
    },
    del: (key) => {
      map.delete(key);
    },
  };
}

async function buildClient(): Promise<NodeOAuthClient> {
  const key = await getSigningKey();
  return new NodeOAuthClient({
    clientMetadata: clientMetadata(),
    keyset: [key],
    handleResolver: HANDLE_RESOLVER,
    stateStore: stateStore(),
    sessionStore: sessionStore(),
  });
}

export function getOAuthClient(): Promise<NodeOAuthClient> {
  store.clientPromise ??= buildClient();
  return store.clientPromise;
}
