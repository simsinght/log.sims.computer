import Link from "next/link";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import { resolveRouting } from "@/lib/atproto/routing";
import { buildDiary, type DiaryDay } from "@/lib/diary";
import SocialFeed from "@/components/SocialFeed";

export const dynamic = "force-dynamic";

function SignInPrompt() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-6 text-center text-[#ededed]">
      <h1 className="text-2xl font-semibold tracking-tight">
        Sign in for your feed
      </h1>
      <p className="mt-2 text-gray-400">
        Your diary and watch parties are available once you sign in.
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

export default async function SocialPage() {
  const session = await getSession();
  if (!session.did) return <SignInPrompt />;

  const agent = await getAuthedAgent();
  if (!agent || !agent.did) return <SignInPrompt />;

  let days: DiaryDay[] = [];
  try {
    // routing.diary reads the user's diary space for spaces-capable accounts and
    // the public repo otherwise — the single seam records.ts writes through.
    const routing = await resolveRouting(agent, session);
    days = await buildDiary(agent, agent.did, 50, routing.diary);
  } catch {
    days = [];
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-3xl px-4 pb-12 pt-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Social</h1>
        </div>
        <SocialFeed days={days} />
      </div>
    </div>
  );
}
