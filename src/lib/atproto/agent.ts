import { Agent, AtpAgent } from "@atproto/api";
import { getSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/atproto/oauth";

export async function getAuthedAgent(): Promise<Agent | null> {
  const session = await getSession();
  if (!session.did) return null;

  if (session.method === "oauth") {
    const client = await getOAuthClient();
    const oauthSession = await client.restore(session.did);
    return new Agent(oauthSession);
  }

  if (session.method === "app_password" && session.atpSession && session.pdsUrl) {
    const agent = new AtpAgent({ service: session.pdsUrl });
    await agent.resumeSession(session.atpSession);
    return agent;
  }

  return null;
}
