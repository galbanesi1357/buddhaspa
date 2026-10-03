// Service worker do Guia de Rua: sempre busca a versão mais nova do app na rede
// (ignorando o cache do navegador) e só usa a cópia guardada quando está sem internet.
const CACHE = "guia-offline-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  const isVendor = url.pathname.includes("/vendor/");
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Bibliotecas não mudam: usa a cópia guardada se houver
    if (isVendor) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const fresh = await fetch(new Request(req.url, { cache: "no-store", credentials: "same-origin" }));
      if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    } catch (err) {
      const hit = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
      if (hit) return hit;
      throw err;
    }
  })());
});
