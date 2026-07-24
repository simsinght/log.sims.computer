import Link from "next/link";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import { buildDiary, type DiaryDay } from "@/lib/diary";
import Diary from "@/components/Diary";

export const dynamic = "force-dynamic";

function Landing() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-4">
            log.sims.computer
          </h1>
          <p className="text-lg text-gray-400">
            Personal movie & TV log on atproto
          </p>
          <Link
            href="/search"
            className="inline-block mt-6 rounded-lg border border-gray-700 px-5 py-2.5 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
          >
            Search movies & TV
          </Link>
        </div>

        <div className="mt-12">
          <div className="border-2 border-dashed border-gray-800 rounded-lg p-12 text-center">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="grid grid-cols-4 gap-2 opacity-20">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="w-16 h-24 bg-gray-800 rounded"></div>
                ))}
              </div>
              <p className="text-gray-500 text-lg mt-6">
                Your movie & TV diary will appear here
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function Home() {
  const session = await getSession();
  if (!session.did) return <Landing />;

  const agent = await getAuthedAgent();
  if (!agent || !agent.did) return <Landing />;

  let days: DiaryDay[] = [];
  try {
    days = await buildDiary(agent, agent.did);
  } catch {
    days = [];
  }

  return <Diary handle={session.handle ?? agent.did} days={days} />;
}
