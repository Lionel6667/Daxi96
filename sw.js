self.addEventListener("install", event => {
  console.log("Service Worker installé ✅");
  event.waitUntil(
    (async () => {
      const cache = await caches.open("app-cache");
      const urls = [
        "/",
        "/index.html",
        "/manifest.json",
        "/assets/images/img87.jpg"
      ];

      try {
        
        await cache.addAll(urls);
        return;
      } catch (err) {
        console.warn('cache.addAll a échoué, tentative de mise en cache url-par-url:', err);
      }

      
      for (const url of urls) {
        try {
          const resp = await fetch(url, {cache: 'no-store'});
          if (resp && resp.ok) {
            await cache.put(url, resp.clone());
          } else {
            console.warn('Ressource non mise en cache (status != ok):', url, resp && resp.status);
          }
        } catch (e) {
          console.warn('Échec fetch pour', url, e);
        }
      }
    })()
  );
});

self.addEventListener("fetch", event => {
  
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});