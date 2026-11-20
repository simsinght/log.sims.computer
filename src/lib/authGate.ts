// Pure helpers shared by middleware, pages and the auth routes: which paths
// are reachable signed out, and how a "return here after sign-in" path is
// validated. No next/headers or Node-only imports.

// Request header the middleware stamps on gated requests so server pages know
// their own path (for /login?next=...) without threading params through.
export const PATH_HEADER = "x-tvlog-path";

// Cookie the login route parks a validated return path in for the OAuth
// callback (kept out of the OAuth state on purpose).
export const NEXT_COOKIE = "tvlog_next";

// Exact paths reachable without a session. Everything not listed here (or
// under a prefix below) needs a signed-in session: pages redirect to /login,
// /api/* and /_next/image answer 401.
const PUBLIC_EXACT = new Set<string>([
  "/", // signed-out landing (Sign in button); signed-in home
  "/login",
  "/install", // PWA install instructions, linked from the install banner
  "/api/healthz", // deploy health check
  "/manifest.webmanifest",
  "/icon.svg",
  "/apple-icon.png",
  "/sw.js",
  "/offline.html",
  // Probed by browsers / iOS without cookies; let them 404 instead of
  // redirecting to an HTML login page.
  "/favicon.ico",
  "/robots.txt",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
]);

const PUBLIC_PREFIXES = [
  // OAuth + sign-in endpoints: login, callback, password-login, test-login,
  // logout, session probe, expired, both client metadata documents and jwks.
  // The atproto authorization server fetches the metadata/jwks without
  // cookies; gating them would break sign-in for everyone.
  "/api/auth/",
  "/icons/", // manifest icons
  "/install/", // install-page screenshots
  "/_next/static/", // build assets (the login page needs them)
  "/_next/webpack-hmr", // dev only
  "/__nextjs", // dev overlay endpoints (dev only)
];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * A same-origin, relative path that is safe to redirect to after sign-in, or
 * null. Rejects absolute URLs, protocol-relative (`//host`) and backslash
 * tricks, control characters, and anything under /api/ or /login.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) {
    return null;
  }
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, "http://tvlog.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://tvlog.invalid") return null;
  const path = url.pathname;
  if (path === "/login" || path.startsWith("/api/") || path.startsWith("/_next/")) {
    return null;
  }
  return `${path}${url.search}${url.hash}`;
}

/** `/login`, carrying a validated return path when there is one worth keeping. */
export function loginPath(next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe && safe !== "/" ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}
