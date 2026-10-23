/*
 * PHEV Tracker – Service Worker (v218)
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

const CACHE = 'phev-tracker-v218';

// Diese Dateien müssen beim Installieren erreichbar sein. Die PDF-Bibliothek
// wird vom eigenen Hetzner-Server ausgeliefert, nicht von einem fremden CDN.
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css?v=218',
  './app.js?v=218',
  './receipt-parser.js?v=218',
  './receipt-ocr.js?v=218',
  './tesseract.min.js?v=218',
  './receipt-preview.js?v=218',
  './intelligent-analytics.js?v=218',
  './charts.js?v=218',
  './pagination.js?v=218',
  './pdf-report.js?v=218',
  './csv-import-utils.js?v=218',
  './auto-backup.js?v=218',
  './vehicle-costs.js?v=218',
  './cloud.js?v=218',
  './jspdf.umd.min.js?v=218'
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
