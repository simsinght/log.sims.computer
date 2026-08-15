/**
 * Trakt history importer (CLI).
 *
 * Reads an official Trakt export (zip or already-extracted directory) and writes
 * the watch history into the owner's PDS as Popfeed + computer.sims.log records:
 *   - one social.popfeed.feed.listItem per tracked work (movie or show), carrying
 *     all watched episodes and the TMDB-derived display fields,
 *   - one computer.sims.log.watch diary entry per play event, and
 *   - one social.popfeed.feed.listItem per watchlist entry.
 *
 * Run: node scripts/import-trakt.ts <zip-or-dir> --handle <h> --password <p> [flags]
 * (Node 25's native TS type-stripping runs this directly.)
 *
 * The reusable core — zip parsing, event extraction, idempotency filtering, and
 * the batched/rate-limited write phases — lives in src/lib/import/ and is shared
 * with the web upload flow (src/app/api/import/*). It is imported here by
 * relative path with .ts extensions so native strip-types resolves it; every
 * shared module is erasable-syntax-only for the same reason. This file keeps
 * only CLI concerns: argument parsing, env loading, identity/login, the
 * confirmation prompt, and the human-readable plan/summary output.
 *
 * Auth: --handle/--password, falling back to ATP_TEST_HANDLE / ATP_TEST_APP_PASSWORD
 * (loaded from .env.local if present).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { AtpAgent } from "@atproto/api";
import { makeSource } from "../src/lib/import/source.ts";
import {
  parseExport,
  reportSideChannels,
  crossCheck,
} from "../src/lib/import/parse.ts";
import {
  computePlan,
  executeImport,
  type ImportCounts,
} from "../src/lib/import/importer.ts";

// ---------------------------------------------------------------------------
// CLI + env
// ---------------------------------------------------------------------------

interface Args {
  input: string;
  handle?: string;
  password?: string;
  limit?: number;
  since?: string;
  dryRun: boolean;
  yes: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { input: "", dryRun: false, yes: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--yes" || a === "-y") args.yes = true;
    else if (a === "--handle") args.handle = argv[++i];
    else if (a === "--password") args.password = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--since") args.since = argv[++i];
    else if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    else positional.push(a);
  }
  args.input = positional[0] ?? "";
  return args;
}

function loadEnv(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ---------------------------------------------------------------------------
// identity + confirm (CLI-only)
// ---------------------------------------------------------------------------

async function resolveIdentity(
  handle: string,
): Promise<{ did: string; pdsUrl: string }> {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  const rh = new URL(
    "/xrpc/com.atproto.identity.resolveHandle",
    "https://bsky.social",
  );
  rh.searchParams.set("handle", h);
  const did = ((await (await fetch(rh)).json()) as { did?: string }).did;
  if (!did) throw new Error(`Could not resolve handle ${handle}`);
  const doc = (await (await fetch(`https://plc.directory/${did}`)).json()) as {
    service?: { id: string; serviceEndpoint: string }[];
  };
  const svc = doc.service?.find((s) => s.id.endsWith("#atproto_pds"));
  if (!svc?.serviceEndpoint) throw new Error("No PDS endpoint in DID doc");
  return { did, pdsUrl: svc.serviceEndpoint };
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((res) => rl.question(prompt, res));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

function printPlan(counts: ImportCounts): void {
  console.log("\n=== Import plan ===");
  console.log(`  play events (after filters):   ${counts.events}`);
  console.log(
    `  distinct works:                ${counts.works} (${counts.movies} movies, ${counts.shows} shows)`,
  );
  console.log(`  listItems to create:           ${counts.listItemsToCreate}`);
  console.log(`  listItems to update:           ${counts.listItemsToUpdate}`);
  console.log(`  watch records to write:        ${counts.watchesToWrite}`);
  console.log(`  watch records already present: ${counts.watchesSkipped}`);
  console.log(`  watchlist items parsed:        ${counts.watchlistParsed}`);
  console.log(
    `  watchlist items to add:        ${counts.watchlistToCreate} (${counts.watchlistMovies} movies, ${counts.watchlistShows} shows)`,
  );
  console.log(`  watchlist already tracked:     ${counts.watchlistSkipped}`);
  console.log(`  TMDB detail calls:             ${counts.tmdbCallsNeeded}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error(
      "Usage: node scripts/import-trakt.ts <zip-or-dir> --handle <h> --password <p> [--limit N] [--since ISO] [--dry-run] [--yes]",
    );
  }
  const handle = args.handle ?? process.env.ATP_TEST_HANDLE;
  const password = args.password ?? process.env.ATP_TEST_APP_PASSWORD;

  // --- parse events + watchlist ---
  const source = makeSource(args.input);
  const entries = source.listEntries();
  const parsed = parseExport(source, entries, {
    since: args.since,
    limit: args.limit,
    log: (m) => console.log(m),
  });

  // --- report other export sections (out of scope, counts only) ---
  reportSideChannels(source, entries, (m) => console.log(m));

  // --- auth (dry-run still logs in when creds present, for an accurate plan) ---
  let agent: AtpAgent | null = null;
  let did = "";
  if (handle && password) {
    const id = await resolveIdentity(handle);
    did = id.did;
    console.log(`\nAccount: ${handle} (${did}) @ ${id.pdsUrl}`);
    agent = new AtpAgent({ service: id.pdsUrl });
    await agent.login({ identifier: handle, password });
  } else if (!args.dryRun) {
    throw new Error(
      "No credentials: pass --handle/--password or set ATP_TEST_HANDLE/ATP_TEST_APP_PASSWORD",
    );
  } else {
    console.log("\n(no credentials; dry-run plan will assume an empty account)");
  }

  const plan = await computePlan(agent, did, parsed, {
    prefetch: true,
    log: (m) => console.log(m),
  });
  printPlan(plan.counts);
  crossCheck(source, entries, parsed.works, (m) => console.log(m));

  if (args.dryRun) {
    console.log("\nDry run: no records written.");
    return;
  }
  if (!agent) throw new Error("cannot write without credentials");

  if (!args.yes) {
    const ok = await confirm("\nProceed with writing these records? [y/N] ");
    if (!ok) {
      console.log("Aborted.");
      return;
    }
  }

  const result = await executeImport(agent, did, plan, {
    log: (m) => console.log(m),
  });

  const elapsed = (result.elapsedMs / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s.`);
  console.log(`  listItems processed: ${result.listItemsProcessed}`);
  console.log(`  watch records written: ${result.watchesWritten}`);
  console.log(`  watchlist items written: ${result.watchlistWritten}`);
  console.log(
    `  watch records skipped (already present): ${result.watchesSkipped}`,
  );
  if (result.missingSubject > 0)
    console.log(
      `  watch records skipped (listItem failed): ${result.missingSubject}`,
    );
  if (result.failures > 0) {
    console.error(
      `\n${result.failures} write(s) failed. Re-run the same command to resume (idempotent).`,
    );
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
