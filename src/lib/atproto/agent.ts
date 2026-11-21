import { cache } from "react";
import { Agent, AtpAgent } from "@atproto/api";
import { getSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/atproto/oauth";
import { errFields } from "@/lib/atproto/spaces";
import {
  forgetPasswordSession,
  latestPasswordSession,
  savePasswordSession,
} from "@/lib/atproto/passwordTokens";

// Memoised per server render (React cache): a page guard and the page body
// share one restore instead of resuming the session twice. Outside a render
// (route handlers) it is a plain call.
export const getAuthedAgent = cache(async function getAuthedAgent(): Promise<Agent | null> {
  const session = await getSession();
  if (!session.did) return null;

  if (session.method === "oauth") {
    try {
      const client = await getOAuthClient(session.oauthClient ?? "default");
      const oauthSession = await client.restore(session.did);
      return new Agent(oauthSession);
    } catch (err) {
      // A cookie the server can't back is a signed-out user, not an error:
      // the session was revoked or failed to refresh, or (without
      // TVLOG_DATA_DIR) the in-memory store was wiped by a restart ("session
      // was deleted by another process" on restore).
      console.error(
        "[agent] oauth session restore failed; treating as signed out",
        errFields(err),
      );
      try {
        session.destroy();
      } catch {
        // Server components can't modify cookies; the cookie then dies on the
        // next route-handler request instead.
      }
      return null;
    }
  }

  if (session.method === "app_password" && session.atpSession && session.pdsUrl) {
    const did = session.did;
    // resumeSession() always refreshes, rotating the refresh token; keep the
    // newest tokens server-side (./passwordTokens) and resume from them.
    const agent = new AtpAgent({
      service: session.pdsUrl,
      persistSession: (evt, data) => {
        if ((evt === "create" || evt === "update") && data?.did === did) {
          savePasswordSession(data);
        } else if (evt === "expired") {
          forgetPasswordSession(did);
        }
      },
    });
    const start =
      latestPasswordSession(did) ??
      (session.atpSession.did === did ? session.atpSession : null);
    if (!start) return null;
    try {
      await agent.resumeSession(start);
      return agent;
    } catch (err) {
      // A transient failure (network) leaves the session in place; surface it
      // as before rather than signing the user out over a blip.
      if (agent.session) throw err;
      console.error(
        "[agent] app-password session resume failed; treating as signed out",
        errFields(err),
      );
      try {
        session.destroy();
      } catch {
        // Server components can't modify cookies (see above).
      }
      return null;
    }
  }

  return null;
});
