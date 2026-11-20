import { requireAgent } from "@/lib/requireAuth";
import { getSession } from "@/lib/session";
import { resolveRouting } from "@/lib/atproto/routing";
import { listWatchlist, type WatchlistShow } from "@/lib/atproto/records";
import WatchlistGrid from "@/components/WatchlistGrid";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const agent = await requireAgent();
  const session = await getSession();

  let shows: WatchlistShow[] = [];
  try {
    const routing = await resolveRouting(agent, session);
    shows = await listWatchlist(agent, agent.did, routing.watchlist);
  } catch {
    shows = [];
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-6xl px-4 pb-12 pt-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Watchlist</h1>
          <p className="mt-1 text-gray-400">Shows to watch next.</p>
        </div>

        <WatchlistGrid shows={shows} />
      </div>
    </div>
  );
}
