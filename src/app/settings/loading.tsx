export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-2xl px-4 pb-12 pt-8">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <div className="mt-8 animate-pulse space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-800 bg-[#141414] p-5"
            >
              <div className="h-3 w-32 rounded bg-[#1c1c1c]" />
              <div className="mt-5 h-3.5 w-3/4 rounded bg-[#1c1c1c]" />
              <div className="mt-3 h-3.5 w-1/2 rounded bg-[#1c1c1c]" />
              <div className="mt-6 h-9 w-36 rounded-full bg-[#1c1c1c]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
