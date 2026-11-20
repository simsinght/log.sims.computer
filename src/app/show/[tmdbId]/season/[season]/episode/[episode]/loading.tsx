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

          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded bg-[#141414]" />
            <div className="h-3 w-11/12 rounded bg-[#141414]" />
            <div className="h-3 w-2/3 rounded bg-[#141414]" />
          </div>

          <div className="mt-8 h-[54px] rounded-lg bg-[#141414]" />
          <div className="-mx-4 mt-3 flex gap-3 overflow-hidden pl-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-24 shrink-0">
                <div className="aspect-[2/3] w-full rounded-md bg-[#1c1c1c]" />
                <div className="mt-2 h-3.5 w-3/4 rounded bg-[#1c1c1c]" />
                <div className="mt-1.5 h-3 w-1/2 rounded bg-[#141414]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
