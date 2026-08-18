export default function Loading() {
  return (
    <div className="min-h-screen animate-pulse bg-[#0a0a0a] text-[#ededed]">
      <div className="h-48 w-full bg-[#141414] sm:h-64" />

      <div className="container mx-auto max-w-3xl px-4 pb-16">
        <div className="relative -mt-7">
          <div className="flex gap-4">
            <div className="aspect-[2/3] w-24 shrink-0 rounded-md bg-[#1c1c1c] sm:w-32" />
            <div className="min-w-0 flex-1 pt-2">
              <div className="h-7 w-2/3 rounded bg-[#1c1c1c]" />
              <div className="mt-3 h-4 w-16 rounded bg-[#1c1c1c]" />
            </div>
          </div>

          <div className="mt-4 h-9 w-40 rounded-full bg-[#1c1c1c]" />

          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded bg-[#141414]" />
            <div className="h-3 w-11/12 rounded bg-[#141414]" />
            <div className="h-3 w-2/3 rounded bg-[#141414]" />
          </div>
        </div>

        <div className="mt-8 space-y-2">
          <div className="mb-3 h-3 w-20 rounded bg-[#1c1c1c]" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-[#141414] px-4 py-4"
            >
              <div className="h-4 w-28 rounded bg-[#1c1c1c]" />
              <div className="h-3 w-20 rounded bg-[#1c1c1c]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
