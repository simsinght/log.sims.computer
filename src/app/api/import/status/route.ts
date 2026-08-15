import { NextResponse } from "next/server";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { getJob } from "@/lib/import/job";

export const runtime = "nodejs";

export async function GET() {
  const agent = await getAuthedAgent();
  if (!agent || !agent.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const job = getJob(agent.did);
  if (!job) {
    return NextResponse.json({ phase: "idle" });
  }

  return NextResponse.json({
    phase: job.phase,
    summary: job.summary
      ? {
          eventsFound: job.summary.events,
          alreadyPresent: job.summary.watchesSkipped,
          toImport: job.summary.watchesToWrite,
          works: job.summary.works,
          watchlistToImport: job.summary.watchlistToCreate,
        }
      : null,
    progress: job.progress
      ? {
          subPhase: job.progress.phase,
          listItemsDone: job.progress.listItemsDone,
          listItemsTotal: job.progress.listItemsTotal,
          watchesWritten: job.progress.watchesWritten,
          watchesTotal: job.progress.watchesTotal,
          watchlistWritten: job.progress.watchlistWritten,
          watchlistTotal: job.progress.watchlistTotal,
          rateLimitedUntil: job.progress.rateLimitedUntil,
        }
      : null,
    result: job.result
      ? {
          watchesWritten: job.result.watchesWritten,
          watchlistWritten: job.result.watchlistWritten,
          watchesSkipped: job.result.watchesSkipped,
          failures: job.result.failures,
        }
      : null,
    error: job.error,
  });
}
