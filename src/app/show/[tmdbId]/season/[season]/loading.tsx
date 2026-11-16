export default function Loading() {
  return (
    <div className="min-h-screen animate-pulse bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-3xl px-4 pb-16 pt-6">
        <div className="h-4 w-24 rounded bg-[#1c1c1c]" />
        <div className="mt-2 h-7 w-40 rounded bg-[#1c1c1c]" />
        <div className="mt-2 h-4 w-32 rounded bg-[#141414]" />

        <div className="mt-5 divide-y divide-gray-800/70">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <div className="aspect-video w-24 shrink-0 rounded bg-[#1c1c1c] sm:w-28" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-3/4 rounded bg-[#1c1c1c]" />
                <div className="mt-2 h-3 w-20 rounded bg-[#141414]" />
              </div>
              <div className="h-6 w-12 shrink-0 rounded-full bg-[#1c1c1c]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
