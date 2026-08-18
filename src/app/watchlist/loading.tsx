export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-6xl px-4 pb-12 pt-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Watchlist</h1>
          <p className="mt-1 text-gray-400">Shows to watch next.</p>
        </div>

        <div className="grid animate-pulse grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] w-full rounded-md bg-[#141414]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
