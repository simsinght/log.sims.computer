// Display name + avatar for the "Continue as" row on /login, fetched once at
// sign-in from the public Bluesky AppView (unauthenticated, so it works for
// both OAuth clients' scopes and app-password sessions). Best effort: a short
// timeout, and any failure just means no name/avatar.

const PUBLIC_APPVIEW = "https://public.api.bsky.app";
// Only avatars the image optimizer may proxy (next.config.ts remotePatterns),
// so the signed-in client can cache a copy same-origin.
const AVATAR_PREFIX = "https://cdn.bsky.app/img/";

export interface PublicProfile {
  displayName?: string;
  avatar?: string;
}

export async function fetchPublicProfile(did: string): Promise<PublicProfile> {
  try {
    const url = new URL("/xrpc/app.bsky.actor.getProfile", PUBLIC_APPVIEW);
    url.searchParams.set("actor", did);
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) return {};
    const body = (await res.json()) as { displayName?: unknown; avatar?: unknown };
    const displayName =
      typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName.trim().slice(0, 64)
        : undefined;
    const avatar =
      typeof body.avatar === "string" &&
      body.avatar.startsWith(AVATAR_PREFIX) &&
      body.avatar.length <= 512
        ? body.avatar
        : undefined;
    return { displayName, avatar };
  } catch {
    return {};
  }
}
