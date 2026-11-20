import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";
import { sessionOptions } from "@/lib/sessionOptions";
import type { AtpSessionData } from "@atproto/api";
import type { OAuthClientTag } from "@/lib/atproto/oauth";

export type AuthMethod = "oauth" | "app_password";

export interface AppSession {
  did?: string;
  handle?: string;
  method?: AuthMethod;
  pdsUrl?: string;
  atpSession?: AtpSessionData;
  // Which OAuth client issued this session's token, so it is restored with the
  // matching client_id. Undefined for legacy sessions and app-password logins;
  // treated as "default".
  oauthClient?: OAuthClientTag;
  // Whether this account's PDS implements com.atproto.space.* — probed once at
  // sign-in and cached so bsky.social accounts never re-probe. Undefined until a
  // definitive answer is known.
  spacesCapable?: boolean;
  // Set when the PDS supports spaces but this session's token lacks the space
  // scope (an old transition:generic token on a spaces PDS). The UI prompts the
  // user to sign out and back in to pick up the spaces client's grants.
  spacesUnauthorized?: boolean;
  // Whether this account's PDS host is on the spaces allowlist
  // (./atproto/spaces-hosts), set at sign-in. Such an account's diary is
  // private by design, so routing fails closed for it: if spaces can't be
  // confirmed, diary operations error rather than fall back to the public repo.
  // False/undefined (bsky.social etc.) keeps the plain public behaviour.
  spacesExpected?: boolean;
}

export { sessionOptions } from "@/lib/sessionOptions";

export async function getSession(): Promise<IronSession<AppSession>> {
  const cookieStore = await cookies();
  return getIronSession<AppSession>(cookieStore, sessionOptions);
}
