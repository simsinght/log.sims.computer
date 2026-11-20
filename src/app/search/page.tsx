"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useHistoryBack } from "@/components/BackLink";

interface SearchResult {
  tmdbId: number;
  mediaType: "tv";
  title: string;
  year: string | null;
  posterPath: string | null;
  overview: string;
}

const POSTER_BASE = "https://image.tmdb.org/t/p/w342";

function PosterCard({ result }: { result: SearchResult }) {
  return (
    <Link
      href={`/show/${result.tmdbId}`}
      prefetch={false}
      className="group block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-gray-800">
        {result.posterPath ? (
          <Image
            src={`${POSTER_BASE}${result.posterPath}`}
            alt={result.title}
            fill
            sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 160px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-xs text-gray-500">
            No poster
          </div>
        )}
      </div>
      <div className="mt-2">
        <p className="truncate text-sm font-medium" title={result.title}>
          {result.title}
        </p>
        {result.year && <p className="text-xs text-gray-500">{result.year}</p>}
      </div>
    </Link>
  );
}

function SignInPrompt() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-6 text-center text-[#ededed]">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to search</h1>
      <p className="mt-2 text-gray-400">Search is available once you sign in.</p>
      <Link
        href="/login"
        className="mt-8 rounded-full bg-white px-8 py-3 text-base font-semibold text-black transition-colors hover:bg-gray-200"
      >
        Sign in
      </Link>
    </div>
  );
}

function searchHref(query: string): string {
  return query ? `/search?q=${encodeURIComponent(query)}` : "/search";
}

/** Above this many px of viewport loss we treat the on-screen keyboard as up. */
const KEYBOARD_THRESHOLD = 80;

/**
 * Keep the search view sized to the *visible* area. iOS Safari (and the
 * standalone PWA) never shrinks the layout viewport for the on-screen
 * keyboard, so a `position: fixed; bottom: 0` bar would sit behind it. The
 * visual viewport does shrink (and may pan, `offsetTop`), so we pin the
 * view's top/bottom to it: `--vv-top` = how far the visual viewport is
 * panned down, `--kb` = layout viewport height − (visual height + offsetTop),
 * i.e. how much of the layout viewport the keyboard covers. Written straight
 * to the DOM (no React state) and rAF-throttled, so a keyboard animation
 * costs at most one style write per frame.
 */
function useVisualViewportInsets(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const vv = window.visualViewport;
    let frame = 0;
    let top = 0;
    let bottom = 0;

    function measure() {
      frame = 0;
      if (!root) return;
      // The root is position: fixed against the layout viewport; adding back
      // the insets we applied gives the full layout viewport height.
      const layoutHeight = root.offsetHeight + top + bottom;
      let nextTop = 0;
      let nextBottom = 0;
      if (vv) {
        // Pinch-zoomed: leave the layout alone rather than chase the zoom.
        if (vv.scale > 1.01) return;
        nextTop = Math.max(0, Math.round(vv.offsetTop));
        nextBottom = Math.max(
          0,
          Math.round(layoutHeight - (vv.height + vv.offsetTop))
        );
      } else {
        // No visualViewport: browsers that do shrink window.innerHeight for
        // the keyboard still get the bar above it.
        nextBottom = Math.max(0, Math.round(layoutHeight - window.innerHeight));
      }
      if (nextTop === top && nextBottom === bottom) return;
      top = nextTop;
      bottom = nextBottom;
      root.style.setProperty("--vv-top", `${top}px`);
      root.style.setProperty("--kb", `${bottom}px`);
      root.toggleAttribute("data-keyboard", bottom > KEYBOARD_THRESHOLD);
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }

    // iOS may still scroll the (locked) document to "reveal" the input;
    // undo that so nothing behind jumps — the view follows the visual
    // viewport instead.
    function onWindowScroll() {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      schedule();
    }

    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", onWindowScroll, { passive: true });
    // Keyboard show/hide without a visualViewport event (fallback path).
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    schedule();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", onWindowScroll);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
    };
  }, [rootRef]);
}

/** Lock document scrolling while search is open; restore on close. */
function useScrollLock() {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const { body } = document;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      overscroll: html.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      html.style.overscrollBehavior = prev.overscroll;
    };
  }, []);
}

/**
 * After closing, hand focus back to whatever opens search on the page we
 * return to (the floating button, or the header field on wide screens). The
 * trigger lives outside this route, so wait a few frames for it to mount.
 */
