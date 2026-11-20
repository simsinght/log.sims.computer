import { cache } from "react";
import { Agent, AtpAgent } from "@atproto/api";
import { getSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/atproto/oauth";
import { errFields } from "@/lib/atproto/spaces";

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
      // The OAuth token store is in-memory, so a deploy/restart orphans the
      // browser cookie ("session was deleted by another process" on restore).
      // A cookie the server can't back is a signed-out user, not an error.
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
    const agent = new AtpAgent({ service: session.pdsUrl });
    await agent.resumeSession(session.atpSession);
    return agent;
  }

  return null;
});
