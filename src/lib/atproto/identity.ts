const DEFAULT_RESOLVER = "https://bsky.social";

export interface ResolvedIdentity {
  did: string;
  handle: string | null;
  pdsUrl: string;
}

interface DidDocument {
  id: string;
  alsoKnownAs?: string[];
  service?: { id: string; type: string; serviceEndpoint: string }[];
}

function normalizeHandle(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

async function resolveHandleToDid(handle: string): Promise<string> {
  const url = new URL(
    "/xrpc/com.atproto.identity.resolveHandle",
    DEFAULT_RESOLVER,
  );
  url.searchParams.set("handle", handle);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not resolve handle "${handle}"`);
  }
  const body = (await res.json()) as { did?: string };
  if (!body.did) throw new Error(`Could not resolve handle "${handle}"`);
  return body.did;
}

async function fetchDidDocument(did: string): Promise<DidDocument> {
  let url: string;
  if (did.startsWith("did:plc:")) {
    url = `https://plc.directory/${did}`;
  } else if (did.startsWith("did:web:")) {
    const domain = decodeURIComponent(did.slice("did:web:".length));
    url = `https://${domain}/.well-known/did.json`;
  } else {
    throw new Error(`Unsupported DID method: ${did}`);
  }
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Could not resolve DID document for ${did}`);
  return (await res.json()) as DidDocument;
}

function pdsFromDoc(doc: DidDocument): string {
  const service = doc.service?.find((s) => s.id.endsWith("#atproto_pds"));
  if (!service?.serviceEndpoint) {
    throw new Error("No PDS endpoint found in DID document");
  }
  return service.serviceEndpoint;
}

function handleFromDoc(doc: DidDocument): string | null {
  const aka = doc.alsoKnownAs?.find((a) => a.startsWith("at://"));
  return aka ? aka.slice("at://".length) : null;
}

export async function resolveIdentity(input: string): Promise<ResolvedIdentity> {
  const trimmed = input.trim();
  const did = trimmed.startsWith("did:")
    ? trimmed
    : await resolveHandleToDid(normalizeHandle(trimmed));
  const doc = await fetchDidDocument(did);
  return {
    did,
    handle: handleFromDoc(doc),
    pdsUrl: pdsFromDoc(doc),
  };
}
