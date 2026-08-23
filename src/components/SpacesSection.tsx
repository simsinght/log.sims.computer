"use client";

import { useCallback, useEffect, useState } from "react";

interface SpaceMember {
  did: string;
  handle: string | null;
}

interface AppSpace {
  kind: "diary" | "watchlist";
  uri: string;
  ownerDid: string;
  multiWriter: boolean;
  members: SpaceMember[];
}

interface SpacesResponse {
  capable: boolean;
  spaces: AppSpace[];
}

const SPACE_META: Record<
  AppSpace["kind"],
  { title: string; blurb: string; memberNoun: string }
> = {
  diary: {
    title: "Diary",
    blurb:
      "Your personal watch diary — tags, notes and mood. You're the only writer; members you add can read it.",
    memberNoun: "Readers",
  },
  watchlist: {
    title: "Shared watchlist",
    blurb:
      "A multi-writer space — every member can add to the watchlist and everyone sees it.",
    memberNoun: "Members",
  },
};

function memberLabel(m: SpaceMember): string {
  return m.handle ? `@${m.handle}` : m.did;
}

function SpaceCard({
  space,
  onChanged,
}: {
  space: AppSpace;
  onChanged: () => void;
}) {
  const meta = SPACE_META[space.kind];
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Set<string>>(new Set());

  async function post(bodyObj: Record<string, unknown>): Promise<boolean> {
    setError(null);
    const res = await fetch("/api/spaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bodyObj),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Something went wrong. Try again.");
      return false;
    }
    return true;
  }

  async function onAdd() {
    if (!identifier.trim() || busy) return;
    setBusy(true);
    const ok = await post({
      action: "addMember",
      space: space.uri,
      identifier: identifier.trim(),
    });
    setBusy(false);
    if (ok) {
      setIdentifier("");
      onChanged();
    }
  }

  async function onRemove(did: string) {
    setBusy(true);
    const ok = await post({ action: "removeMember", space: space.uri, did });
    setBusy(false);
    if (ok) {
      setPendingRemoval((prev) => new Set(prev).add(did));
      onChanged();
    }
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0f0f0f] p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-base font-semibold">{meta.title}</h3>
        <span className="text-xs uppercase tracking-wide text-gray-600">
          {space.multiWriter ? "Multi-writer" : "Single-writer"}
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-400">{meta.blurb}</p>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {meta.memberNoun}
      </p>
      {space.members.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No members yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {space.members.map((m) => {
            const removing = pendingRemoval.has(m.did);
            return (
              <li
                key={m.did}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate">
                  <span className={m.handle ? "" : "font-mono text-xs text-gray-300"}>
                    {memberLabel(m)}
                  </span>
                  {removing && (
                    <span className="ml-2 text-xs text-amber-400/80">
                      removing…
                    </span>
                  )}
                </span>
                <button
                  onClick={() => onRemove(m.did)}
                  disabled={busy || removing}
                  className="shrink-0 rounded-full border border-gray-700 px-3 py-1 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onAdd();
          }}
          placeholder="handle or did:plc:…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-gray-800 bg-[#141414] px-3 py-2 text-sm placeholder-gray-600 outline-none transition-colors focus:border-gray-600"
        />
        <button
          onClick={() => void onAdd()}
          disabled={busy || !identifier.trim()}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add member
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {pendingRemoval.size > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          Removing a member revokes new reads immediately, but any credential
          they already hold keeps working until it expires — removal takes up to
          ~2 hours to fully apply.
        </p>
      )}
    </div>
  );
}

export default function SpacesSection() {
  const [data, setData] = useState<SpacesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/spaces");
      if (!res.ok) {
        // 401 (signed out) or a probe failure: render nothing rather than an error.
        setData({ capable: false, spaces: [] });
        return;
      }
      setData((await res.json()) as SpacesResponse);
    } catch {
      setData({ capable: false, spaces: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreateWatchlist() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/spaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "createWatchlist" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't create the shared watchlist.");
        return;
      }
      await load();
    } finally {
      setCreating(false);
    }
  }

  // Non-capable accounts (e.g. bsky.social) render no space UI at all.
  if (loading || !data || !data.capable) return null;

  const hasWatchlist = data.spaces.some((s) => s.kind === "watchlist");

  return (
    <section className="rounded-lg border border-gray-800 bg-[#141414] p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        Spaces
      </h2>
      <p className="mt-3 text-sm text-gray-400">
        Permissioned spaces on your PDS. Add friends by handle or DID to share
        access.
      </p>

      <div className="mt-5 space-y-4">
        {data.spaces.map((space) => (
          <SpaceCard key={space.uri} space={space} onChanged={load} />
        ))}
      </div>

      {!hasWatchlist && (
        <div className="mt-4">
          <button
            onClick={() => void onCreateWatchlist()}
            disabled={creating}
            className="rounded-full border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create shared watchlist"}
          </button>
          <p className="mt-2 text-xs text-gray-500">
            A multi-writer space you own — invite members afterwards.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
