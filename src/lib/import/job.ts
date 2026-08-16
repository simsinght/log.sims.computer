/**
 * In-memory import-job registry for the web flow. One job per session (keyed by
 * DID) enforces single-flight; the status endpoint reads the live job. State is
 * intentionally not persisted — resumability comes from the importer's
 * idempotency (re-uploading the same zip skips everything already written), so a
 * server restart simply drops the in-flight job and the user re-uploads. Kept on
 * globalThis so Next's dev HMR doesn't spawn a second registry. Consistent with
 * the OAuth/TMDB caches' single-process assumption.
 *
 * Web-only (never strip-typed by the CLI), so ordinary TS is fine here.
 */
import type { Agent } from "@atproto/api";
import type { ImportCounts, ImportPlan, ImportProgress, ImportResult } from "./importer.ts";
import { executeImport } from "./importer.ts";

export type JobPhase = "parsing" | "importing" | "done" | "error";

export interface ImportJobState {
  did: string;
  phase: JobPhase;
  summary: ImportCounts | null;
  progress: ImportProgress | null;
  result: ImportResult | null;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

const store = globalThis as unknown as {
  __importJobs?: Map<string, ImportJobState>;
};
const jobs = store.__importJobs ?? (store.__importJobs = new Map());

export function getJob(did: string): ImportJobState | undefined {
  return jobs.get(did);
}

export function isActive(did: string): boolean {
  const j = jobs.get(did);
  return !!j && (j.phase === "parsing" || j.phase === "importing");
}

// Registers a fresh job in the "parsing" phase. The caller must guard with
// isActive() first; there is no await between that check and this call, so no
// second import can slip in for the same DID.
export function beginJob(did: string): ImportJobState {
  const job: ImportJobState = {
    did,
    phase: "parsing",
    summary: null,
    progress: null,
    result: null,
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(did, job);
  return job;
}

// Drops a job entirely — used when an upload fails validation before the import
// starts, so a bad file doesn't leave a stale "error" job the status endpoint
// would keep reporting.
export function removeJob(did: string): void {
  jobs.delete(did);
}

export function failJob(job: ImportJobState, message: string): void {
  job.phase = "error";
  job.error = message;
  job.finishedAt = Date.now();
}

// Moves the job into the background write phase and runs executeImport without
// awaiting it — the request returns immediately with the summary while the
// import continues in-process. Progress is folded into the job for the status
// endpoint to read.
export function runJobInBackground(
  job: ImportJobState,
  agent: Agent,
  did: string,
  plan: ImportPlan,
): void {
  job.summary = plan.counts;
  job.phase = "importing";
  job.progress = {
    phase: "listItems",
    listItemsDone: 0,
    listItemsTotal: plan.parsed.works.length,
    watchesWritten: 0,
    watchesTotal: plan.counts.watchesToWrite,
    watchlistWritten: 0,
    watchlistTotal: plan.counts.watchlistToCreate,
    rateLimitedUntil: null,
  };

  void executeImport(agent, did, plan, {
    onProgress: (p: ImportProgress) => {
      job.progress = p;
    },
  })
    .then((result: ImportResult) => {
      job.result = result;
      job.phase = "done";
      job.finishedAt = Date.now();
    })
    .catch((err: unknown) => {
      failJob(job, err instanceof Error ? err.message : "Import failed");
    });
}

export type { ImportCounts };
