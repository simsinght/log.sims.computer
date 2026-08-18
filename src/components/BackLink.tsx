"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

export function useHistoryBack() {
  const router = useRouter();
  return useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }, [router]);
}

export default function BackLink() {
  const onBack = useHistoryBack();

  return (
    <button
      onClick={onBack}
      className="text-sm text-gray-400 transition-colors hover:text-gray-200"
    >
      &larr; Back
    </button>
  );
}
