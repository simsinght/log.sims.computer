import Link from "next/link";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import SettingsClient from "@/components/SettingsClient";

export const dynamic = "force-dynamic";

function SignInPrompt() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-6 text-center text-[#ededed]">
      <h1 className="text-2xl font-semibold tracking-tight">
        Sign in for settings
      </h1>
      <p className="mt-2 text-gray-400">
        Your account settings and Trakt import are available once you sign in.
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

export default async function SettingsPage() {
  const session = await getSession();
  if (!session.did) return <SignInPrompt />;

  const agent = await getAuthedAgent();
  if (!agent || !agent.did) return <SignInPrompt />;

  const handle = session.handle ?? agent.did;
  const did = agent.did;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <div>
          <Link
            href="/"
            className="text-sm text-gray-500 transition-colors hover:text-gray-300"
          >
            &larr; tvlog
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Settings</h1>
        </div>
        <SettingsClient handle={handle} did={did} />
      </div>
    </div>
  );
}
