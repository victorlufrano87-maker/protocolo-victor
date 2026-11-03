const CACHE = "protocolo-v30";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/treino", "/manifest.json", "/training-manifest.json", "/icon-192.png"]).catch(() => {}))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("protocolo-v") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // arquivos do app (com hash): cache primeiro
  if (url.pathname.startsWith("/_next/static/") || /\.(png|jpe?g|json|css|woff2?)$/.test(url.pathname)) {
    const response = caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req); if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) await cache.put(req, res.clone());
      return res;
    });
    e.respondWith(response);
    return;
  }
  // páginas: rede primeiro, cache se estiver offline
  if (req.mode === "navigate" && ["/", "/treino"].includes(url.pathname)) {
    e.respondWith(fetch(req).then(async (res) => {
      if (res.ok) { const cache = await caches.open(CACHE); await cache.put(url.pathname, res.clone()); }
      return res;
    }).catch(async () => (await caches.match(url.pathname)) || Response.error()));
  }
});

self.addEventListener("push", (e) => {
  const d = e.data ? e.data.json() : { title: "Protocolo", body: "" };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, tag: d.tag, icon: "/icon-192.png", badge: "/icon-192.png" }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => cs.length ? cs[0].focus() : self.clients.openWindow("/")));
});
