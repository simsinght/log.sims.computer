import { getAuthedAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import { resolveRouting } from "@/lib/atproto/routing";
import { errFields } from "@/lib/atproto/spaces";
import { getShowWatches, type EpisodeWatch } from "@/lib/watchIndex";

/**
 * The signed-in account's diary watches for one show, for the Notes sections
 * and the episode page's note. Reads the diary wherever resolveRouting puts it
 * (the diary space for spaces accounts, the public repo otherwise) — so a
 * spaces account whose space can't be confirmed gets nothing rather than a
 * public-repo read. Never throws: a failure is logged and the page renders
 * without notes.
 */
export async function getShowDiaryWatches(
  tmdbId: number,
  area: string,
): Promise<EpisodeWatch[]> {
  let did: string | undefined;
  try {
    const agent = await getAuthedAgent();
    did = agent?.did;
    if (!agent || !did) return [];
    const routing = await resolveRouting(agent, await getSession());
    return await getShowWatches(agent, did, routing.diary, tmdbId);
  } catch (err) {
    console.error(`[${area}] diary notes read failed; rendering without notes`, {
      did,
      tmdbId,
      ...errFields(err),
    });
    return [];
  }
}
