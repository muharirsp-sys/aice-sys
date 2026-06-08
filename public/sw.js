// Service worker Aice — caching aset penting + offline-terbatas (tanpa workbox).
const VERSION = "aice-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const PRECACHE = ["/offline", "/icons/icon-192.png", "/manifest.webmanifest"];

// Jangan cache: API, dokumen PDF, bukti upload (dinamis & butuh auth).
function isBypass(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/pdf/") ||
    url.pathname.startsWith("/uploads/")
  );
}
function isStatic(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || isBypass(url)) return;

  // Aset statis -> cache-first + perbarui di belakang (stale-while-revalidate).
  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || fetchPromise;
      }),
    );
    return;
  }

  // Navigasi halaman -> network-first, fallback ke cache lalu /offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/offline"))),
    );
    return;
  }

  // Lainnya -> network, fallback cache.
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
