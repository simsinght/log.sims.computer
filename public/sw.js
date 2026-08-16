// Minimal service worker for tvlog: installability + an offline fallback only.
// It caches NOTHING but the static offline page. Real content, API, and auth
// traffic always go to the network (an atproto-backed app must never serve
// stale auth or data), so only document navigations are intercepted, and only
// to substitute the offline page when the network is unreachable.

const OFFLINE_URL = "/offline.html";
const CACHE = "tvlog-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // Only handle top-level navigations; leave every other request (assets,
  // API/auth fetches, RSC payloads) untouched so nothing is cached or altered.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL)),
  );
});
