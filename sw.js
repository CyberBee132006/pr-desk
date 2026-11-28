// PR desk service worker: receives shares from the phone's share sheet and shows
// reminders. It does not cache the app (the stale-page guard handles updates).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method === "POST" && u.pathname.endsWith("/share-target")) {
    e.respondWith((async () => {
      const f = await e.request.formData();
      const c = await caches.open("pr-share");
      const img = f.get("image");
      const share = { title: f.get("title") || "", text: f.get("text") || "", url: f.get("url") || "" };
      if (img && img.size) {
        share.image = true;
        share.imageType = img.type || "image/png";
        await c.put("share-image", new Response(img, { headers: { "content-type": share.imageType } }));
      }
      await c.put("share", new Response(JSON.stringify(share), { headers: { "content-type": "application/json" } }));
      return Response.redirect(new URL("./?share=1", self.registration.scope).href, 303);
    })());
  }
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow(self.registration.scope);
  })());
});
