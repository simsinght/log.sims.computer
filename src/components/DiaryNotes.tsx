"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";

// The lexicon's limit on computer.sims.log.watch#note (also enforced by
// PUT /api/log/note).
const MAX_NOTE = 300;

const sectionHeading =
  "text-sm font-semibold uppercase tracking-wide text-gray-500";

export interface NoteWatch {
  rkey: string;
  watchedAt: string;
  note?: string;
}

export interface NoteListItem extends NoteWatch {
  note: string;
  // "S2 · E4 — Title"
  label: string;
  href: string;
}

function graphemes(s: string): number {
  try {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s),
    ).length;
  } catch {
    return s.length;
  }
}

function formatDate(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

// The watch date, in the viewer's timezone once mounted. The server can't know
// it, so the first (hydrated) render is UTC and swaps after mount; the two only
// differ for a watch logged late in the evening.
function WatchDate({ iso }: { iso: string }) {
  const [text, setText] = useState(() => formatDate(iso, "UTC"));
  useEffect(() => setText(formatDate(iso)), [iso]);
  if (!text) return null;
  return <time dateTime={iso}>{text}</time>;
}

function PencilIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

async function saveNote(rkey: string, note: string): Promise<string | null> {
  const res = await fetch("/api/log/note", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rkey, note }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    note?: string | null;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "Couldn't save the note.");
  return data.note ?? null;
}

/**
 * The note text field with Save / Cancel (and Delete for an existing note).
 * Saving an empty field clears the note.
 */
