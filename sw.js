/*
 * PHEV Tracker – Service Worker (v206)
 *
 * Aufgabe:
 * - Statische PWA-Dateien für Offline-Nutzung zwischenspeichern.
 * - Bei einer neuen Version veraltete PWA-Caches entfernen.
 * - Für GET-Anfragen derselben Herkunft zuerst das Netzwerk versuchen
 *   und bei Verbindungsproblemen auf den vorhandenen Cache zurückfallen.
 *
 * WICHTIG: Hier werden ausschließlich Cache-Einträge verwaltet.
 * Keine lokalen Nutzerdaten, IndexedDB, localStorage oder Cloud-Einträge löschen.
 * Cache-Version und Versionsparameter in index.html gemeinsam erhöhen.
 */

const CACHE = 'phev-tracker-v206';

// Diese Dateien müssen beim Installieren erreichbar sein. Die PDF-Bibliothek
// wird vom eigenen Hetzner-Server ausgeliefert, nicht von einem fremden CDN.
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css?v=206',
  './app.js?v=206',
  './intelligent-analytics.js?v=206',
  './charts.js?v=206',
  './pagination.js?v=206',
  './pdf-report.js?v=206',
  './csv-import-utils.js?v=206',
  './auto-backup.js?v=206',
  './vehicle-costs.js?v=206',
  './cloud.js?v=206',
  './jspdf.umd.min.js?v=206'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys =>
        Promise.all(
          keys.filter(key => key !== CACHE).map(key => caches.delete(key))
        )
      )
    ])
  );
});

self.addEventListener('fetch', event => {
  // POST/PUT/DELETE und fremde Domains werden niemals durch diesen Worker
  // abgefangen. Insbesondere darf der Cloud-API-Speicherfluss nicht gecacht werden.
  if (
    event.request.method !== 'GET' ||
    new URL(event.request.url).origin !== self.location.origin
  ) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        // Cache-Schreibvorgang läuft nebenläufig; die Netzantwort geht sofort
        // an die Anwendung zurück. Das Verhalten entspricht dem bisherigen Worker.
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
