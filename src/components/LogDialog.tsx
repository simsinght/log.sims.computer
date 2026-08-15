"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface LogTarget {
  tmdbId: number;
  mediaType: "tv";
  title: string;
  year: string | null;
}

function todayLocal(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
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

export default function LogDialog({
  target,
  onClose,
}: {
  target: LogTarget;
  onClose: () => void;
}) {
  const [watchedAt, setWatchedAt] = useState(todayLocal());
  const [tagsInput, setTagsInput] = useState("");
  const [note, setNote] = useState("");
  const [rewatch, setRewatch] = useState(false);
  const [season, setSeason] = useState("");
  const [episode, setEpisode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

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
          season: season ? Number(season) : undefined,
          episode: episode ? Number(episode) : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to log");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-gray-800 bg-[#141414] p-6 text-[#ededed] shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
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
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-gray-500 transition-colors hover:text-gray-300"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {done ? (
          <div className="space-y-4">
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
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-gray-400">Watched</span>
              <input
                type="date"
                value={watchedAt}
                max={todayLocal()}
                onChange={(e) => setWatchedAt(e.target.value)}
                className="w-full rounded-lg border border-gray-800 bg-[#0a0a0a] px-3 py-2 text-sm outline-none focus:border-gray-600"
              />
            </label>

            <div className="flex gap-3">
              <label className="block flex-1">
                <span className="mb-1 block text-sm text-gray-400">Season</span>
                <input
                  type="number"
                  min="0"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  placeholder="—"
                  className="w-full rounded-lg border border-gray-800 bg-[#0a0a0a] px-3 py-2 text-sm outline-none focus:border-gray-600"
                />
              </label>
              <label className="block flex-1">
                <span className="mb-1 block text-sm text-gray-400">Episode</span>
                <input
                  type="number"
                  min="0"
                  value={episode}
                  onChange={(e) => setEpisode(e.target.value)}
                  placeholder="—"
                  className="w-full rounded-lg border border-gray-800 bg-[#0a0a0a] px-3 py-2 text-sm outline-none focus:border-gray-600"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm text-gray-400">Tags</span>
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
              <span className="mb-1 block text-sm text-gray-400">Note</span>
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

            {error && (
              <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={onSubmit}
              disabled={submitting}
              className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:opacity-50"
            >
              {submitting ? "Logging…" : "Log watch"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
