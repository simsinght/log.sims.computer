import Link from "next/link";
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
  // Render account info straight from the session cookie — no PDS round-trip.
  // getAuthedAgent() resumes the atproto session over the network, which can
  // reject on a cold first hit and would throw during this server render; the
  // handle and DID we need are already in the cookie, so we don't touch it here.
  if (!session.did) return <SignInPrompt />;

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
        />
      </div>
    </div>
  );
}
