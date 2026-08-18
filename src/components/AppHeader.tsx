"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import BackLink, { useHistoryBack } from "@/components/BackLink";

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
          className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-lg border border-gray-800 bg-[#141414] py-1 shadow-xl"
        >
          <Link
            role="menuitem"
            href="/watchlist"
            onClick={() => setOpen(false)}
            className="block w-full px-4 py-2.5 text-left text-sm text-gray-200 transition-colors hover:bg-gray-800"
          >
            Watchlist
          </Link>
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

function CloseSearchButton() {
  const onClose = useHistoryBack();

  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close search"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 bg-[#141414] text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

function searchHref(query: string): string {
  return query ? `/search?q=${encodeURIComponent(query)}` : "/search";
}

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const navigated = useRef(query);

  const onSearchPage = pathname === "/search";
  const showsBack = pathname.startsWith("/show/");
  const showsSearchInput = pathname !== "/settings";

  useEffect(() => {
    // A route change adopts that route's `q` (empty off /search), but never
    // while the user is typing — the search page rewrites its own URL on every
    // keystroke, and adopting that mid-word would drop characters.
    if (document.activeElement === inputRef.current) return;
    const adopted = new URLSearchParams(window.location.search).get("q") ?? "";
    navigated.current = adopted;
    setQuery(adopted);
  }, [pathname]);

  useEffect(() => {
    if (onSearchPage) inputRef.current?.focus();
  }, [onSearchPage]);

  const go = useCallback(
    (next: string) => {
      // Only an edit the user made since the last navigation moves the URL;
      // without this, going back out of /search with the field still focused
      // would immediately push the unchanged query forward again.
      if (next === navigated.current) return;
      navigated.current = next;
      if (onSearchPage) router.replace(searchHref(next));
      else if (next) router.push(searchHref(next));
    },
    [onSearchPage, router]
  );

  useEffect(() => {
    const trimmed = query.trim();
    const id = setTimeout(() => go(trimmed), 300);
    return () => clearTimeout(id);
  }, [query, go]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    go(query.trim());
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gray-900 bg-[#0a0a0a]/95 backdrop-blur">
      <div className="container mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
        {!onSearchPage && (
          <div className="flex shrink-0 items-center">
            {showsBack ? (
              <BackLink />
            ) : (
              <Link
                href="/"
                className="text-lg font-bold tracking-tight transition-colors hover:text-white"
              >
                tvlog
              </Link>
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-1 justify-end">
          {showsSearchInput && (
            <form
              onSubmit={onSubmit}
              role="search"
              className={`min-w-0 ${onSearchPage ? "flex w-full" : "hidden sm:flex"}`}
            >
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search"
                placeholder="Search shows"
                className={`h-9 min-w-0 rounded-full border border-gray-800 bg-[#141414] px-4 text-base placeholder-gray-600 outline-none transition-colors focus:border-gray-600 sm:text-sm ${
                  onSearchPage ? "w-full" : "w-full sm:w-56"
                }`}
              />
            </form>
          )}
        </div>

        <div className="flex shrink-0 items-center">
          {onSearchPage ? <CloseSearchButton /> : <ProfileMenu />}
        </div>
      </div>
    </header>
  );
}
