import Image from "next/image";

/**
 * An episode's 16:9 image with the fallbacks the app uses everywhere: the
 * episode still, else the show's backdrop (both 16:9, filling the frame), else
 * the 2:3 poster shown whole inside the frame (cropping a poster to 16:9 cuts
 * faces in half), else a neutral placeholder. The frame's aspect ratio is fixed
 * by CSS, so nothing shifts when (or whether) an image loads.
 *
 * No "use client": rendered from server pages and from client lists alike.
 */
export default function EpisodeArt({
  stillUrl,
  backdropUrl,
  posterUrl,
  sizes,
  priority = false,
  className = "",
}: {
  stillUrl: string | null;
  backdropUrl: string | null;
  posterUrl: string | null;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const wide = stillUrl ?? backdropUrl;
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden bg-[#1c1c1c] ${className}`}
    >
      {wide ? (
        <Image
          src={wide}
          alt=""
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : posterUrl ? (
        <Image
          src={posterUrl}
          alt=""
          fill
          sizes={sizes}
          priority={priority}
          className="object-contain"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-gray-600">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-1/3 max-h-10 w-auto"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="12" rx="2" />
            <path d="M8 21h8" />
          </svg>
        </div>
      )}
    </div>
  );
}
