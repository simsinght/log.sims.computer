import { getAuthedAgent } from "@/lib/atproto/agent";
import { getShowListItem, type ShowListState } from "@/lib/atproto/records";
import { errFields } from "@/lib/atproto/spaces";
import type { EpisodeRef } from "@/lib/nextEpisode";

export interface ShowWatchState {
  // Whether a session exists — gates the Log controls, which can only work
  // signed in (POST /api/log answers 401 otherwise).
  signedIn: boolean;
  // The watchlist control's starting state; null leaves it hidden (signed out,
  // or the listItem read failed).
  listState: ShowListState | null;
  watched: EpisodeRef[];
}

/**
 * The account's state for one show, shared by the show, season and episode
 * pages: one listItem lookup feeds the watchlist button and every watched
 * marker. Never throws — resuming the agent and the listItem scan are PDS
 * round-trips that can reject on a cold hit (the old intermittent /settings
 * crash), so a failure is logged and the page renders as "nothing watched".
 */
export async function getShowWatchState(
  tmdbId: number,
  area: string,
): Promise<ShowWatchState> {
  let did: string | undefined;
  try {
    const agent = await getAuthedAgent();
    did = agent?.did;
    if (!agent || !did) return { signedIn: false, listState: null, watched: [] };
    // A signed-in account with no item for this show (null) is simply "none"
    // watched.
    const item = await getShowListItem(agent, did, tmdbId);
    return {
      signedIn: true,
      listState: item?.state ?? "none",
      watched:
        item?.watchedEpisodes.map((e) => ({
          seasonNumber: e.seasonNumber,
          episodeNumber: e.episodeNumber,
        })) ?? [],
    };
  } catch (err) {
    console.error(`[${area}] show state read failed; rendering unwatched`, {
      did,
      tmdbId,
      ...errFields(err),
    });
    return { signedIn: Boolean(did), listState: null, watched: [] };
  }
}
