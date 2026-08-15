import Link from "next/link";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import { buildDiary, type DiaryDay } from "@/lib/diary";
import { getWatching, type WatchingShow } from "@/lib/watching";
import Watching from "@/components/Watching";

export const dynamic = "force-dynamic";

function Landing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-6 text-center text-[#ededed]">
      <h1 className="text-6xl font-bold tracking-tight">tvlog</h1>
      <p className="mt-4 text-lg text-gray-400">a personal TV log</p>
      <Link
        href="/login"
        className="mt-10 rounded-full bg-white px-8 py-3 text-base font-semibold text-black transition-colors hover:bg-gray-200"
      >
        Sign in
      </Link>
    </div>
  );
}

export default async function Home() {
  const session = await getSession();
  if (!session.did) return <Landing />;

  const agent = await getAuthedAgent();
  if (!agent || !agent.did) return <Landing />;

  const [watchingResult, diaryResult] = await Promise.allSettled([
    getWatching(agent, agent.did),
    buildDiary(agent, agent.did, 20),
  ]);
  const shows: WatchingShow[] =
    watchingResult.status === "fulfilled" ? watchingResult.value : [];
  const days: DiaryDay[] =
    diaryResult.status === "fulfilled" ? diaryResult.value : [];

  return <Watching shows={shows} days={days} />;
}
