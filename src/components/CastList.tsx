import Image from "next/image";
import type { TmdbPerson } from "@/lib/tmdb";

/**
 * A titled list of people: round headshot, name, character (and, for the
 * show-level cast, the episode count). One column on phones so names and
 * characters read in full, two from sm up. Names don't link anywhere.
 */
export default function CastList({
  heading,
  people,
  id,
  emptyText,
}: {
  heading: string;
  people: TmdbPerson[];
  id?: string;
  // Shown under the heading when there is nobody; without it an empty list
  // renders nothing at all.
  emptyText?: string;
}) {
  if (people.length === 0 && !emptyText) return null;
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2
        id={id}
        className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500"
      >
        {heading}
        {people.length > 0 && (
          <span className="ml-2 font-normal normal-case tracking-normal text-gray-600">
            {people.length}
          </span>
        )}
      </h2>
      {people.length === 0 && (
        <p className="text-sm text-gray-500">{emptyText}</p>
      )}
      <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {people.map((p) => (
          <li key={`${p.id}-${p.character}`} className="flex items-center gap-3 py-1.5">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[#1c1c1c]">
              {p.profileUrl ? (
                <Image
                  src={p.profileUrl}
                  alt=""
                  fill
                  sizes="44px"
                  className="object-cover object-[center_20%]"
                />
              ) : (
                <span className="flex h-full items-center justify-center text-sm font-medium text-gray-500">
                  {p.name.slice(0, 1)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm">{p.name}</p>
              {(p.character || p.episodeCount) && (
                <p className="truncate text-xs text-gray-400">
                  {p.character}
                  {p.episodeCount ? (
                    <span className="text-gray-600">
                      {p.character ? " · " : ""}
                      {p.episodeCount} {p.episodeCount === 1 ? "episode" : "episodes"}
                    </span>
                  ) : null}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
