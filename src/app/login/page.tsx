"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const ERROR_MESSAGES: Record<string, string> = {
  oauth: "Sign-in didn't complete. Please try again.",
  resolve:
    "We couldn't start sign-in for that account. If your PDS handle is new, its DNS record may not be live yet — try your DID (did:plc:…) or your PDS URL (https://pds.sims.computer) instead.",
  missing: "Enter a handle, DID, or PDS URL to sign in.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const oauthError = errorCode ? ERROR_MESSAGES[errorCode] : null;

  const [oauthHandle, setOauthHandle] = useState("");
  const [pwHandle, setPwHandle] = useState("");
  const [password, setPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

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
      window.location.href = "/";
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

        <form
          action="/api/auth/login"
          method="get"
          className="flex flex-col gap-3"
        >
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

        <details className="mt-10 border-t border-gray-800 pt-6">
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
