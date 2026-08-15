"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SessionInfo {
  authenticated: boolean;
  did?: string;
  handle?: string;
}

export default function AuthStatus() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SessionInfo | null) =>
        setSession(data?.authenticated ? data : null),
      )
      .catch(() => setSession(null))
      .finally(() => setLoaded(true));
  }, []);

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(null);
    window.location.href = "/";
  }

  if (!loaded) {
    return <div className="h-5" />;
  }

  if (!session) {
    return (
      <Link
        href="/login"
        className="text-sm text-gray-400 transition-colors hover:text-white"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-gray-300">@{session.handle}</span>
      <button
        onClick={onLogout}
        className="text-gray-500 transition-colors hover:text-white"
      >
        Log out
      </button>
    </div>
  );
}
