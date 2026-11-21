import { NextRequest, NextResponse } from "next/server";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import { resolveRouting } from "@/lib/atproto/routing";
import { WATCH_COLLECTION } from "@/lib/atproto/records";
import { getRecord, putRecord } from "@/lib/atproto/write";
import { recordWatchWrite } from "@/lib/watchIndex";

export const runtime = "nodejs";

// The lexicon's limit on computer.sims.log.watch#note.
const MAX_NOTE_GRAPHEMES = 300;

// A record key as atproto allows it (diary records use TIDs).
const RKEY_RE = /^[A-Za-z0-9._:~-]{1,512}$/;

function graphemeCount(s: string): number {
  return Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s),
  ).length;
}

/**
 * Edit (or clear, or add) the note on one of the caller's own diary records:
 * a read-modify-write of the same record, same rkey, in the same place the
 * diary lives (resolveRouting — the diary space for spaces accounts, which
 * fails closed rather than touching the public repo). Every other field of the
 * record is kept as it is.
 *
 * Body: { rkey: string, note: string } — an empty/blank note removes it.
 */
export async function PUT(request: NextRequest) {
  const agent = await getAuthedAgent();
  if (!agent || !agent.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const did = agent.did;

  let body: { rkey?: unknown; note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rkey = typeof body.rkey === "string" ? body.rkey : "";
  if (!RKEY_RE.test(rkey) || rkey === "." || rkey === "..") {
    return NextResponse.json({ error: "Invalid rkey" }, { status: 400 });
  }
  if (typeof body.note !== "string") {
    return NextResponse.json({ error: "Invalid note" }, { status: 400 });
  }
  const note = body.note.trim();
  if (graphemeCount(note) > MAX_NOTE_GRAPHEMES) {
    return NextResponse.json(
      { error: `Notes can be up to ${MAX_NOTE_GRAPHEMES} characters.` },
      { status: 400 },
    );
  }

  try {
    const routing = await resolveRouting(agent, await getSession());
    const existing = await getRecord(agent, routing.diary, {
      repo: did,
      collection: WATCH_COLLECTION,
      rkey,
    });
    if (!existing) {
      return NextResponse.json({ error: "Watch not found" }, { status: 404 });
    }

    const record: Record<string, unknown> = { ...existing.value };
    if (note) record.note = note;
    else delete record.note;

    await putRecord(agent, routing.diary, {
      repo: did,
      collection: WATCH_COLLECTION,
      rkey,
      record,
      validate: false,
    });
    recordWatchWrite(did, routing.diary, rkey, record);

    return NextResponse.json({ note: note || null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDS write failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
