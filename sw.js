/*
 * PHEV Tracker – Service Worker (v217)
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

const CACHE = 'phev-tracker-v217';

// Diese Dateien müssen beim Installieren erreichbar sein. Die PDF-Bibliothek
// wird vom eigenen Hetzner-Server ausgeliefert, nicht von einem fremden CDN.
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css?v=217',
  './app.js?v=217',
  './receipt-parser.js?v=217',
  './receipt-preview.js?v=217',
  './intelligent-analytics.js?v=217',
  './charts.js?v=217',
  './pagination.js?v=217',
  './pdf-report.js?v=217',
  './csv-import-utils.js?v=217',
  './auto-backup.js?v=217',
  './vehicle-costs.js?v=217',
  './cloud.js?v=217',
  './jspdf.umd.min.js?v=217'
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
