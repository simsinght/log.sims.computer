import type { AtpSessionData } from "@atproto/api";
import { openKeyValueMap, type KeyValueMap } from "@/lib/durableStore";

// Latest app-password tokens per DID, kept server-side.
//
// The sealed cookie carries the tokens from sign-in, but AtpAgent's
// resumeSession() refreshes on every resume and the PDS rotates the refresh
// token each time; the old one stops working once the PDS's reuse grace window
// passes. Server components can't rewrite the cookie, so without this map an
// app-password session died a couple of hours after sign-in. The cookie's copy
// remains the fallback (and the proof of identity: entries are only read for
// the DID the sealed cookie names).
//
// Durable under TVLOG_DATA_DIR like the OAuth session store, in memory without.

const globalRef = globalThis as typeof globalThis & {
  __tvlogPasswordTokens?: KeyValueMap<AtpSessionData>;
};

function tokens(): KeyValueMap<AtpSessionData> {
  return (globalRef.__tvlogPasswordTokens ??=
    openKeyValueMap<AtpSessionData>("password-sessions"));
}

export function latestPasswordSession(did: string): AtpSessionData | undefined {
  const saved = tokens().get(did);
  return saved && saved.did === did ? saved : undefined;
}

export function savePasswordSession(data: AtpSessionData): void {
  const prev = tokens().get(data.did);
  if (
    prev &&
    prev.refreshJwt === data.refreshJwt &&
    prev.accessJwt === data.accessJwt &&
    prev.handle === data.handle
  ) {
    return;
  }
  tokens().set(data.did, data);
}

export function forgetPasswordSession(did: string): void {
  tokens().delete(did);
}
