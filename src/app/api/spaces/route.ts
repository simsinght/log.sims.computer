import { NextRequest, NextResponse } from "next/server";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import {
  addSpaceMember,
  createWatchlistSpace,
  detectSpacesCapability,
  getAppSpaces,
  isOwnedBy,
  removeSpaceMember,
} from "@/lib/atproto/spaces";

export const runtime = "nodejs";

// Resolve (and cache) whether this session's account supports spaces. A
// bsky.social account is cached `false` at sign-in, so it never reaches a space
// call from here.
async function resolveCapability(
  agent: Awaited<ReturnType<typeof getAuthedAgent>>,
): Promise<boolean> {
  const session = await getSession();
  if (session.spacesCapable !== undefined) return session.spacesCapable;
  if (!agent) return false;
  const { capable, definitive } = await detectSpacesCapability(agent);
  if (definitive) {
    session.spacesCapable = capable;
    await session.save();
  }
  return capable;
}

export async function GET() {
  const agent = await getAuthedAgent();
  if (!agent || !agent.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await resolveCapability(agent))) {
    return NextResponse.json({ capable: false, spaces: [] });
  }

  try {
    const spaces = await getAppSpaces(agent, agent.did);
    return NextResponse.json({ capable: true, spaces });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load spaces";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const agent = await getAuthedAgent();
  if (!agent || !agent.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await resolveCapability(agent))) {
    return NextResponse.json(
      { error: "This account doesn't support spaces." },
      { status: 400 },
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
    const message = err instanceof Error ? err.message : "Space update failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
