"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface SessionInfo {
  authenticated: boolean;
  did?: string;
  handle?: string;
}

function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-700 bg-[#141414] text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-40 overflow-hidden rounded-lg border border-gray-800 bg-[#141414] py-1 shadow-xl"
        >
          <Link
            role="menuitem"
            href="/settings"
            onClick={() => setOpen(false)}
            className="block w-full px-4 py-2.5 text-left text-sm text-gray-200 transition-colors hover:bg-gray-800"
          >
            Settings
          </Link>
          <button
            role="menuitem"
            onClick={onLogout}
            className="block w-full px-4 py-2.5 text-left text-sm text-gray-200 transition-colors hover:bg-gray-800"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

function SearchFab() {
  return (
    <Link
      href="/search"
      aria-label="Search"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 active:scale-95"
      style={{
        bottom: "calc(1.5rem + env(safe-area-inset-bottom))",
        right: "calc(1.5rem + env(safe-area-inset-right))",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </Link>
  );
}

export default function AppChrome() {
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

  if (!loaded) return null;

  return (
    <>
      <div className="fixed right-4 top-4 z-50">
        {session ? (
          <ProfileMenu />
        ) : (
          <Link
            href="/login"
            className="text-sm text-gray-400 transition-colors hover:text-white"
          >
            Sign in
          </Link>
        )}
      </div>
      {session && <SearchFab />}
    </>
  );
}
