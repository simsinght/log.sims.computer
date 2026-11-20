import { getSession } from "@/lib/session";
import { requireAgent } from "@/lib/requireAuth";
import SettingsClient from "@/components/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Signed-in only. requireAgent() never throws (a failed restore is treated
  // as signed out → /login), so the old cold-hit crash can't come back; the
  // handle and DID shown below still come straight from the cookie.
  await requireAgent();
  const session = await getSession();
  if (!session.did) return null;

  const did = session.did;
  const handle = session.handle ?? did;
  // Preview-only affordance: same env gate as /api/auth/test-login. The verify
  // collector can't fill file inputs, so when test credentials are configured
  // the Import section offers a "Load sample export" button instead.
  const sampleImportEnabled = Boolean(
    process.env.ATP_TEST_HANDLE && process.env.ATP_TEST_APP_PASSWORD,
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-2xl px-4 pb-12 pt-8">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <SettingsClient
          handle={handle}
          did={did}
          sampleImportEnabled={sampleImportEnabled}
          spacesCapable={session.spacesCapable ?? null}
        />
      </div>
    </div>
  );
}
