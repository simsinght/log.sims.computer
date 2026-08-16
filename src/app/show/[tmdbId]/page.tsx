import Image from "next/image";
import { notFound } from "next/navigation";
import { getShowDetail, isConfigured } from "@/lib/tmdb";
import ShowSeasons from "@/components/ShowSeasons";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

export default async function ShowPage({
  params,
}: {
  params: Promise<{ tmdbId: string }>;
}) {
  const { tmdbId: raw } = await params;
  const tmdbId = Number(raw);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !isConfigured()) {
    notFound();
  }

  let show;
  try {
    show = await getShowDetail(tmdbId);
  } catch {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      {show.backdropUrl && (
        <div className="relative h-48 w-full sm:h-64">
          <Image
            src={show.backdropUrl}
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-top opacity-40"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
        </div>
      )}

      <div className="container mx-auto max-w-3xl px-4 pb-16">
        <div className={show.backdropUrl ? "-mt-16 relative" : "pt-12"}>
          <BackLink />

          <div className="mt-4 flex gap-4">
            {show.posterUrl && (
              <div className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-md bg-gray-800 sm:w-32">
                <Image
                  src={show.posterUrl}
                  alt={show.title}
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                {show.title}
              </h1>
              {show.year && (
                <p className="mt-1 text-gray-400">{show.year}</p>
              )}
            </div>
          </div>

          {show.overview && (
            <p className="mt-4 text-sm leading-relaxed text-gray-300">
              {show.overview}
            </p>
          )}
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Seasons
          </h2>
          {show.seasons.length === 0 ? (
            <p className="text-sm text-gray-500">No seasons listed.</p>
          ) : (
            <ShowSeasons
              tmdbId={show.tmdbId}
              title={show.title}
              year={show.year}
              seasons={show.seasons}
            />
          )}
        </div>
      </div>
    </div>
  );
}
