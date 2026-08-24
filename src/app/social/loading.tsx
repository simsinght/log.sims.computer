export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-3xl px-4 pb-12 pt-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Social</h1>
        </div>

        <div className="mb-8 flex gap-2" aria-hidden="true">
          <div className="h-8 w-14 animate-pulse rounded-full bg-[#141414]" />
          <div className="h-8 w-16 animate-pulse rounded-full bg-[#141414]" />
        </div>

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
      </div>
    </div>
  );
}
