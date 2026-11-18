/**
 * Destination choice for tvlog's two space-routable record families — diary
 * (computer.sims.log.watch) and the shared watchlist. This is the ONE place the
 * public-repo vs space decision is made; records.ts helpers take the resolved
 * routing and never re-derive it.
 *
 * bsky.social (and any non-spaces account) resolves to all-public with ZERO
 * extra network calls, so its behaviour is byte-identical to before spaces.
 *
 * An account on an allowlisted spaces host (./spaces-hosts) never falls back to
 * public: if its spaces capability isn't confirmed, resolveRouting throws
 * SpacesUnavailableError instead, so no diary write can land in the public repo.
 */
import type { Agent } from "@atproto/api";
import type { AppSession } from "@/lib/session";
import { PUBLIC_REPO, type WriteDestination } from "@/lib/atproto/write";
import { isSpacesPdsUrl } from "@/lib/atproto/spaces-hosts";
import {
  detectSpacesCapability,
  diarySpaceUri,
  errFields,
  watchlistSpaceExists,
  watchlistSpaceUri,
} from "@/lib/atproto/spaces";

export type WatchlistRoute =
  | { mode: "public" }
  | { mode: "space"; spaceUri: string };

export interface RecordRouting {
  ownerDid: string;
  // Diary destination for createWatch/createWatches/listWatches. Own-repo either
  // way, so reads stay plain-Bearer self-ops even in the space.
  diary: WriteDestination;
  watchlist: WatchlistRoute;
}

const PUBLIC_ROUTING = (ownerDid: string): RecordRouting => ({
  ownerDid,
  diary: PUBLIC_REPO,
  watchlist: { mode: "public" },
});

/**
 * Thrown for an account on an allowlisted spaces host when spaces can't be
 * confirmed usable. Its message is user-facing (the log sheet shows it).
 */
export class SpacesUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpacesUnavailableError";
  }
}

// Sessions from before `spacesExpected` existed: fall back to the OAuth client
// the login route picked (it picks "spaces" only for allowlisted hosts) or the
// stored PDS URL (app-password sessions). Neither needs a network call.
function spacesExpectedFor(session: AppSession): boolean {
  if (session.spacesExpected !== undefined) return session.spacesExpected;
  return session.oauthClient === "spaces" || isSpacesPdsUrl(session.pdsUrl);
}

type RoutingSession = AppSession & { save?: () => Promise<void> };

// For an allowlisted account, anything short of a confirmed, authorized spaces
// capability must NOT fall back to the public repo. If sign-in's probe was
// inconclusive (or read not-capable), re-probe now; cache a definitive answer
// when the session can be saved (route handlers — server components can't set
// cookies, so there it just re-probes next time).
async function assertSpacesUsable(
  agent: Agent,
  ownerDid: string,
  session: RoutingSession,
): Promise<void> {
  if (session.spacesCapable !== true) {
    const { capable, definitive, unauthorized, error } =
      await detectSpacesCapability(agent, ownerDid);
    if (definitive) {
      session.spacesCapable = capable;
      session.spacesUnauthorized = unauthorized ?? false;
      try {
        await session.save?.();
      } catch {
        // read-only cookie context (server component); harmless
      }
    }
    if (!capable) {
      console.error("[spaces] allowlisted account: spaces unavailable; failing closed", {
        did: ownerDid,
        definitive,
        ...errFields(error),
      });
      throw new SpacesUnavailableError(
        "Couldn't reach your private diary space on your PDS, so nothing was saved. " +
          "Your diary stays private and is never written to your public repo. " +
          "Try again in a moment; if it keeps failing, sign out and back in.",
      );
    }
  }
  if (session.spacesUnauthorized) {
    throw new SpacesUnavailableError(
      "tvlog isn't authorized for your private diary space, so nothing was saved. " +
        "Sign out and back in with your handle (OAuth) to grant access. " +
        "App-password sign-in can't use spaces.",
    );
  }
}

export async function resolveRouting(
  agent: Agent,
  session: RoutingSession,
): Promise<RecordRouting> {
  const ownerDid = agent.did;
  if (!ownerDid) throw new Error("resolveRouting called without an agent DID");

  if (!spacesExpectedFor(session)) {
    // Ordinary (non-allowlisted) account, e.g. bsky.social: capability is
    // cached on the session at sign-in (initSpacesForSession). Only a definitive
    // `true` routes into spaces; undefined/false stays public — unchanged.
    if (session.spacesCapable !== true) return PUBLIC_ROUTING(ownerDid);
  } else {
    // Allowlisted spaces host: the diary is private by design, so fail closed.
    await assertSpacesUsable(agent, ownerDid, session);
  }

  const diary: WriteDestination = {
    kind: "space",
    spaceUri: diarySpaceUri(ownerDid),
  };

  // The shared watchlist is opt-in (owner creates it), so its existence gates
  // routing. A probe failure falls back to public rather than breaking the
  // request.
  let watchlist: WatchlistRoute = { mode: "public" };
  try {
    if (await watchlistSpaceExists(agent, ownerDid)) {
      watchlist = { mode: "space", spaceUri: watchlistSpaceUri(ownerDid) };
    }
  } catch (err) {
    console.error("[spaces] watchlist existence probe failed; routing public", {
      did: ownerDid,
      ...errFields(err),
    });
    watchlist = { mode: "public" };
  }

  return { ownerDid, diary, watchlist };
}
