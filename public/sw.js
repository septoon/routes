// Lightweight SW for Background Sync notification
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { self.clients.claim(); });

self.addEventListener('sync', (event) => {
  if (event.tag === 'send-queued-days') {
    event.waitUntil((async () => {
      const allClients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      for (const client of allClients) {
        client.postMessage({ type: 'BG_SYNC_TRIGGER' });
      }
    })());
  }
});
