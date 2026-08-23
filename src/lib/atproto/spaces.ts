/**
 * Space lifecycle + membership for spike-PDS accounts. This slice owns the
 * *existence* of a user's spaces and who can access them — not the watch data
 * inside them (that routes through the write seam in ./write.ts in a later
 * slice). All calls here are self-ops against the user's own PDS with the
 * normal Bearer session, so the delegation-token -> space-credential -> DPoP
 * dance (for cross-member reads) is deliberately absent.
 *
 * Discovery is deterministic: each account has at most one diary space and one
 * shared watchlist space, at fixed (type, skey) conventions, so "does it exist"
 * is a getSpace by URI rather than a listSpaces scan.
 */
import type { Agent } from "@atproto/api";
import { formatSpaceUri, parseSpaceUri } from "@/lib/atproto/space-uri";
import { resolveIdentity } from "@/lib/atproto/identity";
import type { AppSession } from "@/lib/session";

// A space's `type` is an NSID describing its modality; `skey` differentiates
// multiple spaces of the same type under one owner. tvlog fixes both so the
// same account always resolves to the same space URIs across logins.
interface SpaceDef {
  type: string;
  skey: string;
}

export const DIARY_SPACE: SpaceDef = {
  type: "computer.sims.log.diary",
  skey: "diary",
};
export const WATCHLIST_SPACE: SpaceDef = {
  type: "computer.sims.log.watchlist",
  skey: "watchlist",
};

const MEMBER_LIST_POLICY = {
  $type: "com.atproto.simplespace.defs#memberListPolicy",
} as const;
const OPEN_APP_ACCESS = {
  $type: "com.atproto.simplespace.defs#open",
} as const;

export type SpaceKind = "diary" | "watchlist";

export interface SpaceMember {
  did: string;
  handle: string | null;
}

export interface AppSpace {
  kind: SpaceKind;
  uri: string;
  ownerDid: string;
  // Diary is single-writer (owner only); watchlist is multi-writer (any
  // member writes into their own space-repo). Members are readers in both.
  multiWriter: boolean;
  members: SpaceMember[];
}

// --- error classification -----------------------------------------------------
// The alpha SDK surfaces XRPCError with `.status` + `.error`; we match on those
// rather than instanceof so behaviour is stable across the additive alpha drift.

interface Xrpcish {
  status?: number;
  error?: string;
  message?: string;
}

function errText(err: unknown): { status?: number; text: string } {
  const e = err as Xrpcish;
  return {
    status: e?.status,
    text: `${e?.error ?? ""} ${e?.message ?? ""}`.toLowerCase(),
  };
}

function isMethodUnsupported(err: unknown): boolean {
  const { status, text } = errText(err);
  if (status === 404 || status === 501) return true;
  return /methodnotimplemented|not implemented|xrpcnotsupported|not supported|unsupported/.test(
    text,
  );
}

// A space the caller can't see (non-member) reports RepoNotFound, not Forbidden,
// so both "does not exist" and "no access" collapse to the same signal.
function isSpaceMissing(err: unknown): boolean {
  const { status, text } = errText(err);
  if (status === 404) return true;
  return /spacenotfound|reponotfound|not found|does not exist|could not locate/.test(
    text,
  );
}

function isSpaceAlreadyExists(err: unknown): boolean {
  return /spacealreadyexists|already exists/.test(errText(err).text);
}

// --- capability detection -----------------------------------------------------

export interface CapabilityResult {
  capable: boolean;
  // Whether the answer is trustworthy enough to cache. A clear "not
  // implemented" or a clean success is definitive; a network/auth blip is not,
  // so we retry rather than cache a false negative.
  definitive: boolean;
}

export async function detectSpacesCapability(
  agent: Agent,
): Promise<CapabilityResult> {
  try {
    await agent.com.atproto.space.listSpaces({ limit: 1 });
    return { capable: true, definitive: true };
  } catch (err) {
    if (isMethodUnsupported(err)) return { capable: false, definitive: true };
    return { capable: false, definitive: false };
  }
}

// --- space lifecycle ----------------------------------------------------------

function spaceUriFor(ownerDid: string, def: SpaceDef): string {
  return formatSpaceUri({ authority: ownerDid, type: def.type, skey: def.skey });
}

async function spaceExists(agent: Agent, spaceUri: string): Promise<boolean> {
  try {
    await agent.com.atproto.simplespace.getSpace({ space: spaceUri });
    return true;
  } catch (err) {
    if (isSpaceMissing(err)) return false;
    throw err;
  }
}

async function ensureSpace(
  agent: Agent,
  ownerDid: string,
  def: SpaceDef,
): Promise<string> {
  const uri = spaceUriFor(ownerDid, def);
  if (await spaceExists(agent, uri)) return uri;
  try {
    const res = await agent.com.atproto.simplespace.createSpace({
      type: def.type,
      skey: def.skey,
      policy: MEMBER_LIST_POLICY,
      appAccess: OPEN_APP_ACCESS,
    });
    return res.data.uri;
  } catch (err) {
    // Lost a race with a concurrent ensure — the space now exists, which is
    // exactly the state we wanted.
    if (isSpaceAlreadyExists(err)) return uri;
    throw err;
  }
}

export function ensureDiarySpace(
  agent: Agent,
  ownerDid: string,
): Promise<string> {
  return ensureSpace(agent, ownerDid, DIARY_SPACE);
}

