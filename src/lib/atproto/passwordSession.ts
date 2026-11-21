import { AtpAgent } from "@atproto/api";
import { resolveIdentity } from "@/lib/atproto/identity";
import { initSpacesForSession } from "@/lib/atproto/spaces";
import { isSpacesPdsUrl } from "@/lib/atproto/spaces-hosts";
import { fetchPublicProfile } from "@/lib/atproto/publicProfile";
import { getSession } from "@/lib/session";
import { savePasswordSession } from "@/lib/atproto/passwordTokens";

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

  // A fresh sign-in supersedes any tokens kept from an earlier one.
  savePasswordSession(agent.session);

  const session = await getSession();
  session.did = agent.session.did;
  session.handle = agent.session.handle;
  session.method = "app_password";
  session.pdsUrl = pdsUrl;
  session.atpSession = agent.session;
  // Drop any capability cached under a previous identity on this cookie before
  // re-probing, so a stale flag can never cross accounts.
  session.spacesCapable = undefined;
  session.spacesUnauthorized = undefined;
  session.spacesExpected = isSpacesPdsUrl(pdsUrl);
  const [profile] = await Promise.all([
    fetchPublicProfile(agent.session.did),
    initSpacesForSession(agent, session),
  ]);
  session.displayName = profile.displayName;
  session.avatar = profile.avatar;
  await session.save();

  return { did: agent.session.did, handle: agent.session.handle };
}
