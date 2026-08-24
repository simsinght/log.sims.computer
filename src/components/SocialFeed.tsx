"use client";

import { useState } from "react";
import Link from "next/link";
import type { DiaryDay, DiaryEntry } from "@/lib/diary";

type Filter = "all" | "diary";

// "Parties" slots in here later; this slice ships All + Diary, both diary-only.
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "diary", label: "Diary" },
];

function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function EntryRow({ entry }: { entry: DiaryEntry }) {
  const tmdbId = Number(entry.tmdbId);
  const linkable =
    entry.mediaType === "tv" && Number.isInteger(tmdbId) && tmdbId > 0;
  const time = entry.watchedAt.includes("T") ? formatTime(entry.watchedAt) : "";

  return (
    <div className="border-l-2 border-gray-800 py-3 pl-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        {linkable ? (
          <Link
            href={`/show/${tmdbId}`}
            prefetch={false}
            className="font-medium transition-colors hover:text-white hover:underline"
          >
            {entry.title}
          </Link>
        ) : (
          <span className="font-medium">{entry.title}</span>
        )}
        {entry.year && (
          <span className="text-sm text-gray-500">{entry.year}</span>
        )}
        {entry.season !== undefined && (
          <span className="text-sm text-gray-400">
            S{entry.season}
            {entry.episode !== undefined ? `E${entry.episode}` : ""}
          </span>
        )}
        {entry.rewatch && (
          <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Rewatch
          </span>
        )}
        {time && (
          <span
            suppressHydrationWarning
            className="ml-auto text-xs text-gray-600"
          >
            {time}
          </span>
        )}
      </div>
      {entry.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs text-gray-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {entry.note && (
        <p className="mt-1.5 text-sm text-gray-400">{entry.note}</p>
      )}
    </div>
  );
}

function DiaryDays({ days }: { days: DiaryDay[] }) {
  return (
    <div className="space-y-8">
      {days.map((day) => (
        <section key={day.date}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {formatDay(day.date)}
          </h2>
          <div className="space-y-1">
            {day.entries.map((entry) => (
              <EntryRow key={entry.uri} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function SocialFeed({ days }: { days: DiaryDay[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Filter social feed"
        className="mb-8 flex gap-2"
      >
        {FILTERS.map((f) => {
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-white text-black"
                  : "border border-gray-800 bg-[#141414] text-gray-300 hover:border-gray-600 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {days.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-800 p-12 text-center text-gray-500">
          <p>Nothing logged yet.</p>
          <Link
            href="/search"
            className="mt-3 inline-block text-sm font-medium text-gray-300 transition-colors hover:text-white hover:underline"
          >
            Search shows
          </Link>
        </div>
      ) : (
        <DiaryDays days={days} />
      )}
    </div>
  );
}
