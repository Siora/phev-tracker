# Refactoring v88 – Review und Freigabecheckliste

Stand: 2026-10-22. Branch: `refactor/v88-dashboard-stat-tiles`.
Ziel: `audit/v88-initialization-dependencies`, **nicht** `main`.

## Technische Änderung

In `app.js` wurde ausschließlich die Konstruktion der zehn
Dashboard-Statistik-Kacheln aus `render()` in die dokumentierte Funktion
`buildDashboardStatTiles()` verschoben. Die bestehende DOM-Zeile
`$('stats').innerHTML=tiles.map(...).join('')` bleibt erhalten.

Unverändert bleiben insbesondere:
- Formeln, Beschriftungen, Reihenfolge, Anzahl und Währung der Kacheln
- Filterlogik, Datensätze, Diagramme, Timeline und Fahrzeugübersicht
- Cloud-API, Offline-Warteschlange, Benutzer- und Fahrzeugverwaltung
- HTML-Skriptreihenfolge, Service Worker, Cache-Version und Deployment

## Automatisierte Prüfung

- Bestehende Regressionstests für Pagination, Dashboard, Diagramme,
  Verbrauch, Cloud-Queue und Cloud-Initialisierung
- Vier neue Tests in `tests/dashboard-stat-tiles.test.cjs`:
  Referenzwerte, fehlende Kilometerstandsspanne, Unveränderlichkeit
  der Eingaben und leere Lade-/Tanklisten
- Pull-Request-Check auf Commit `27f3f8c9`: **erfolgreich**

Die Tests sind isoliert und verwenden keine produktiven Daten.

## Manuelle Browser-Prüfung vor einem späteren Deployment

1. Dashboard mit allen Fahrzeugen: zehn Kacheln, Diagramme,
   Timeline und Fahrzeugübersicht sichtbar
2. Fahrzeugfilter wechseln und wieder auf „Alle Fahrzeuge“ stellen
3. Zeitraum mit Einträgen und leeren Zeitraum auswählen
4. Kosten/100 km ohne und mit mindestens zwei Kilometerständen prüfen
5. Lade- und Tankwerte sowie CHF-/EUR-Anzeigen mit bekannten
   Testeinträgen vergleichen
6. Offline-Modus, Anmeldung und Cloud-Synchronisierung separat prüfen
   – **keine produktiven Daten zu Testzwecken löschen oder ändern**

## Freigabegrenze

Dieser Entwurf darf nicht ohne ausdrückliche Zustimmung gemergt oder
deployt werden. Die automatisierten Tests ersetzen keinen Browser-
und Cloud-Integrationstest. Ein Merge in den Audit-Branch allein wäre
noch keine Veröffentlichung, bleibt aber ebenfalls freigabepflichtig.
