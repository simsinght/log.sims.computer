"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "tvlog.installPromptDismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Mode = "none" | "install" | "ios";

function isStandalone(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isIos(): boolean {
  const nav = window.navigator;
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true;
  // iPadOS 13+ reports a desktop Safari UA on MacIntel; touch points tell an
  // iPad apart from a real Mac.
  return nav.platform === "MacIntel" && nav.maxTouchPoints > 1;
}

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Storage can be unavailable (private mode); the banner still hides for
    // this page view.
  }
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block h-3.5 w-3.5 align-[-2px]"
      aria-hidden="true"
    >
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

export default function InstallPrompt({ hasFab }: { hasFab: boolean }) {
  const [mode, setMode] = useState<Mode>("none");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;

    if (isIos()) {
      setMode("ios");
      return;
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("install");
    }
    function onInstalled() {
      setMode("none");
      setDeferred(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode === "none") return null;

  async function onInstall() {
    if (!deferred) return;
    setDeferred(null);
    setMode("none");
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      // A prompt that can no longer be shown is not worth surfacing.
    }
  }

  function onDismiss() {
    rememberDismissal();
    setDeferred(null);
    setMode("none");
  }

  return (
    <div
      role="region"
      aria-label="Install tvlog"
      className="fixed left-4 right-4 z-[90] rounded-xl border border-gray-800 bg-[#141414] p-3 shadow-xl"
      style={{
        bottom: hasFab
          ? "calc(6.5rem + env(safe-area-inset-bottom))"
          : "calc(1.5rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[#ededed]">Install tvlog</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Add it to your home screen for one-tap logging.
          </p>
          {mode === "ios" && (
            <p className="mt-1.5 text-xs text-gray-300">
              Tap <ShareIcon /> Share, then &quot;Add to Home Screen&quot;
            </p>
          )}
        </div>
        {mode === "install" && (
          <button
            type="button"
            onClick={onInstall}
            className="shrink-0 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-gray-200"
          >
            Install
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Not now"
          className="shrink-0 text-xl leading-none text-gray-500 transition-colors hover:text-gray-300"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
