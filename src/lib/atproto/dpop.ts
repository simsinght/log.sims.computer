/**
 * ES256 DPoP proof generation for atproto space credentials, ported verbatim
 * (in behaviour) from scripts/space-probe.mjs. Deliberately dependency-free —
 * only Node's webcrypto — so the offline check (scripts/space-io-check.mjs) can
 * import and exercise the *exact* proof code the SpaceCredentialManager ships,
 * rather than a re-implementation that could drift from it.
 *
 * Relative imports + no `@/` path alias (there are none here) keep this file
 * resolvable under Node's native type-stripping, the same rule ./write.ts notes.
 */
import { randomBytes } from "node:crypto";

export interface DpopKeypair {
  privateKey: CryptoKey;
  // The bare public JWK embedded in every proof header's `jwk` claim.
  publicJwk: { crv: string; kty: string; x: string; y: string };
}

const b64uBytes = (buf: ArrayBuffer): string =>
  Buffer.from(new Uint8Array(buf)).toString("base64url");
const b64uStr = (s: string): string =>
  Buffer.from(s, "utf8").toString("base64url");

export async function generateDpopKeypair(): Promise<DpopKeypair> {
  // Non-extractable private key: it signs proofs in-process and can never be
  // serialized out (not into the session cookie, not into logs). The public
  // key stays exportable regardless, which is all we need for the `jwk` claim.
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  return {
    privateKey: kp.privateKey,
    publicJwk: {
      crv: jwk.crv as string,
      kty: jwk.kty as string,
      x: jwk.x as string,
      y: jwk.y as string,
    },
  };
}

async function signJwt(
  header: object,
  payload: object,
  priv: CryptoKey,
): Promise<string> {
  const signingInput = `${b64uStr(JSON.stringify(header))}.${b64uStr(
    JSON.stringify(payload),
  )}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    priv,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64uBytes(sig)}`;
}

// The `ath` claim: base64url(SHA-256(credential)). Present on credentialed reads
// (binding the proof to the credential in the Authorization header) and ABSENT
// on the credential-exchange proof — the wrinkle the whole flow turns on.
export async function credentialAth(credential: string): Promise<string> {
  const dig = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(credential),
  );
  return Buffer.from(dig).toString("base64url");
}

export async function dpopProof(
  key: DpopKeypair,
  htm: string,
  htu: string,
  credential?: string,
): Promise<string> {
  const u = new URL(htu);
  const payload: Record<string, unknown> = {
    // Single-use, fresh per request — never reuse a proof.
    jti: randomBytes(16).toString("hex"),
    htm,
    htu: u.origin + u.pathname,
    iat: Math.floor(Date.now() / 1000),
  };
  if (credential) payload.ath = await credentialAth(credential);
  return signJwt(
    { alg: "ES256", typ: "dpop+jwt", jwk: key.publicJwk },
    payload,
    key.privateKey,
  );
}

// Reads a JWT's `exp` (seconds since epoch) WITHOUT verifying the signature —
// used only to schedule our own cache eviction, never for a trust decision.
export function jwtExpSeconds(jwt: string): number | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}