function restoreTriggerFocus(root: HTMLElement | null) {
  let frames = 0;
  function attempt() {
    const candidates = document.querySelectorAll<HTMLElement>(
      '[data-search-trigger], button[aria-label="Search"], header input[type="search"]'
    );
    for (const el of candidates) {
      if (root?.isConnected && root.contains(el)) continue;
      if (el.getClientRects().length === 0) continue; // hidden (e.g. sm:flex)
      el.focus({ preventScroll: true });
      return;
    }
    if (++frames < 90) requestAnimationFrame(attempt);
  }
  requestAnimationFrame(attempt);
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function SearchView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim();
  const historyBack = useHistoryBack();

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState(() => searchParams.get("q") ?? "");

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useScrollLock();
  useVisualViewportInsets(rootRef);

  // Focus on arrival. iOS only raises the keyboard for a focus() inside the
  // user's tap, so the opener (the floating search button) focuses a
  // throwaway input synchronously in its click handler; moving focus from
  // that input to this one keeps the keyboard up. Layout effect = as early as
  // possible after mount, before the opener's throwaway input is removed.
  // preventScroll stops iOS panning the page to reveal the bottom bar; the
  // visualViewport tracking moves the bar above the keyboard instead.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSignedIn(Boolean(data?.authenticated)))
      .catch(() => setSignedIn(false));
  }, []);

  // The URL (`?q=`) is the committed query: typing rewrites it (debounced,
  // replace — no history entry per keystroke) and results follow the URL, so
  // Back from a show page lands on the same results.
  const commit = useCallback(
    (next: string) => {
      if (next === query) return;
      router.replace(searchHref(next), { scroll: false });
    },
    [query, router]
  );

  useEffect(() => {
    const trimmed = input.trim();
    const id = setTimeout(() => commit(trimmed), 300);
    return () => clearTimeout(id);
  }, [input, commit]);

  useEffect(() => {
    if (!signedIn || !query) {
      setResults([]);
      setHasSearched(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ q: query });
    fetch(`/api/tmdb/search?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Search failed");
        }
        return res.json();
      })
      .then((data: { results: SearchResult[] }) => {
        setResults(data.results);
        setHasSearched(true);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
        setHasSearched(true);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [query, signedIn]);

  const close = useCallback(() => {
    inputRef.current?.blur();
    historyBack();
    restoreTriggerFocus(rootRef.current);
  }, [historyBack]);

  // Escape closes; Tab stays inside the view.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !rootRef.current) return;
      const focusables = Array.from(
        rootRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.getClientRects().length > 0);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !rootRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !rootRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    commit(input.trim());
    // The keyboard's Search key: dismiss the keyboard, keep the results.
    inputRef.current?.blur();
  }

  function onClear() {
    setInput("");
    commit("");
    inputRef.current?.focus();
  }

  // Dragging the results dismisses the keyboard, like iOS lists.
  function onResultsTouchMove() {
    if (document.activeElement === inputRef.current) inputRef.current?.blur();
  }

  if (signedIn === false) {
    return <SignInPrompt />;
  }

  const noResults = !loading && !error && hasSearched && results.length === 0;
  const status = loading
    ? ""
    : noResults
      ? `No results for “${query}”`
      : hasSearched && results.length > 0
        ? `${results.length} result${results.length === 1 ? "" : "s"}`
        : "";

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      className="search-view z-50 bg-[#0a0a0a] text-[#ededed]"
    >
      <div
        className="search-results absolute inset-0 overflow-y-auto overscroll-contain px-4"
        onTouchMove={onResultsTouchMove}
      >
        <div className="mx-auto flex min-h-full max-w-3xl flex-col">
          {error && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {loading && results.length === 0 && (
            <p className="text-sm text-gray-500">Searching…</p>
          )}

          {!query && !error && (
            <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
              <SearchIcon className="h-9 w-9 text-gray-700" />
              <p className="mt-3 text-sm text-gray-500">Search TV shows</p>
            </div>
          )}

          {noResults && (
            <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
              <p className="text-base font-medium text-gray-300">No results</p>
              <p className="mt-1 max-w-full break-words text-sm text-gray-500">
                Nothing matches &ldquo;{query}&rdquo;.
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div
              className={`grid grid-cols-3 gap-4 transition-opacity sm:grid-cols-4 md:grid-cols-5 ${
                loading ? "opacity-60" : ""
              }`}
            >
              {results.map((result) => (
                <PosterCard
                  key={`${result.mediaType}-${result.tmdbId}`}
                  result={result}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Darken whatever scrolls under the bar so the glass stays legible. */}
      <div aria-hidden="true" className="search-fade pointer-events-none absolute inset-x-0 bottom-0" />

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      <div className="search-bar absolute inset-x-0 px-4">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5">
          <form
            role="search"
            onSubmit={onSubmit}
            className="glass flex h-[52px] min-w-0 flex-1 items-center rounded-full pl-4 pr-1 transition-shadow focus-within:ring-2 focus-within:ring-white/25"
          >
            <SearchIcon className="h-5 w-5 shrink-0 text-gray-400" />
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Search shows"
              placeholder="Search shows"
              className="search-input h-full min-w-0 flex-1 bg-transparent pl-2.5 pr-1 text-base text-[#ededed] placeholder-gray-500 outline-none"
            />
            {input && (
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={onClear}
                aria-label="Clear search"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white/25 text-[#0a0a0a]">
                  <CloseIcon className="h-3.5 w-3.5" />
                </span>
              </button>
            )}
          </form>
          <button
            type="button"
            onClick={close}
            aria-label="Close search"
            className="glass flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-gray-200 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a]" />}>
      <SearchView />
    </Suspense>
  );
}
