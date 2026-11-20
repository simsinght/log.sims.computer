import { requireAgent } from "@/lib/requireAuth";
import { getSession } from "@/lib/session";
import { resolveRouting } from "@/lib/atproto/routing";
import { errFields } from "@/lib/atproto/spaces";
import { listDiaryEntries, type DiaryEntry } from "@/lib/diary";
import SocialFeed from "@/components/SocialFeed";

export const dynamic = "force-dynamic";

export default async function SocialPage() {
  const agent = await requireAgent();
  const session = await getSession();

  let entries: DiaryEntry[] = [];
  try {
    // routing.diary reads the user's diary space for spaces-capable accounts and
    // the public repo otherwise — the single seam records.ts writes through.
    const routing = await resolveRouting(agent, session);
    // Flat list: SocialFeed groups by day in the viewer's timezone.
    entries = await listDiaryEntries(agent, agent.did, 50, routing.diary);
  } catch (err) {
    console.error("[social] diary failed; rendering empty", {
      did: agent.did,
      ...errFields(err),
    });
    entries = [];
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-3xl px-4 pb-12 pt-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Social</h1>
        </div>
        <SocialFeed entries={entries} />
      </div>
    </div>
  );
}
