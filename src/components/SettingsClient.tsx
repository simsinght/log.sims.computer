"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Summary {
  eventsFound: number;
  alreadyPresent: number;
  toImport: number;
  works: number;
  watchlistToImport: number;
}

interface Progress {
  subPhase: "listItems" | "watches" | "watchlist" | "done";
  listItemsDone: number;
  listItemsTotal: number;
  watchesWritten: number;
  watchesTotal: number;
  watchlistWritten: number;
  watchlistTotal: number;
  rateLimitedUntil: number | null;
}

interface Result {
  watchesWritten: number;
  watchlistWritten: number;
  watchesSkipped: number;
  failures: number;
}

interface Status {
  phase: "idle" | "parsing" | "importing" | "done" | "error";
  summary: Summary | null;
  progress: Progress | null;
  result: Result | null;
  error: string | null;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function phaseLabel(p: Progress): string {
  if (p.rateLimitedUntil && p.rateLimitedUntil > Date.now()) {
    const t = new Date(p.rateLimitedUntil).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Waiting out rate limit until ${t}`;
  }
  if (p.subPhase === "listItems")
    return `Preparing shows… ${fmt(p.listItemsDone)}/${fmt(p.listItemsTotal)}`;
  if (p.subPhase === "watches")
    return `Importing… ${fmt(p.watchesWritten)}/${fmt(p.watchesTotal)}`;
  if (p.subPhase === "watchlist")
    return `Adding watchlist… ${fmt(p.watchlistWritten)}/${fmt(p.watchlistTotal)}`;
  return "Finishing up…";
}

function progressFraction(p: Progress): number {
  const ratio = (done: number, total: number) =>
    total > 0 ? done / total : 0;
  if (p.subPhase === "listItems") return ratio(p.listItemsDone, p.listItemsTotal);
  if (p.subPhase === "watches") return ratio(p.watchesWritten, p.watchesTotal);
  if (p.subPhase === "watchlist")
    return ratio(p.watchlistWritten, p.watchlistTotal);
  return 1;
}

function AccountSection({ handle, did }: { handle: string; did: string }) {
  const [signingOut, setSigningOut] = useState(false);
  async function onSignOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }
  return (
    <section className="rounded-lg border border-gray-800 bg-[#141414] p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        Account
      </h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-gray-500">Handle</dt>
          <dd className="font-medium">{handle}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-gray-500">DID</dt>
          <dd className="min-w-0 truncate font-mono text-xs text-gray-300">
            {did}
          </dd>
        </div>
      </dl>
      <button
        onClick={onSignOut}
        disabled={signingOut}
        className="mt-5 rounded-full border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:opacity-50"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </section>
  );
}

function ImportSection({ sampleEnabled }: { sampleEnabled: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/import/status");
      if (!res.ok) return;
      const data = (await res.json()) as Status;
      setStatus(data);
      if (data.phase === "done" || data.phase === "error" || data.phase === "idle")
        stopPolling();
    } catch {
      /* transient; keep polling */
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    void poll();
    pollRef.current = setInterval(poll, 1000);
  }, [poll, stopPolling]);

  // Resume view if an import is already running when the page loads.
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/import/status");
      if (!res.ok) return;
      const data = (await res.json()) as Status;
      if (data.phase === "parsing" || data.phase === "importing") {
        setStatus(data);
        startPolling();
      } else if (data.phase !== "idle") {
        setStatus(data);
      }
    })();
    return stopPolling;
  }, [startPolling, stopPolling]);

  async function submit(init: RequestInit) {
    setError(null);
    setUploading(true);
    try {
      const res = await fetch("/api/import", { method: "POST", ...init });
      const data = (await res.json()) as {
        error?: string;
        started?: boolean;
      };
      if (res.status === 409) {
        setError(data.error ?? "An import is already running for this account.");
        startPolling();
        return;
      }
      if (!res.ok || !data.started) {
        setError(data.error ?? "Import failed to start.");
        return;
      }
      startPolling();
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  function onImport() {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    void submit({ body });
  }

  function onLoadSample() {
    void submit({
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sample: true }),
    });
  }

  const running = status?.phase === "importing" || status?.phase === "parsing";
  const done = status?.phase === "done";

  return (
    <section className="rounded-lg border border-gray-800 bg-[#141414] p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        Import from Trakt
      </h2>
      <p className="mt-3 text-sm text-gray-400">
        Upload your Trakt data export (the <code>.zip</code> you download from
        Trakt&nbsp;→ Settings&nbsp;→ Data). Your watch history and watchlist are
        written to your own PDS.
      </p>
      <p className="mt-2 text-sm text-gray-500">
        Large libraries take a while — the import keeps running in the background
        and is safe to re-upload. Already-imported history is skipped, so nothing
        is duplicated.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-full border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white">
          <input
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
          />
          {file ? "Choose a different file" : "Choose export .zip"}
        </label>
        {file && (
          <span className="min-w-0 truncate text-sm text-gray-400">
            {file.name}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onImport}
          disabled={!file || uploading || running}
          className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading
            ? "Reading export…"
            : running
              ? "Importing…"
              : "Import history"}
        </button>
        {sampleEnabled && (
          <button
            onClick={onLoadSample}
            disabled={uploading || running}
            className="rounded-full border border-gray-700 px-5 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Load sample export
          </button>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {status?.summary && (
        <div className="mt-5 rounded-md border border-gray-800 bg-[#0f0f0f] p-4 text-sm">
          <p className="text-gray-300">
            Found <strong>{fmt(status.summary.eventsFound)}</strong> watch events
            across <strong>{fmt(status.summary.works)}</strong> shows ·{" "}
            <strong>{fmt(status.summary.alreadyPresent)}</strong> already imported
            · <strong>{fmt(status.summary.toImport)}</strong> to import
            {status.summary.watchlistToImport > 0 && (
              <>
                {" "}
                · <strong>{fmt(status.summary.watchlistToImport)}</strong>{" "}
                watchlist
              </>
            )}
            .
          </p>

          {running && status.progress && (
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-white transition-all"
                  style={{
                    width: `${Math.round(progressFraction(status.progress) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-gray-400">{phaseLabel(status.progress)}</p>
            </div>
          )}

          {done && status.result && (
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                <div className="h-full w-full rounded-full bg-emerald-500" />
              </div>
              <p className="mt-2 font-medium text-emerald-400">
                Import complete — {fmt(status.result.watchesWritten)} watches
                {status.result.watchlistWritten > 0 &&
                  ` and ${fmt(status.result.watchlistWritten)} watchlist items`}{" "}
                added.
              </p>
              <p className="mt-1 text-gray-500">
                Safe to re-upload the same export any time — already-imported
                history is skipped.
              </p>
              <Link
                href="/"
                className="mt-3 inline-block text-sm text-gray-300 underline-offset-2 hover:underline"
              >
                Back to home
              </Link>
            </div>
          )}

          {status.phase === "error" && (
            <p className="mt-3 text-sm text-red-300">
              Import stopped: {status.error ?? "unknown error"}. Re-upload the
              same export to resume — nothing already written is duplicated.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default function SettingsClient({
  handle,
  did,
  sampleImportEnabled,
}: {
  handle: string;
  did: string;
  sampleImportEnabled: boolean;
}) {
  return (
    <div className="mt-8 space-y-6">
      <AccountSection handle={handle} did={did} />
      <ImportSection sampleEnabled={sampleImportEnabled} />
    </div>
  );
}
