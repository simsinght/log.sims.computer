"use client";

import { useEffect, useMemo, useState } from "react";
import WheelDatePicker from "@/components/WheelDatePicker";

export interface LogTarget {
  tmdbId: number;
  mediaType: "tv";
  title: string;
  year: string | null;
  season: number;
  episode: number;
  episodeName?: string;
}

function todayNoon(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
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

  const tags = useMemo(() => parseTags(tagsInput), [tagsInput]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const watchedAt =
        when === "now" ? new Date().toISOString() : pickedDate.toISOString();
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
        role="dialog"
        aria-modal="true"
        className="tvlog-panel flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-800 bg-[#141414] text-[#ededed] shadow-xl sm:max-w-md sm:rounded-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-gray-700 sm:hidden" />

        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Log</p>
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

        {done ? (
          <div className="space-y-4 px-6 pb-6">
            <div className="rounded-lg border border-green-900/60 bg-green-950/30 px-4 py-3 text-sm text-green-300">
              Logged {target.title}.
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6">
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
                <WheelDatePicker value={pickedDate} onChange={setPickedDate} />
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
