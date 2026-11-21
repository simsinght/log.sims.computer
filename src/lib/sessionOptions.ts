import type { SessionOptions } from "iron-session";

// Kept free of next/headers so middleware can import it too: the middleware
// unseals the same cookie with the same password the route handlers use.

export const SESSION_COOKIE = "log_sims_session";

const DEV_SECRET = "dev-only-insecure-session-secret-change-me";

function sessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  return DEV_SECRET;
}

// How long a sign-in lasts on a device: 400 days, the longest cookie lifetime
// browsers honour (Chrome clamps Max-Age to 400 days). iron-session's default
// was 14 days from sign-in, never extended, so the installed PWA signed out
// every two weeks regardless of use. The seal's own expiry is the same TTL;
// iron-session sets the cookie's Max-Age to it minus 60s of clock skew.
// Revocation still works: sign-out clears the cookie, and a cookie whose
// OAuth session is gone server-side is treated as signed out.
export const SESSION_TTL_SECONDS = 400 * 24 * 60 * 60;

export const sessionOptions: SessionOptions = {
  cookieName: SESSION_COOKIE,
  password: sessionPassword(),
  ttl: SESSION_TTL_SECONDS,
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};
