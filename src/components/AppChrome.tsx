"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import InstallPrompt from "@/components/InstallPrompt";

function SearchFab() {
  const router = useRouter();

  function onSearch() {
    // iOS Safari only opens the keyboard for a focus() that happens inside a
    // user gesture, so focus a throwaway field here and let the header input
    // take over on arrival — focus moving input-to-input keeps the keyboard up.
    const probe = document.createElement("input");
    probe.type = "text";
    probe.setAttribute("aria-hidden", "true");
    probe.tabIndex = -1;
    probe.style.cssText =
      "position:fixed;top:0;left:0;height:1px;width:1px;padding:0;border:0;opacity:0;font-size:16px;";
    document.body.appendChild(probe);
    probe.focus();
    router.push("/search");
    setTimeout(() => probe.remove(), 1500);
  }

  return (
    <button
      type="button"
      onClick={onSearch}
      aria-label="Search"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 active:scale-95"
      style={{
        bottom: "calc(1.5rem + env(safe-area-inset-bottom))",
        right: "calc(1.5rem + env(safe-area-inset-right))",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </button>
  );
}

export default function AppChrome({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639.98px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const hasFab =
    signedIn && isPhone && pathname !== "/search" && pathname !== "/settings";

  return (
    <>
      {signedIn && <AppHeader />}
      {hasFab && <SearchFab />}
      <InstallPrompt hasFab={hasFab} />
    </>
  );
}
