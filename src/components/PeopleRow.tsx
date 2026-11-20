"use client";

import Image from "next/image";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { TmdbPerson } from "@/lib/tmdb";

export interface PeopleGroup {
  id: string;
  label: string;
  people: TmdbPerson[];
}

const sectionHeading =
  "text-sm font-semibold uppercase tracking-wide text-gray-500";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function PersonCard({
  person,
  showEpisodes,
}: {
  person: TmdbPerson;
  showEpisodes: boolean;
}) {
  return (
    <li className="w-24 shrink-0 snap-start">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-[#1c1c1c]">
        {person.profileUrl ? (
          <Image
            src={person.profileUrl}
            alt=""
            fill
            sizes="96px"
            loading="lazy"
            className="object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-full items-center justify-center text-xl font-medium text-gray-500"
          >
            {initials(person.name)}
          </span>
        )}
      </div>
      {/* Fixed-height text blocks keep every card the same height. */}
      <p className="mt-2 line-clamp-2 h-10 text-sm leading-5">{person.name}</p>
      <p className="line-clamp-2 h-8 text-xs leading-4 text-gray-400">
        {person.role}
      </p>
      {showEpisodes && (
        <p className="h-4 truncate text-xs leading-4 text-gray-600">
          {person.episodeCount
            ? `${person.episodeCount} ${person.episodeCount === 1 ? "episode" : "episodes"}`
            : ""}
        </p>
      )}
    </li>
  );
}

/**
 * People (cast, guest stars, crew) as one horizontally scrolling row of
 * cards. With more than one non-empty group, a segmented control (a tablist)
 * switches which group the row shows; with one it is just a heading; with
 * none the section isn't rendered. Every group arrives as props, so
 * switching never fetches.
 *
 * The row bleeds out of the page's 16px side padding (-mx-4) and puts it back
 * as padding + scroll padding, so the first card lines up with the text above
 * and the last card can scroll fully clear of the edge.
 */
export default function PeopleRow({
  groups,
  idPrefix,
  label = "Cast & crew",
}: {
  // In display order; the first non-empty group is selected on load.
  groups: PeopleGroup[];
  idPrefix: string;
  label?: string;
}) {
  const visible = groups.filter((g) => g.people.length > 0);
  const [selectedId, setSelectedId] = useState(visible[0]?.id ?? "");
  const rowRef = useRef<HTMLUListElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // A new group starts at its first card.
  useLayoutEffect(() => {
    if (rowRef.current) rowRef.current.scrollLeft = 0;
  }, [selectedId]);

  if (visible.length === 0) return null;
  const selected = visible.find((g) => g.id === selectedId) ?? visible[0];
  const tabbed = visible.length > 1;
  const tabId = (g: PeopleGroup) => `${idPrefix}-tab-${g.id}`;
  const panelId = `${idPrefix}-panel`;
  const headingId = `${idPrefix}-heading`;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (index + 1) % visible.length;
    else if (e.key === "ArrowLeft")
      next = (index - 1 + visible.length) % visible.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = visible.length - 1;
    if (next === null) return;
    e.preventDefault();
    setSelectedId(visible[next].id);
    tabRefs.current[next]?.focus();
  };

  const showEpisodes = selected.people.some((p) => p.episodeCount);

  return (
    <section aria-labelledby={headingId} className="mt-8">
      {tabbed ? (
        <>
          <h2 id={headingId} className="sr-only">
            {label}
          </h2>
          <div
            role="tablist"
            aria-label={label}
            className="glass relative mb-3 flex rounded-full p-1"
          >
            {/* The selected-segment thumb: one capsule that slides between
                the equal-width segments (decorative; aria-selected carries
                the state). */}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-full bg-white/[0.2] shadow-[0_2px_6px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.28),inset_0_0_0_0.5px_rgb(255_255_255/0.14)] transition-transform duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
              style={{
                width: `calc((100% - 0.5rem) / ${visible.length})`,
                transform: `translateX(${visible.indexOf(selected) * 100}%)`,
              }}
            />
            {visible.map((g, i) => {
              const active = g.id === selected.id;
              return (
                <button
                  key={g.id}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={tabId(g)}
                  aria-selected={active}
                  aria-controls={panelId}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setSelectedId(g.id)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className={`relative flex min-h-11 min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:transition-none ${
                    active
                      ? "text-white"
                      : "text-white/55 [@media(hover:hover)]:hover:text-white/80"
                  }`}
                >
                  {g.label}
                  <span
                    className={`text-xs font-normal tabular-nums ${active ? "text-white/65" : "text-white/35"}`}
                  >
                    {g.people.length}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <h2 id={headingId} className={`mb-3 ${sectionHeading}`}>
          {selected.label}
          <span className="ml-2 font-normal normal-case tracking-normal text-gray-600">
            {selected.people.length}
          </span>
        </h2>
      )}
      <div
        id={tabbed ? panelId : undefined}
        role={tabbed ? "tabpanel" : undefined}
        aria-labelledby={tabbed ? tabId(selected) : undefined}
      >
        <ul
          ref={rowRef}
          // Focusable so the row can be scrolled with the arrow keys.
          tabIndex={0}
          aria-label={tabbed ? undefined : selected.label}
          className="no-scrollbar -mx-4 flex snap-x snap-proximity scroll-pl-4 gap-3 overflow-x-auto overscroll-x-contain pl-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40"
        >
          {selected.people.map((p, i) => (
            <PersonCard
              key={`${p.id}-${i}`}
              person={p}
              showEpisodes={showEpisodes}
            />
          ))}
          {/* With the 12px gap, restores the 16px right inset at the end of
              the row (end padding on a scroller is unreliable in Safari). */}
          <li aria-hidden className="w-1 shrink-0" />
        </ul>
      </div>
    </section>
  );
}
