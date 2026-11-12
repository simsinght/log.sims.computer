import SocialFeedSkeleton from "@/components/SocialFeedSkeleton";

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

        <SocialFeedSkeleton />
      </div>
    </div>
  );
}
