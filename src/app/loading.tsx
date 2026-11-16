import { WATCHING_GRID_CLASS } from "@/components/watchingGrid";

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-3xl px-4 pb-12 pt-6">
        <div className={`animate-pulse ${WATCHING_GRID_CLASS}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border border-gray-800 bg-[#141414]"
            >
              <div className="aspect-video w-full bg-[#1c1c1c]" />
              <div className="flex flex-col gap-2 p-3">
                <div className="h-3.5 w-4/5 rounded bg-[#1c1c1c]" />
                <div className="h-3 w-3/5 rounded bg-[#1c1c1c]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
