/**
 * Small file-backed key/value stores for server-side sign-in state that has to
 * outlive the process: the OAuth session store (refresh tokens + DPoP keys),
 * the OAuth client's signing key, and the latest app-password tokens.
 *
 * Enabled by TVLOG_DATA_DIR. Unset (dev, previews) everything stays in memory
 * exactly as before, so a restart signs everyone out. Set, each store is one
 * JSON file in that directory, rewritten whole on every change via a temp file
 * + fsync + rename (atomic on POSIX), mode 0600 in a 0700 directory.
 *
 * The files hold credentials. Nothing here ever logs keys or values — only
 * file names and error codes. The directory must be a private, mounted volume.
 *
 * Node-only (fs). Single-process by design, like the rest of the app: the file
 * is read once and the in-process copy is the source of truth.
 */
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR_ENV = "TVLOG_DATA_DIR";

let dirState: { dir: string | null; checked: boolean } = {
  dir: null,
  checked: false,
};

function errCode(err: unknown): string {
  const e = err as { code?: string; name?: string };
  return e?.code ?? e?.name ?? "unknown";
}

/**
 * The usable data directory, or null for in-memory mode. Created 0700 if
 * missing. If it is set but unusable the server logs loudly and runs in memory
 * (sign-in keeps working; it just won't survive a restart).
 */
export function dataDir(): string | null {
  if (dirState.checked) return dirState.dir;
  dirState = { dir: null, checked: true };
  const raw = process.env[DATA_DIR_ENV]?.trim();
  if (!raw) return null;
  const dir = path.resolve(raw);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const st = fs.statSync(dir);
    if ((st.mode & 0o077) !== 0) {
      try {
        fs.chmodSync(dir, 0o700);
      } catch (err) {
        console.warn(
          `[durableStore] ${DATA_DIR_ENV} is readable by other users and could not be chmod 700`,
          { code: errCode(err) },
        );
      }
    }
    fs.accessSync(dir, fs.constants.W_OK | fs.constants.R_OK);
    dirState.dir = dir;
  } catch (err) {
    console.error(
      `[durableStore] ${DATA_DIR_ENV} is set but not writable; sign-ins will NOT survive a restart`,
      { code: errCode(err) },
    );
  }
  return dirState.dir;
}

/** "durable" when sign-in state is written to disk, else "memory". */
export function storageMode(): "durable" | "memory" {
  return dataDir() ? "durable" : "memory";
}

/** Atomically replace `file` with `contents` (temp file, fsync, rename; 0600). */
export function writeFileAtomic(file: string, contents: string): void {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(tmp, "w", 0o600);
  try {
    fs.writeSync(fd, contents);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // nothing to clean up
    }
    throw err;
  }
}

/** Read a JSON file from the data dir; undefined when absent or unreadable. */
export function readJsonFile<T>(file: string): T | undefined {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (errCode(err) !== "ENOENT") {
      console.error("[durableStore] could not read store file", {
        file: path.basename(file),
        code: errCode(err),
      });
    }
    return undefined;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    // Keep the damaged file for inspection rather than overwriting it.
    const aside = `${file}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(file, aside);
    } catch {
      // leave it; the next write replaces it
    }
    console.error("[durableStore] store file was not valid JSON; starting empty", {
      file: path.basename(file),
    });
    return undefined;
  }
}

/**
 * The subset of Map the stores use. Backed by memory, or by memory plus a
 * JSON file that is rewritten on every set/delete.
 */
export interface KeyValueMap<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): unknown;
  delete(key: string): unknown;
}

class JsonFileMap<V> implements KeyValueMap<V> {
  private readonly map = new Map<string, V>();

  constructor(private readonly file: string) {
    const data = readJsonFile<Record<string, V>>(file);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const [k, v] of Object.entries(data)) this.map.set(k, v);
    }
  }

  get(key: string): V | undefined {
    return this.map.get(key);
  }

  set(key: string, value: V): this {
    this.map.set(key, value);
    this.flush();
    return this;
  }

  delete(key: string): boolean {
    const had = this.map.delete(key);
    if (had) this.flush();
    return had;
  }

  private flush(): void {
    try {
      writeFileAtomic(
        this.file,
        JSON.stringify(Object.fromEntries(this.map)),
      );
    } catch (err) {
      // The in-memory copy stays correct for this process.
      console.error("[durableStore] could not write store file", {
        file: path.basename(this.file),
        code: errCode(err),
      });
    }
  }
}

/**
 * A key/value map named `name`: file-backed (`<dataDir>/<name>.json`) when
 * TVLOG_DATA_DIR is usable, otherwise a plain in-memory Map.
 */
export function openKeyValueMap<V>(name: string): KeyValueMap<V> {
  const dir = dataDir();
  if (!dir) return new Map<string, V>();
  return new JsonFileMap<V>(path.join(dir, `${name}.json`));
}
