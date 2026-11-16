export default function Loading() {
  return (
    <div className="min-h-screen animate-pulse bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-3xl pb-16 sm:px-4 sm:pt-6">
        <div className="aspect-video w-full bg-[#141414] sm:rounded-lg" />
        <div className="px-4 sm:px-0">
          <div className="mt-4 h-4 w-40 rounded bg-[#1c1c1c]" />
          <div className="mt-2 h-6 w-3/4 rounded bg-[#1c1c1c]" />
          <div className="mt-2 h-4 w-32 rounded bg-[#141414]" />
          <div className="mt-4 h-9 w-16 rounded-full bg-[#1c1c1c]" />

          <div className="mt-8 h-3 w-24 rounded bg-[#1c1c1c]" />
          <div className="mt-3 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-11 w-11 shrink-0 rounded-full bg-[#1c1c1c]" />
                <div className="min-w-0 flex-1">
                  <div className="h-3.5 w-1/3 rounded bg-[#1c1c1c]" />
                  <div className="mt-1.5 h-3 w-1/4 rounded bg-[#141414]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
