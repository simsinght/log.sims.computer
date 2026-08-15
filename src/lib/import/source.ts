/**
 * Reading a Trakt export. The input is either a zip (streamed out entry by entry
 * with `unzip -p`, so the private export never lands on disk) or an
 * already-extracted directory. Dependency-free on purpose: `unzip` is available
 * both locally and in the verify preview sandbox.
 *
 * Erasable-syntax-only TypeScript: this module is imported by the CLI
 * (`node scripts/import-trakt.ts`, native type-stripping) as well as the web API
 * route, so it must not use enums, parameter properties, or non-`.ts` relative
 * imports.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

export interface Source {
  listEntries(): string[];
  read(name: string): string;
}

export function makeSource(input: string): Source {
  const abs = resolve(process.cwd(), input);
  if (!existsSync(abs)) throw new Error(`Input not found: ${abs}`);
  const st = statSync(abs);
  if (st.isDirectory()) {
    return {
      listEntries: () =>
        execFileSync("ls", [abs], { encoding: "utf8" })
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      read: (name) => readFileSync(join(abs, name), "utf8"),
    };
  }
  // Treat as a zip; stream file contents out with `unzip -p` so we never write
  // the (private) export to disk.
  return {
    listEntries: () =>
      execFileSync("unzip", ["-Z1", abs], { encoding: "utf8" })
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    read: (name) =>
      execFileSync("unzip", ["-p", abs, name], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      }),
  };
}

export function readJson<T>(source: Source, name: string): T {
  return JSON.parse(source.read(name)) as T;
}
