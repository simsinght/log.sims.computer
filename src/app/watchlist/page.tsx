import Link from "next/link";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import { listWatchlist, type WatchlistShow } from "@/lib/atproto/records";
import WatchlistGrid from "@/components/WatchlistGrid";

export const dynamic = "force-dynamic";

function SignInPrompt() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-6 text-center text-[#ededed]">
      <h1 className="text-2xl font-semibold tracking-tight">
        Sign in for your watchlist
      </h1>
      <p className="mt-2 text-gray-400">
        Your watchlist is available once you sign in.
      </p>
      <Link
        href="/login"
        className="mt-8 rounded-full bg-white px-8 py-3 text-base font-semibold text-black transition-colors hover:bg-gray-200"
      >
        Sign in
      </Link>
    </div>
  );
}

export default async function WatchlistPage() {
  const session = await getSession();
  if (!session.did) return <SignInPrompt />;

  const agent = await getAuthedAgent();
  if (!agent || !agent.did) return <SignInPrompt />;

  let shows: WatchlistShow[] = [];
  try {
    shows = await listWatchlist(agent, agent.did);
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
