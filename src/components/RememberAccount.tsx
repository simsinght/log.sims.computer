"use client";

import { useEffect } from "react";
import {
  readRememberedAccounts,
  rememberAccount,
  type RememberedMethod,
} from "@/lib/rememberedAccounts";

// Renders nothing. Mounted by the root layout while signed in: records this
// account on the device (see @/lib/rememberedAccounts) so /login can offer
// "Continue as …" after a sign-out or an expired session.

const AVATAR_WIDTH = 96; // one of Next's default imageSizes
const MAX_AVATAR_BYTES = 48_000;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function cacheAvatar(did: string, avatarUrl: string): Promise<void> {
  // Same-origin through the image optimizer (signed in, so the gate lets it
  // through); the login page then shows the copy without any network request.
  const res = await fetch(
    `/_next/image?url=${encodeURIComponent(avatarUrl)}&w=${AVATAR_WIDTH}&q=75`,
  );
  if (!res.ok) return;
  const blob = await res.blob();
  if (!blob.type.startsWith("image/") || blob.size > MAX_AVATAR_BYTES) return;
  const avatarData = await blobToDataUrl(blob);
  const current = readRememberedAccounts().find((a) => a.did === did);
  if (!current || current.avatarUrl !== avatarUrl) return;
  rememberAccount({ ...current, avatarData });
}

export default function RememberAccount({
  did,
  handle,
  method,
  displayName,
  avatar,
}: {
  did: string;
  handle: string;
  method: RememberedMethod;
  displayName?: string;
  avatar?: string;
}) {
  useEffect(() => {
    const existing = readRememberedAccounts().find((a) => a.did === did);
    // Sessions from before profiles were captured carry no name/avatar; keep
    // whatever the device already has.
    const avatarUrl = avatar ?? existing?.avatarUrl;
    const avatarData =
      existing?.avatarData && existing.avatarUrl === avatarUrl
        ? existing.avatarData
        : undefined;
    rememberAccount({
      did,
      handle,
      method,
      displayName: displayName ?? existing?.displayName,
      avatarUrl,
      avatarData,
      lastUsedAt: Date.now(),
    });
    if (avatarUrl && !avatarData) {
      cacheAvatar(did, avatarUrl).catch(() => {
        // No avatar is fine; the row shows an initial instead.
      });
    }
  }, [did, handle, method, displayName, avatar]);

  return null;
}
