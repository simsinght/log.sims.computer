"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { safeNextPath } from "@/lib/authGate";
import {
  forgetAccount,
  readRememberedAccounts,
  type RememberedAccount,
} from "@/lib/rememberedAccounts";

const ERROR_MESSAGES: Record<string, string> = {
  oauth: "Sign-in didn't complete. Please try again.",
  resolve:
    "We couldn't start sign-in for that account. If your PDS handle is new, its DNS record may not be live yet — try your DID (did:plc:…) or your PDS URL (https://pds.sims.computer) instead.",
  missing: "Enter a handle, DID, or PDS URL to sign in.",
};

function AccountAvatar({ account }: { account: RememberedAccount }) {
  if (account.avatarData) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a data: URL cached on the device
      <img
        src={account.avatarData}
        alt=""
        width={64}
        height={64}
        className="h-16 w-16 shrink-0 rounded-full bg-gray-800 object-cover"
      />
    );
  }
  const initial = (account.displayName || account.handle).trim().charAt(0);
  return (
    <span
      aria-hidden="true"
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-gray-700 bg-[#1c1c1c] text-2xl font-semibold uppercase text-gray-300"
    >
      {initial || "?"}
    </span>
  );
}

// One remembered account, as a tile: the profile picture with the handle under
// it. Tapping starts sign-in (OAuth accounts submit the same GET
// /api/auth/login form as the handle field, with `next`; app-password accounts
// open the password form with the identifier filled in). In edit mode the tile
// forgets the account on this device instead.
function RememberedAccountTile({
  account,
  next,
  editing,
  onPassword,
  onForget,
}: {
  account: RememberedAccount;
  next: string | null;
  editing: boolean;
  onPassword: (handle: string) => void;
  onForget: (did: string) => void;
}) {
  const [pending, setPending] = useState(false);
  // Coming back from the authorize page via Back restores this page from the
  // back/forward cache with the tile still pending; reset it.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setPending(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  const body = (
    <>
      <span className="relative">
        <AccountAvatar account={account} />
        {editing && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-gray-600 bg-[#2a2a2a] text-gray-200"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="h-3 w-3"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </span>
        )}
      </span>
      <span className="line-clamp-2 block w-full break-all text-center text-[13px] leading-tight text-gray-200">
        {pending ? "Signing in…" : account.handle}
      </span>
    </>
  );
  const tile =
    "flex w-28 flex-col items-center gap-2 rounded-xl py-2 transition-opacity active:opacity-70 disabled:opacity-60";

  if (editing) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onForget(account.did)}
          aria-label={`Forget ${account.handle} on this device`}
          className={tile}
        >
          {body}
        </button>
      </li>
    );
  }
  return (
    <li>
      {account.method === "oauth" ? (
        <form
          action="/api/auth/login"
          method="get"
          onSubmit={() => setPending(true)}
        >
          <input type="hidden" name="handle" value={account.handle} />
          {next && <input type="hidden" name="next" value={next} />}
          <button
            type="submit"
            disabled={pending}
            aria-label={`Continue as ${account.handle}`}
            className={tile}
          >
            {body}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => onPassword(account.handle)}
          aria-label={`Continue as ${account.handle}`}
          className={tile}
        >
          {body}
        </button>
      )}
    </li>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const oauthError = errorCode ? ERROR_MESSAGES[errorCode] : null;
  // Where to land after sign-in (set by the auth gate); same-origin paths only.
  const next = safeNextPath(searchParams.get("next"));

  const [oauthHandle, setOauthHandle] = useState("");
  const [pwHandle, setPwHandle] = useState("");
  const [password, setPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const pwSectionRef = useRef<HTMLDetailsElement>(null);
  // Read after mount (localStorage isn't there during the server render).
  const [accounts, setAccounts] = useState<RememberedAccount[]>([]);
  const [editingAccounts, setEditingAccounts] = useState(false);
  useEffect(() => {
    setAccounts(readRememberedAccounts());
  }, []);

  function continueWithPassword(handle: string) {
    setPwHandle(handle);
    setPwOpen(true);
    // After the <details> opens: focus the password (keyboard up on iOS too,
    // since this runs from the tap) and bring the form into view.
    requestAnimationFrame(() => {
      passwordRef.current?.focus();
      pwSectionRef.current?.scrollIntoView({ block: "nearest" });
    });
  }

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setPwLoading(true);
    setPwError(null);
    try {
      const res = await fetch("/api/auth/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: pwHandle.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Login failed");
      }
      window.location.href = next ?? "/";
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-md px-4 py-16">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-gray-500 transition-colors hover:text-gray-300"
          >
            &larr; tvlog
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Sign in</h1>
          <p className="mt-1 text-gray-400">
            Sign in with your atproto account — Bluesky or a self-hosted PDS.
          </p>
        </div>

        {oauthError && (
          <div className="mb-6 rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {oauthError}
          </div>
        )}

        {accounts.length > 0 && (
          <section aria-labelledby="remembered-heading" className="mb-8">
            <div className="flex items-center justify-between">
              <h2
                id="remembered-heading"
                className="text-sm font-medium text-gray-400"
              >
                {editingAccounts ? "Remove from this device" : "Continue as"}
              </h2>
              <button
                type="button"
                onClick={() => setEditingAccounts((v) => !v)}
                className="-mr-3 flex min-h-11 items-center px-3 text-sm text-gray-500 transition-colors hover:text-gray-200"
              >
                {editingAccounts ? "Done" : "Edit"}
              </button>
            </div>
            <ul className="-mx-1 mt-1 flex flex-wrap gap-x-2 gap-y-3">
              {accounts.map((account) => (
                <RememberedAccountTile
                  key={account.did}
                  account={account}
                  next={next}
                  editing={editingAccounts}
                  onPassword={continueWithPassword}
                  onForget={(did) => setAccounts(forgetAccount(did))}
                />
              ))}
            </ul>
            <p className="mt-6 text-sm text-gray-500">
              Or use a different account
            </p>
          </section>
        )}

        <form
          action="/api/auth/login"
          method="get"
          className="flex flex-col gap-3"
        >
          {next && <input type="hidden" name="next" value={next} />}
          <label htmlFor="oauth-handle" className="text-sm text-gray-400">
            Handle, DID, or PDS URL
          </label>
          <input
            id="oauth-handle"
            name="handle"
            type="text"
            autoComplete="username"
            required
            value={oauthHandle}
            onChange={(e) => setOauthHandle(e.target.value)}
            placeholder="you.bsky.social"
            className="w-full rounded-lg border border-gray-800 bg-[#141414] px-4 py-3 text-base placeholder-gray-600 outline-none transition-colors focus:border-gray-600"
          />
          <p className="text-xs text-gray-500">
            New PDS account whose handle isn&apos;t resolving yet? Sign in with
            your DID (<code className="text-gray-400">did:plc:…</code>) or your
            PDS URL (
            <code className="text-gray-400">https://pds.sims.computer</code>).
          </p>
          <button
            type="submit"
            className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-black transition-colors hover:bg-white"
          >
            Sign in
          </button>
        </form>

        <details
          ref={pwSectionRef}
          open={pwOpen}
          onToggle={(e) => setPwOpen(e.currentTarget.open)}
          className="mt-10 border-t border-gray-800 pt-6"
        >
          <summary className="cursor-pointer text-sm text-gray-400 transition-colors hover:text-gray-200">
            Sign in with app password
          </summary>
          <p className="mt-3 text-xs text-gray-500">
            Uses an{" "}
            <span className="text-gray-400">app password</span> and{" "}
            <code className="text-gray-400">com.atproto.server.createSession</code>
            . For local development, agents, and importers.
          </p>
          <form onSubmit={onPasswordLogin} className="mt-4 flex flex-col gap-3">
            <input
              type="text"
              autoComplete="username"
              required
              value={pwHandle}
              onChange={(e) => setPwHandle(e.target.value)}
              placeholder="you.bsky.social"
              className="w-full rounded-lg border border-gray-800 bg-[#141414] px-4 py-3 text-base placeholder-gray-600 outline-none transition-colors focus:border-gray-600"
            />
            <input
              ref={passwordRef}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              className="w-full rounded-lg border border-gray-800 bg-[#141414] px-4 py-3 text-base placeholder-gray-600 outline-none transition-colors focus:border-gray-600"
            />
            {pwError && (
              <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                {pwError}
              </div>
            )}
            <button
              type="submit"
              disabled={pwLoading}
              className="rounded-lg border border-gray-700 px-4 py-3 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:opacity-50"
            >
              {pwLoading ? "Signing in…" : "Sign in with app password"}
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
