const offlineCache = "ouro-branco-offline-v1";
const offlinePage = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(offlineCache)
      .then((cache) => cache.add(new Request(offlinePage, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("ouro-branco-offline-") && key !== offlineCache)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.mode !== "navigate" ||
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(offlineCache);
      return (
        (await cache.match(offlinePage)) ??
        new Response("Ouro Branco está sem conexão.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      );
    }),
  );
});
