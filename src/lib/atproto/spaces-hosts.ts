// PDS hosts known to speak com.atproto.space.*. Shared by the login route
// (which picks the spaces OAuth client for these hosts) and the routing layer
// (which fails closed for these hosts: their diary must never fall back to the
// public repo). Everything else, bsky.social included, is an ordinary public
// account. Extend without a rebuild via SPACES_PDS_HOSTS (comma-separated
// hostnames).
const SPACES_HOSTS = new Set(
  [
    "pds.sims.computer",
    "spaces-alpha.host.bsky.network",
    ...(process.env.SPACES_PDS_HOSTS ?? "").split(","),
  ]
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);

export function isSpacesHost(host: string): boolean {
  return SPACES_HOSTS.has(host.toLowerCase());
}

export function isSpacesPdsUrl(pdsUrl: string | null | undefined): boolean {
  if (!pdsUrl) return false;
  try {
    return isSpacesHost(new URL(pdsUrl).host);
  } catch {
    return false;
  }
}
