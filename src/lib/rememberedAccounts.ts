// Accounts remembered on this device for one-tap "Continue as" on /login.
//
// localStorage, not a cookie: the server never needs it, it survives sign-out
// (which only clears the session cookie), and it can hold a small cached
// avatar so the signed-out login page loads no third-party image. Each
// installed PWA / browser profile has its own copy. Non-secret only: handle,
// DID, display name, avatar, and which sign-in path the account used — never a
// token or password. Every access is wrapped: storage can be missing or throw
// (private mode, blocked site data), and the login page works without it.

export const REMEMBERED_ACCOUNTS_KEY = "tvlog.rememberedAccounts";
const MAX_ACCOUNTS = 3;

export type RememberedMethod = "oauth" | "app_password";

export interface RememberedAccount {
  did: string;
  handle: string;
  displayName?: string;
  method: RememberedMethod;
  // Upstream avatar URL, used to tell when the cached copy is stale.
  avatarUrl?: string;
  // Small data: URL copy of the avatar (fetched same-origin while signed in).
  avatarData?: string;
  lastUsedAt: number;
}

function isAccount(value: unknown): value is RememberedAccount {
  const v = value as Partial<RememberedAccount> | null;
  return (
    !!v &&
    typeof v.did === "string" &&
    v.did.startsWith("did:") &&
    typeof v.handle === "string" &&
    (v.method === "oauth" || v.method === "app_password") &&
    typeof v.lastUsedAt === "number"
  );
}

export function readRememberedAccounts(): RememberedAccount[] {
  try {
    const raw = window.localStorage.getItem(REMEMBERED_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isAccount)
      .map((a) => ({
        ...a,
        // Only same-document data: URLs are ever rendered.
        avatarData:
          typeof a.avatarData === "string" &&
          a.avatarData.startsWith("data:image/")
            ? a.avatarData
            : undefined,
      }))
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, MAX_ACCOUNTS);
  } catch {
    return [];
  }
}

function writeAll(accounts: RememberedAccount[]): void {
  try {
    window.localStorage.setItem(
      REMEMBERED_ACCOUNTS_KEY,
      JSON.stringify(accounts.slice(0, MAX_ACCOUNTS)),
    );
  } catch {
    // Storage full or blocked: the login page just won't offer the shortcut.
  }
}

/** Insert or refresh an account, most recent first. */
export function rememberAccount(account: RememberedAccount): void {
  const others = readRememberedAccounts().filter((a) => a.did !== account.did);
  writeAll([account, ...others]);
}

export function forgetAccount(did: string): RememberedAccount[] {
  const rest = readRememberedAccounts().filter((a) => a.did !== did);
  writeAll(rest);
  return rest;
}