export function createWatchlistSpace(
  agent: Agent,
  ownerDid: string,
): Promise<string> {
  return ensureSpace(agent, ownerDid, WATCHLIST_SPACE);
}

// Deterministic space URIs — the routing layer (./routing.ts) needs these
// without paying for a getSpace round trip on the hot path.
export function diarySpaceUri(ownerDid: string): string {
  return spaceUriFor(ownerDid, DIARY_SPACE);
}
export function watchlistSpaceUri(ownerDid: string): string {
  return spaceUriFor(ownerDid, WATCHLIST_SPACE);
}

// Does this owner have a shared watchlist space yet? Gates whether watchlist
// reads/writes route to the space or stay on the public repo.
export function watchlistSpaceExists(
  agent: Agent,
  ownerDid: string,
): Promise<boolean> {
  return spaceExists(agent, watchlistSpaceUri(ownerDid));
}

// Just the member DIDs (no handle resolution) — the cross-member read path
// needs the list of writer repos to sweep, cheaply.
export async function spaceMemberDids(
  agent: Agent,
  spaceUri: string,
): Promise<string[]> {
  const dids: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await agent.com.atproto.simplespace.listMembers({
      space: spaceUri,
      cursor,
      limit: 100,
    });
    for (const m of res.data.members) dids.push(m.did);
    cursor = res.data.cursor;
  } while (cursor && dids.length < 500);
  return dids;
}

async function listMembersResolved(
  agent: Agent,
  spaceUri: string,
): Promise<SpaceMember[]> {
  const members: SpaceMember[] = [];
  let cursor: string | undefined;
  do {
    const res = await agent.com.atproto.simplespace.listMembers({
      space: spaceUri,
      cursor,
      limit: 100,
    });
    for (const m of res.data.members) members.push({ did: m.did, handle: null });
    cursor = res.data.cursor;
  } while (cursor && members.length < 500);

  // Handles are a display nicety — a member with no resolvable handle (common
  // for spike accounts before their DNS record lands) still shows by DID.
  await Promise.all(
    members.map(async (m) => {
      try {
        m.handle = (await resolveIdentity(m.did)).handle;
      } catch {
        m.handle = null;
      }
    }),
  );
  return members;
}

/**
 * The user's app-managed spaces: the diary (ensured to exist) and the shared
 * watchlist (only if the user has created it). Each carries its resolved member
 * list.
 */
export async function getAppSpaces(
  agent: Agent,
  ownerDid: string,
): Promise<AppSpace[]> {
  const spaces: AppSpace[] = [];

  const diaryUri = await ensureDiarySpace(agent, ownerDid);
  spaces.push({
    kind: "diary",
    uri: diaryUri,
    ownerDid,
    multiWriter: false,
    members: await listMembersResolved(agent, diaryUri),
  });

  const watchlistUri = spaceUriFor(ownerDid, WATCHLIST_SPACE);
  if (await spaceExists(agent, watchlistUri)) {
    spaces.push({
      kind: "watchlist",
      uri: watchlistUri,
      ownerDid,
      multiWriter: true,
      members: await listMembersResolved(agent, watchlistUri),
    });
  }

  return spaces;
}

// --- membership ---------------------------------------------------------------

// Resolve a member reference to a DID. A `did:` prefix is taken as-is; anything
// else is a handle resolved against the *user's* PDS (via the session agent),
// not a global resolver — spike handles resolve there before their public DNS
// record exists.
async function resolveMemberDid(
  agent: Agent,
  identifier: string,
): Promise<string> {
  const value = identifier.trim().replace(/^@/, "");
  if (!value) throw new Error("Enter a handle or DID.");
  if (value.startsWith("did:")) return value;
  try {
    const res = await agent.com.atproto.identity.resolveHandle({
      handle: value.toLowerCase(),
    });
    if (res.data.did) return res.data.did;
  } catch {
    // fall through to the shared error below
  }
  throw new Error(
    `Couldn't resolve "${identifier}". If the handle isn't set up yet, add the member by DID (did:plc:… or did:web:…).`,
  );
}

export async function addSpaceMember(
  agent: Agent,
  spaceUri: string,
  identifier: string,
): Promise<{ did: string }> {
  const did = await resolveMemberDid(agent, identifier);
  await agent.com.atproto.simplespace.addMember({ space: spaceUri, did });
  return { did };
}

export async function removeSpaceMember(
  agent: Agent,
  spaceUri: string,
  did: string,
): Promise<void> {
  await agent.com.atproto.simplespace.removeMember({ space: spaceUri, did });
}

/** True when the space URI is owned by the given DID — mutation guard. */
export function isOwnedBy(spaceUri: string, ownerDid: string): boolean {
  try {
    return parseSpaceUri(spaceUri).authority === ownerDid;
  } catch {
    return false;
  }
}

/**
 * Best-effort sign-in hook: caches spaces capability on the session and, for a
 * capable account, ensures the diary space exists. Never throws — capability
 * probing must not be able to break sign-in (least of all bsky.social sign-in,
 * where the space methods simply aren't implemented).
 */
export async function initSpacesForSession(
  agent: Agent,
  session: AppSession,
): Promise<void> {
  try {
    const { capable, definitive } = await detectSpacesCapability(agent);
    if (definitive) session.spacesCapable = capable;
    if (capable && agent.did) {
      try {
        await ensureDiarySpace(agent, agent.did);
      } catch {
        // Diary is re-ensured lazily on first /api/spaces load; a transient
        // failure here shouldn't block sign-in.
      }
    }
  } catch {
    // never break sign-in
  }
}
