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

export const sessionOptions: SessionOptions = {
  cookieName: SESSION_COOKIE,
  password: sessionPassword(),
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};
