"use client";

import { useEffect, useRef, useState } from "react";

// A single transient message at the top of the screen (e.g. "Logged Adults."
// after the log sheet closes). Fired from anywhere with showToast(); the one
// <Toaster /> in the root layout renders it and removes it after a few seconds.

export type ToastTone = "success" | "warning";

interface ToastDetail {
  message: string;
  tone: ToastTone;
}

const EVENT = "tvlog:toast";

export function showToast(message: string, tone: ToastTone = "success"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastDetail>(EVENT, { detail: { message, tone } }),
  );
}

const DURATION_MS: Record<ToastTone, number> = { success: 2500, warning: 6000 };

export default function Toaster() {
  const [toast, setToast] = useState<(ToastDetail & { id: number }) | null>(
    null,
  );
  const [visible, setVisible] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      if (!detail?.message) return;
      clear();
      setToast({ ...detail, id: Date.now() });
      setVisible(false);
      // Next frame so the enter transition runs.
      timers.current.push(window.setTimeout(() => setVisible(true), 20));
      const ms = DURATION_MS[detail.tone];
      timers.current.push(window.setTimeout(() => setVisible(false), ms));
      timers.current.push(window.setTimeout(() => setToast(null), ms + 300));
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      clear();
    };
  }, []);

  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 z-[120] flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
    >
      {toast && (
        <button
          type="button"
          key={toast.id}
          onClick={() => setToast(null)}
          className={`pointer-events-auto max-w-md rounded-full border px-4 py-2.5 text-left text-sm font-medium shadow-lg shadow-black/40 backdrop-blur-md transition-all duration-300 motion-reduce:transition-none ${
            toast.tone === "warning"
              ? "rounded-2xl border-amber-800/70 bg-amber-950/90 text-amber-200"
              : "border-green-800/70 bg-green-950/90 text-green-300"
          } ${visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"}`}
        >
          {toast.message}
        </button>
      )}
    </div>
  );
}
