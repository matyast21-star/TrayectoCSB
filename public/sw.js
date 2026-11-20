/* VAMO · Service Worker solo para notificaciones push de «Avísame cuando venga».
   No guarda la app en caché (la app sigue cargándose siempre desde la red). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) { d = { texto: e.data ? e.data.text() : '' }; }
  const titulo = d.titulo || 'VAMO!';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.texto || 'Hay novedades en tu trayecto.',
    icon: 'ui/icon-192.png', badge: 'ui/icon-192.png', lang: 'es-CL',
    tag: d.tag || 'vamo-aviso', renotify: !!d.tag, data: { url: d.url || './?aviso=1' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ls => {
    for (const c of ls) if (c.url.startsWith(self.registration.scope)) { c.focus(); c.postMessage({ tipo: 'abrir-aviso' }); return; }
    return self.clients.openWindow(url);
  }));
});
