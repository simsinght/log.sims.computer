"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WheelDatePicker from "@/components/WheelDatePicker";

export interface LogTarget {
  tmdbId: number;
  mediaType: "tv";
  title: string;
  year: string | null;
  season: number;
  episode: number;
  episodeName?: string;
  airDate?: string | null;
}

function todayNoon(): Date {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    12,
    0,
    0,
    0,
  );
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// A YYYY-MM-DD air date as a local-noon Date, or null when it is missing,
// malformed, or still in the future.
function airDateNoon(raw: string | null | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (localDateKey(date) !== raw) return null;
  if (raw > localDateKey(new Date())) return null;
  return date;
}

const DRAG_START_PX = 8;
const DISMISS_PX = 90;
const FLICK_PX_PER_MS = 0.5;
const FLICK_MIN_PX = 24;

interface SheetDrag {
  pointerId: number;
  startX: number;
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
  dy: number;
  active: boolean;
}

function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\s]+/)) {
    const tag = part.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

type When = "now" | "other";

interface EpisodePosition {
  season: number;
  episode: number;
}

type CatchUpPlan =
  | { state: "counting" }
  | { state: "error" }
  | {
      state: "ready";
      count: number;
      first: EpisodePosition | null;
      last: EpisodePosition | null;
    };

function positionLabel(p: EpisodePosition): string {
  return `S${p.season}E${p.episode}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function catchUpHelperText(
  plan: CatchUpPlan | null,
  targetLabel: string,
): string {
  if (!plan) return "Also log every earlier episode you haven't watched";
  if (plan.state === "counting") return "Counting…";
  if (plan.state === "error") return "Couldn't count earlier episodes";
  if (plan.count === 0) return `You're already caught up before ${targetLabel}`;
  const range =
    plan.first && plan.last
      ? plan.first.season === plan.last.season &&
        plan.first.episode === plan.last.episode
        ? ` (${positionLabel(plan.first)})`
        : ` (${positionLabel(plan.first)} – ${positionLabel(plan.last)})`
      : "";
  return `Also logs ${plural(plan.count, "earlier episode")}${range}`;
}

export default function LogDialog({
  target,
  onClose,
  onLogged,
}: {
  target: LogTarget;
  onClose: () => void;
  onLogged?: () => void;
}) {
  const [when, setWhen] = useState<When>("now");
  const [pickedDate, setPickedDate] = useState<Date>(() => todayNoon());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [note, setNote] = useState("");
  const [rewatch, setRewatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [catchUp, setCatchUp] = useState(false);
  const [catchUpPlan, setCatchUpPlan] = useState<CatchUpPlan | null>(null);
  const [catchUpAdded, setCatchUpAdded] = useState(0);
  const [catchUpWarning, setCatchUpWarning] = useState<string | null>(null);
  const dryRunSeq = useRef(0);

  const catchUpEligible =
    target.mediaType === "tv" && (target.season > 1 || target.episode > 1);
  const episodeLabel = `S${target.season}E${target.episode}`;

  function currentWatchedAt(): string {
    return when === "now" ? new Date().toISOString() : pickedDate.toISOString();
  }

  async function onToggleCatchUp(checked: boolean) {
    setCatchUp(checked);
    const seq = ++dryRunSeq.current;
    if (!checked) {
      setCatchUpPlan(null);
      return;
    }
    setCatchUpPlan({ state: "counting" });
    try {
      const res = await fetch("/api/log/catch-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: target.tmdbId,
          title: target.title,
          season: target.season,
          episode: target.episode,
          watchedAt: currentWatchedAt(),
          dryRun: true,
        }),
      });
      if (!res.ok) throw new Error("count failed");
      const data = (await res.json()) as {
        count: number;
        first: EpisodePosition | null;
        last: EpisodePosition | null;
      };
      if (seq !== dryRunSeq.current) return;
      setCatchUpPlan({
        state: "ready",
        count: data.count,
        first: data.first,
        last: data.last,
      });
    } catch {
      if (seq !== dryRunSeq.current) return;
      setCatchUpPlan({ state: "error" });
    }
  }

  const tags = useMemo(() => parseTags(tagsInput), [tagsInput]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const airDate = useMemo(() => airDateNoon(target.airDate), [target.airDate]);
  const airDateLabel = useMemo(
    () =>
      airDate
        ? new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }).format(airDate)
        : null,
    [airDate],
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<SheetDrag | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!window.matchMedia("(max-width: 639px)").matches) return;
    const from = e.target as HTMLElement;
    // The wheel columns scroll themselves and the fields need their own
    // pointer handling, so gestures starting there are never sheet drags.
    if (from.closest(".wheel-col, input, textarea")) return;
    const fromHeader = headerRef.current?.contains(from) ?? false;
    const atTop = (scrollRef.current?.scrollTop ?? 0) <= 0;
    if (!fromHeader && !atTop) return;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      dy: 0,
      active: false,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const panel = panelRef.current;
    if (!state || !panel || e.pointerId !== state.pointerId) return;

    const dy = e.clientY - state.startY;
    const dx = e.clientX - state.startX;
    if (!state.active) {
      // Claim the gesture only once it reads as a downward drag; an upward or
      // sideways move belongs to the content and releases the sheet's claim.
      if (dy > DRAG_START_PX && dy > Math.abs(dx)) {
        state.active = true;
        panel.setPointerCapture(state.pointerId);
        panel.style.animation = "none";
        panel.style.transition = "none";
      } else {
        if (dy < -DRAG_START_PX || Math.abs(dx) > DRAG_START_PX) {
          drag.current = null;
        }
        return;
      }
    }

    const dt = e.timeStamp - state.lastT;
    if (dt > 0) {
      state.velocity = (e.clientY - state.lastY) / dt;
      state.lastY = e.clientY;
      state.lastT = e.timeStamp;
    }
    state.dy = Math.max(0, dy);
    panel.style.transform = `translateY(${state.dy}px)`;
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const panel = panelRef.current;
    if (!state || e.pointerId !== state.pointerId) return;
    drag.current = null;
    if (!state.active || !panel) return;
    if (panel.hasPointerCapture(state.pointerId)) {
      panel.releasePointerCapture(state.pointerId);
    }
    const flicked = state.velocity > FLICK_PX_PER_MS && state.dy > FLICK_MIN_PX;
    if (state.dy > DISMISS_PX || flicked) {
      onClose();
      return;
    }
    panel.style.transition = "transform .2s cubic-bezier(.32,.72,0,1)";
    panel.style.transform = "translateY(0)";
  }

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    setCatchUpWarning(null);
    try {
      const watchedAt = currentWatchedAt();
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: target.tmdbId,
          mediaType: target.mediaType,
          title: target.title,
          watchedAt,
          tags,
          note: note.trim() || undefined,
          rewatch,
          season: target.season,
          episode: target.episode,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to log");
      }

      // The primary log succeeded from here on, so a catch-up failure is a
      // warning on the success panel rather than a failed submit.
      if (catchUpEligible && catchUp) {
        try {
          const catchUpRes = await fetch("/api/log/catch-up", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tmdbId: target.tmdbId,
              title: target.title,
              season: target.season,
              episode: target.episode,
              watchedAt,
            }),
          });
          const body = await catchUpRes.json().catch(() => ({}));
          if (!catchUpRes.ok) {
            throw new Error(body.error ?? "Failed to catch up");
          }
          setCatchUpAdded(typeof body.added === "number" ? body.added : 0);
        } catch (err) {
          setCatchUpWarning(
            err instanceof Error ? err.message : "Failed to catch up",
          );
        }
      }

      setDone(true);
      onLogged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="tvlog-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{tvlogStyles}</style>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className="tvlog-panel flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-800 bg-[#141414] text-[#ededed] shadow-xl sm:max-w-md sm:rounded-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div ref={headerRef} className="shrink-0 touch-none">
          <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-gray-700 sm:hidden" />

          <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Log
              </p>
              <h2 className="mt-1 text-lg font-semibold leading-tight">
                {target.title}
                {target.year && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    {target.year}
                  </span>
                )}
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                S{target.season}E{target.episode}
                {target.episodeName ? ` · ${target.episodeName}` : ""}
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 text-2xl leading-none text-gray-500 transition-colors hover:text-gray-300"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>

        {done ? (
          <div className="space-y-4 px-6 pb-6">
            <div className="rounded-lg border border-green-900/60 bg-green-950/30 px-4 py-3 text-sm text-green-300">
              <p>Logged {target.title}.</p>
              {catchUpAdded > 0 && (
                <p className="mt-1">
                  Also logged {plural(catchUpAdded, "earlier episode")}.
                </p>
              )}
            </div>
            {catchUpWarning && (
              <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
                Logged {episodeLabel}, but catching up failed: {catchUpWarning}
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6"
            >
              <div
                role="radiogroup"
                aria-label="When did you watch this?"
                className="grid grid-cols-2 gap-1 rounded-lg border border-gray-800 bg-[#0a0a0a] p-1"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={when === "now"}
                  onClick={() => setWhen("now")}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    when === "now"
                      ? "bg-white text-black"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Just Finished
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={when === "other"}
                  onClick={() => setWhen("other")}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    when === "other"
                      ? "bg-white text-black"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Other
                </button>
              </div>

              {when === "other" && (
                <div className="space-y-2">
                  <WheelDatePicker
                    value={pickedDate}
                    onChange={setPickedDate}
                  />
                  {airDate && (
                    <button
                      type="button"
                      onClick={() => setPickedDate(airDate)}
                      aria-label="Use air date"
                      className="w-full rounded-lg border border-gray-800 px-3 py-2 text-xs text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
                    >
                      Aired {airDateLabel} · use this date
                    </button>
                  )}
                </div>
              )}

              {catchUpEligible && (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-800 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={catchUp}
                    onChange={(e) => onToggleCatchUp(e.target.checked)}
                    aria-label="Catch up"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-700 bg-[#0a0a0a]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-200">
                      Catch up
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {catchUpHelperText(catchUpPlan, episodeLabel)}
                    </span>
                  </span>
                </label>
              )}

              <div className="rounded-lg border border-gray-800">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((v) => !v)}
                  aria-expanded={detailsOpen}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm text-gray-400 transition-colors hover:text-gray-200"
                >
                  <span>Add tags or a note</span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`h-4 w-4 shrink-0 transition-transform ${
                      detailsOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {detailsOpen && (
                  <div className="space-y-4 border-t border-gray-800 px-3 py-3">
                    <label className="block">
                      <span className="mb-1 block text-sm text-gray-400">
                        Tags
                      </span>
                      <input
                        type="text"
                        value={tagsInput}
                        onChange={(e) => setTagsInput(e.target.value)}
                        placeholder="with-alex at-home rewatch…"
                        className="w-full rounded-lg border border-gray-800 bg-[#0a0a0a] px-3 py-2 text-sm placeholder-gray-600 outline-none focus:border-gray-600"
                      />
                      {tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs text-gray-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm text-gray-400">
                        Note
                      </span>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder="Optional"
                        className="w-full resize-none rounded-lg border border-gray-800 bg-[#0a0a0a] px-3 py-2 text-sm placeholder-gray-600 outline-none focus:border-gray-600"
                      />
                    </label>

                    <label className="flex items-center gap-2 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        checked={rewatch}
                        onChange={(e) => setRewatch(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-700 bg-[#0a0a0a]"
                      />
                      Rewatch
                    </label>
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}
            </div>

            <div className="px-6 pb-6 pt-4">
              <button
                onClick={onSubmit}
                disabled={submitting}
                className="w-full rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:opacity-50"
              >
                {submitting ? "Logging…" : "Log watch"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const tvlogStyles = `
@keyframes tvlogBackdrop { from { opacity: 0 } to { opacity: 1 } }
@keyframes tvlogSheet { from { transform: translateY(100%) } to { transform: translateY(0) } }
@keyframes tvlogDialog { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
.tvlog-backdrop { animation: tvlogBackdrop .2s ease-out; }
.tvlog-panel { animation: tvlogSheet .28s cubic-bezier(.32,.72,0,1); }
@media (min-width: 640px) { .tvlog-panel { animation: tvlogDialog .18s ease-out; } }
.wheel-col { scrollbar-width: none; -ms-overflow-style: none; }
.wheel-col::-webkit-scrollbar { display: none; }
`;
