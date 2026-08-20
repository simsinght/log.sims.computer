/**
 * Destination choice for tvlog's two space-routable record families — diary
 * (computer.sims.log.watch) and the shared watchlist. This is the ONE place the
 * public-repo vs space decision is made; records.ts helpers take the resolved
 * routing and never re-derive it.
 *
 * bsky.social (and any non-spaces account) resolves to all-public with ZERO
 * extra network calls, so its behaviour is byte-identical to before spaces.
 */
import type { Agent } from "@atproto/api";
import type { AppSession } from "@/lib/session";
import { PUBLIC_REPO, type WriteDestination } from "@/lib/atproto/write";
import {
  diarySpaceUri,
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

export async function resolveRouting(
  agent: Agent,
  session: AppSession,
): Promise<RecordRouting> {
  const ownerDid = agent.did;
  if (!ownerDid) throw new Error("resolveRouting called without an agent DID");

  // Capability is cached on the session at sign-in (initSpacesForSession). Only
  // a definitive `true` routes into spaces; undefined/false stays public.
  if (session.spacesCapable !== true) return PUBLIC_ROUTING(ownerDid);

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
  } catch {
    watchlist = { mode: "public" };
  }

  return { ownerDid, diary, watchlist };
}
