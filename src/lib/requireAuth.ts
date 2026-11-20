import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Agent } from "@atproto/api";
import { getAuthedAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import { PATH_HEADER, loginPath, safeNextPath } from "@/lib/authGate";

async function currentPath(): Promise<string> {
  const h = await headers();
  return safeNextPath(h.get(PATH_HEADER)) ?? "/";
}

/**
 * Server-page guard (defence in depth behind middleware). No session → /login.
 * A cookie the server can no longer back (the in-memory OAuth store was wiped
 * by a deploy/restart) → /api/auth/expired, which clears the dead cookie (a
 * server component can't) and continues to /login with the same return path.
 */
export async function requireAgent(): Promise<Agent & { did: string }> {
  const session = await getSession();
  const path = await currentPath();
  if (!session.did) redirect(loginPath(path));
  const agent = await getAuthedAgent().catch(() => null);
  if (!agent?.did) {
    redirect(`/api/auth/expired?next=${encodeURIComponent(path)}`);
  }
  return agent as Agent & { did: string };
}

/** Route-handler guard: a 401 response when there is no session cookie DID. */
export async function apiUnauthorized(): Promise<Response | null> {
  const session = await getSession();
  if (session.did) return null;
  return Response.json({ error: "Not authenticated" }, { status: 401 });
}
