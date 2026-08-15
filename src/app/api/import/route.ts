import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { makeSource } from "@/lib/import/source";
import { parseExport } from "@/lib/import/parse";
import { computePlan } from "@/lib/import/importer";
import {
  beginJob,
  isActive,
  removeJob,
  runJobInBackground,
} from "@/lib/import/job";

export const runtime = "nodejs";
// The read-side plan (listing existing records for idempotency) can run a while
// on a large account; the import itself continues in the background after we
// respond, so this only bounds the parse + plan.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const agent = await getAuthedAgent();
  if (!agent || !agent.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const did = agent.did;

  // Single-flight: one import per session. No await between this check and
  // beginJob, so a concurrent upload can't slip through.
  if (isActive(did)) {
    return NextResponse.json(
      { error: "An import is already running for this account." },
      { status: 409 },
    );
  }
  const job = beginJob(did);

  let tmpPath: string | null = null;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      removeJob(did);
      return NextResponse.json(
        { error: "No export file uploaded." },
        { status: 400 },
      );
    }

    // Persist the upload to a temp file so the shared reader can stream entries
    // out with `unzip -p`; deleted as soon as parsing finishes so the private
    // export never lingers on disk.
    const bytes = Buffer.from(await file.arrayBuffer());
    tmpPath = join(tmpdir(), `trakt-import-${randomUUID()}.zip`);
    await writeFile(tmpPath, bytes);

    const source = makeSource(tmpPath);
    const entries = source.listEntries();
    const parsed = parseExport(source, entries);

    const plan = await computePlan(agent, did, parsed);

    // Background write phase; the request returns immediately with the summary.
    runJobInBackground(job, agent, did, plan);

    return NextResponse.json({
      started: true,
      summary: {
        eventsFound: plan.counts.events,
        alreadyPresent: plan.counts.watchesSkipped,
        toImport: plan.counts.watchesToWrite,
        works: plan.counts.works,
        listItemsToCreate: plan.counts.listItemsToCreate,
        listItemsToUpdate: plan.counts.listItemsToUpdate,
        watchlistParsed: plan.counts.watchlistParsed,
        watchlistToImport: plan.counts.watchlistToCreate,
      },
    });
  } catch (err) {
    removeJob(did);
    const message =
      err instanceof Error ? err.message : "Could not read the export file.";
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    if (tmpPath) await unlink(tmpPath).catch(() => {});
  }
}
