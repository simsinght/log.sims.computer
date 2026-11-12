// Pulsing day sections shown while the diary loads: by loading.tsx during
// navigation, and by SocialFeed until it has grouped entries in the viewer's
// timezone after mount.
export default function SocialFeedSkeleton() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 3 }).map((_, s) => (
        <section key={s}>
          <div className="mb-2 h-4 w-40 animate-pulse rounded bg-[#141414]" />
          <div className="space-y-1">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="border-l-2 border-gray-800 py-3 pl-4"
              >
                <div className="h-4 w-2/3 animate-pulse rounded bg-[#141414]" />
                <div className="mt-2 h-3 w-24 animate-pulse rounded bg-[#141414]" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
