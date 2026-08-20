import { AtpAgent } from "@atproto/api";
import { resolveIdentity } from "@/lib/atproto/identity";
import { initSpacesForSession } from "@/lib/atproto/spaces";
import { getSession } from "@/lib/session";

export async function establishPasswordSession(
  handle: string,
  password: string,
): Promise<{ did: string; handle: string }> {
  const { pdsUrl } = await resolveIdentity(handle);
  const agent = new AtpAgent({ service: pdsUrl });
  await agent.login({ identifier: handle, password });

  if (!agent.session) {
    throw new Error("Login did not establish a session");
  }

  const session = await getSession();
  session.did = agent.session.did;
  session.handle = agent.session.handle;
  session.method = "app_password";
  session.pdsUrl = pdsUrl;
  session.atpSession = agent.session;
  await initSpacesForSession(agent, session);
  await session.save();

  return { did: agent.session.did, handle: agent.session.handle };
}
