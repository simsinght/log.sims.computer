import { NextRequest, NextResponse } from "next/server";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import {
  addSpaceMember,
  createWatchlistSpace,
  detectSpacesCapability,
  errFields,
  getAppSpaces,
  isOwnedBy,
  removeSpaceMember,
} from "@/lib/atproto/spaces";

export const runtime = "nodejs";

// Resolve (and cache) whether this session's account supports spaces, and
// whether this token is authorized for them. A bsky.social account is cached
// `{capable:false}` at sign-in, so it never reaches a space call from here; a
// spaces PDS with a stale transition:generic token resolves capable-but-
// unauthorized so the UI can prompt a re-login. `probeError` is set only when a
// fresh probe read the account as not-capable off an error (definitive or not) —
// the cached path and the capable cases have no error to report.
async function resolveCapability(
  agent: Awaited<ReturnType<typeof getAuthedAgent>>,
): Promise<{ capable: boolean; unauthorized: boolean; probeError?: unknown }> {
  const session = await getSession();
  if (session.spacesCapable !== undefined) {
    return {
      capable: session.spacesCapable,
      unauthorized: session.spacesUnauthorized ?? false,
    };
  }
  if (!agent) return { capable: false, unauthorized: false };
  const { capable, definitive, unauthorized, error } =
    await detectSpacesCapability(agent);
  if (definitive) {
    session.spacesCapable = capable;
    session.spacesUnauthorized = unauthorized ?? false;
    await session.save();
  }
  return {
    capable,
    unauthorized: unauthorized ?? false,
    probeError: capable ? undefined : error,
  };
}

export async function GET() {
  const agent = await getAuthedAgent();
  if (!agent || !agent.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { capable, unauthorized, probeError } = await resolveCapability(agent);
  if (!capable) {
    // Surface the probe error in the body (and log it) so a not-capable verdict
    // that came from an actual PDS error is diagnosable from the network trace,
    // rather than looking identical to a genuine unsupported account.
    if (probeError !== undefined) {
      console.error("[spaces] capability probe: not capable", {
        did: agent.did,
        ...errFields(probeError),
      });
      return NextResponse.json({ capable: false, probe: errFields(probeError) });
    }
    return NextResponse.json({ capable: false });
  }
  // Capable PDS, but the token lacks the space scope: surface a re-auth prompt
  // rather than calling getAppSpaces (which would 403).
  if (unauthorized) {
    return NextResponse.json({ capable: true, needsReauth: true, spaces: [] });
  }

  try {
    const spaces = await getAppSpaces(agent, agent.did);
    return NextResponse.json({ capable: true, spaces });
  } catch (err) {
    console.error("[spaces] getAppSpaces failed", {
      did: agent.did,
      ...errFields(err),
    });
    const message = err instanceof Error ? err.message : "Failed to load spaces";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const agent = await getAuthedAgent();
  if (!agent || !agent.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { capable, unauthorized, probeError } = await resolveCapability(agent);
  if (!capable) {
    if (probeError !== undefined) {
      console.error("[spaces] capability probe: not capable", {
        did: agent.did,
        ...errFields(probeError),
      });
    }
    return NextResponse.json(
      { error: "This account doesn't support spaces." },
      { status: 400 },
    );
  }
  if (unauthorized) {
    return NextResponse.json(
      {
        error:
          "tvlog needs updated permissions for spaces. Sign out and back in to continue.",
        needsReauth: true,
      },
      { status: 403 },
    );
  }

  let body: { action?: unknown; space?: unknown; identifier?: unknown; did?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const space = typeof body.space === "string" ? body.space : "";

  // Every mutation targets a space owned by the signed-in user. addMember /
  // removeMember would fail NotSpaceOwner server-side anyway; rejecting up front
  // keeps the error clear.
  if (action !== "createWatchlist" && !isOwnedBy(space, agent.did)) {
    return NextResponse.json(
      { error: "Unknown or unowned space." },
      { status: 400 },
    );
  }

  try {
    if (action === "createWatchlist") {
      const uri = await createWatchlistSpace(agent, agent.did);
      return NextResponse.json({ uri });
    }
    if (action === "addMember") {
      const identifier =
        typeof body.identifier === "string" ? body.identifier : "";
      const { did } = await addSpaceMember(agent, space, identifier);
      return NextResponse.json({ did });
    }
    if (action === "removeMember") {
      const did = typeof body.did === "string" ? body.did : "";
      if (!did) {
        return NextResponse.json({ error: "Missing DID" }, { status: 400 });
      }
      await removeSpaceMember(agent, space, did);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[spaces] mutation failed", {
      did: agent.did,
      action,
      ...errFields(err),
    });
    const message = err instanceof Error ? err.message : "Space update failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
