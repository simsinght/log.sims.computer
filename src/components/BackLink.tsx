"use client";

import { useRouter } from "next/navigation";

export default function BackLink() {
  const router = useRouter();

  function onBack() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <button
      onClick={onBack}
      className="text-sm text-gray-400 transition-colors hover:text-gray-200"
    >
      &larr; Back
    </button>
  );
}
