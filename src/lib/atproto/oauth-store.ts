/**
 * OAuth state/session stores shared by both NodeOAuthClient instances (the
 * legacy client and the spaces client), plus the nonce→client-tag mapping the
 * callback needs to restore with the client that started the flow.
 *
 * Why a nonce→tag map rather than a tagged `state` string: the OAuth SDK does
 * NOT use our `options.state` as the wire value. `authorize()` generates its own
 * nonce, uses it both as the wire `state` param and as the state-store key, and
 * buries our `options.state` as `appState` inside the stored value
 * (@atproto/oauth-client authorize(), ~line 84). So the callback only ever sees
 * the SDK nonce. We capture the tag at the one moment it's knowable — when the
 * SDK writes the state entry — by wrapping each client's `set` to also record
 * `nonce → tag`. All wrappers write to ONE underlying state map so either client
 * can read/refresh any entry; the tag map just remembers who initiated it.
 *
 * Kept free of `@/` path aliases and runtime imports (types only) so it can be
 * exercised directly by a plain node script.
 */
import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";

export type OAuthClientTag = "default" | "spaces";

// The slice of Map the session store needs, so a durable (file-backed) map
// from @/lib/durableStore can stand in for a plain Map.
export interface SessionBackend {
  get(key: string): NodeSavedSession | undefined;
  set(key: string, value: NodeSavedSession): unknown;
  delete(key: string): unknown;
}

interface OAuthStoreGlobals {
  // In memory on purpose: an entry only spans one login round trip.
  stateStore?: Map<string, NodeSavedState>;
  // Keyed by DID. In memory unless setSessionBackend() installed a durable map
  // (see ../atproto/oauth.ts) — that is what lets a sign-in outlive a restart.
  sessionStore?: SessionBackend;
  nonceTags?: Map<string, OAuthClientTag>;
}

const globalRef = globalThis as typeof globalThis & {
  __atprotoOAuthStore?: OAuthStoreGlobals;
};
globalRef.__atprotoOAuthStore ??= {};
const stores = globalRef.__atprotoOAuthStore;

function stateMap(): Map<string, NodeSavedState> {
  return (stores.stateStore ??= new Map());
}
function sessionMap(): SessionBackend {
  return (stores.sessionStore ??= new Map());
}

/**
 * Install the session store's backing map (once per process; later calls are
 * ignored so every client keeps sharing the same one). Must run before the
 * first session read or write.
 */
export function setSessionBackend(create: () => SessionBackend): void {
  stores.sessionStore ??= create();
}
function nonceTagMap(): Map<string, OAuthClientTag> {
  return (stores.nonceTags ??= new Map());
}

/**
 * The shared state store, wrapped for one client so `set` also records the
 * nonce's originating client tag. Every tagged wrapper reads/writes the same
 * underlying map — only the tag side-record differs per client.
 */
export function taggedStateStore(tag: OAuthClientTag): NodeSavedStateStore {
  return {
    get: (key) => stateMap().get(key),
    set: (key, value) => {
      stateMap().set(key, value);
      nonceTagMap().set(key, tag);
    },
    del: (key) => {
      stateMap().delete(key);
      nonceTagMap().delete(key);
    },
  };
}

/** The shared session store (keyed by DID; no per-client tagging needed). */
export function sharedSessionStore(): NodeSavedSessionStore {
  return {
    get: (key) => sessionMap().get(key),
    set: (key, value) => {
      sessionMap().set(key, value);
    },
    del: (key) => {
      sessionMap().delete(key);
    },
  };
}

/**
 * Resolve — and consume, single-use — the client tag for a callback's `state`
 * nonce. Defaults to "default" for absent/unknown state (a legacy session, or a
 * nonce whose tag was already consumed), so the legacy client handles anything
 * we can't attribute.
 */
export function resolveClientTagFromState(
  state: string | null | undefined,
): OAuthClientTag {
  if (!state) return "default";
  const map = nonceTagMap();
  const tag = map.get(state);
  if (tag) map.delete(state);
  return tag ?? "default";
}