function NoteEditor({
  rkey,
  initial,
  ariaLabel,
  onDone,
  onCancel,
}: {
  rkey: string;
  initial: string;
  ariaLabel: string;
  onDone: (note: string | null) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const count = graphemes(value.trim());
  const tooLong = count > MAX_NOTE;
  const unchanged = value.trim() === initial.trim();

  async function submit(next: string, kind: "save" | "delete") {
    setSaving(kind);
    setError(null);
    try {
      onDone(await saveNote(rkey, next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the note.");
      setSaving(null);
    }
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !saving) onCancel();
        }}
        aria-label={ariaLabel}
        rows={4}
        autoFocus
        placeholder="What did you think?"
        className="block w-full resize-y rounded-lg border border-gray-700 bg-[#0a0a0a] px-3 py-2 text-base leading-relaxed text-gray-100 placeholder-gray-600 outline-none focus:border-gray-500"
      />
      <div className="mt-1 flex justify-end">
        <span
          className={`text-xs tabular-nums ${tooLong ? "text-red-300" : "text-gray-600"}`}
        >
          {count}/{MAX_NOTE}
        </span>
      </div>
      {error && (
        <p className="mt-2 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        {initial && (
          <button
            type="button"
            onClick={() => submit("", "delete")}
            disabled={saving !== null}
            className="-ml-3 min-h-11 px-3 text-sm font-medium text-red-300 transition-colors hover:text-red-200 disabled:opacity-50"
          >
            {saving === "delete" ? "Deleting…" : "Delete note"}
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          disabled={saving !== null}
          className="min-h-11 rounded-full px-4 text-sm font-medium text-gray-300 transition-colors hover:text-white disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => submit(value, "save")}
          disabled={saving !== null || tooLong || unchanged}
          className="min-h-11 rounded-full bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:opacity-50"
        >
          {saving === "save" ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/**
 * One of the user's notes: a quiet panel (so it never reads as TMDB's
 * synopsis), its heading line, the text with its line breaks, and an Edit
 * button that turns the panel into the editor in place.
 */
function NoteCard({
  rkey,
  note,
  heading,
  editLabel,
  onChange,
}: {
  rkey: string;
  note: string;
  heading: React.ReactNode;
  editLabel: string;
  onChange: (note: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 pb-3">
      <div className="flex min-h-11 items-center gap-2">
        <div className="min-w-0 flex-1 text-xs text-gray-500">{heading}</div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={editLabel}
            className="-mr-3 flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-sm font-medium text-gray-400 transition-colors hover:text-white"
          >
            <PencilIcon className="h-3.5 w-3.5" />
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <NoteEditor
          rkey={rkey}
          initial={note}
          ariaLabel={editLabel}
          onCancel={() => setEditing(false)}
          onDone={(next) => {
            setEditing(false);
            onChange(next);
          }}
        />
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-200">
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * The episode page's note(s): one panel per watch of this episode that has a
 * note (oldest first — a rewatch adds its own). With watches but no note yet,
 * an "Add a note" button writes one onto the most recent watch.
 */
export function EpisodeNotes({
  label,
  watches: initial,
}: {
  // "S2E4", for accessible names.
  label: string;
  watches: NoteWatch[];
}) {
  const [watches, setWatches] = useState(initial);
  const [adding, setAdding] = useState(false);
  const withNotes = watches.filter((w) => w.note);
  const latest = watches.reduce<NoteWatch | null>(
    (best, w) => (!best || w.watchedAt > best.watchedAt ? w : best),
    null,
  );
  const update = (rkey: string, note: string | null) =>
    setWatches((ws) =>
      ws.map((w) => (w.rkey === rkey ? { ...w, note: note ?? undefined } : w)),
    );

  if (watches.length === 0) return null;

  if (withNotes.length === 0) {
    if (!latest) return null;
    return adding ? (
      <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
        <NoteEditor
          rkey={latest.rkey}
          initial=""
          ariaLabel={`Note for ${label}`}
          onCancel={() => setAdding(false)}
          onDone={(next) => {
            setAdding(false);
            update(latest.rkey, next);
          }}
        />
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="-ml-3 mt-2 flex min-h-11 items-center gap-1.5 px-3 text-sm font-medium text-gray-400 transition-colors hover:text-white"
      >
        <PencilIcon className="h-3.5 w-3.5" />
        Add a note
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {withNotes.map((w) => (
        <NoteCard
          key={w.rkey}
          rkey={w.rkey}
          note={w.note as string}
          editLabel={`Edit note for ${label}`}
          heading={
            <>
              <span className="font-semibold uppercase tracking-wide">
                Your note
              </span>
              {w.watchedAt && (
                <>
                  <span className="text-gray-600"> · </span>
                  <WatchDate iso={w.watchedAt} />
                </>
              )}
            </>
          }
          onChange={(note) => update(w.rkey, note)}
        />
      ))}
    </div>
  );
}

/**
 * The "Notes" section at the bottom of the show and season pages: every note
 * the user wrote on the show's (or season's) episodes, in episode order, each
 * linking to its episode and editable in place. Renders nothing when there
 * are none (or the last one is deleted).
 */
export function NotesSection({ items: initial }: { items: NoteListItem[] }) {
  const [items, setItems] = useState(initial);
  const headingId = useId();
  if (items.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className={`mb-3 ${sectionHeading}`}>
        Notes
        <span className="ml-2 font-normal normal-case tracking-normal text-gray-600">
          {items.length}
        </span>
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <NoteCard
            key={item.rkey}
            rkey={item.rkey}
            note={item.note}
            editLabel={`Edit note for ${item.label}`}
            heading={
              // Label and date together are the link: a 44px+ tap target.
              <Link
                href={item.href}
                prefetch={false}
                className="group block py-1.5"
              >
                <span className="block truncate text-sm font-medium text-gray-200 transition-colors group-hover:text-white">
                  {item.label}
                </span>
                {item.watchedAt && (
                  <span className="block">
                    <WatchDate iso={item.watchedAt} />
                  </span>
                )}
              </Link>
            }
            onChange={(note) =>
              setItems((list) =>
                note
                  ? list.map((i) => (i.rkey === item.rkey ? { ...i, note } : i))
                  : list.filter((i) => i.rkey !== item.rkey),
              )
            }
          />
        ))}
      </div>
    </section>
  );
}
