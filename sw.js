/*
 * PHEV Tracker – Service Worker
 * Verwaltet den Offline-Cache für die installierbare iPhone-Web-App.
 * Bei neuen Releases die Cache-Version und Asset-Parameter gemeinsam erhöhen.
 */

const CACHE='phev-tracker-v76';self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['./','./index.html','./manifest.webmanifest','./styles.css?v=76','./app.js?v=76','./charts.js','./cloud.js?v=76'])))});self.addEventListener('activate',event=>{event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))]))});self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request)))});