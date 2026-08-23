import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import type { AtpSessionData } from "@atproto/api";

export type AuthMethod = "oauth" | "app_password";

export interface AppSession {
  did?: string;
  handle?: string;
  method?: AuthMethod;
  pdsUrl?: string;
  atpSession?: AtpSessionData;
  // Whether this account's PDS implements com.atproto.space.* — probed once at
  // sign-in and cached so bsky.social accounts never re-probe. Undefined until a
  // definitive answer is known.
  spacesCapable?: boolean;
}

const DEV_SECRET = "dev-only-insecure-session-secret-change-me";

function sessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  return DEV_SECRET;
}

export const sessionOptions: SessionOptions = {
  cookieName: "log_sims_session",
  password: sessionPassword(),
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};

export async function getSession(): Promise<IronSession<AppSession>> {
  const cookieStore = await cookies();
  return getIronSession<AppSession>(cookieStore, sessionOptions);
}
