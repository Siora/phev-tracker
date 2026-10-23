# PHEV Tracker

Deutschsprachige Progressive Web App zur Verwaltung von Plug-in-Hybrid-Fahrzeugen: Ladevorgänge, Tankungen, Kilometerstände, Energie- und Fahrzeugkosten, Wartungserinnerungen sowie Auswertungen in CHF/EUR.

**Aktueller Stand:** Version 3.0 in Entwicklung; Frontend-Stand 2.14. Die Kontofunktionen sind im Quellcode integriert; produktive Abnahme und Backend-Bereitstellung sind separat zu prüfen. Siehe [Roadmap 3.0](ROADMAP-3.0.md).

## Betrieb und Veröffentlichung

Die produktive Anwendung läuft unter https://tracker.web-produktion.com/ auf Hetzner. Änderungen am Frontend werden über `.github/workflows/deploy-pwa-hetzner.yml` aus `main` veröffentlicht, nachdem die automatischen Tests erfolgreich waren. Das PHP-/MySQL-Backend liegt unter `/api/api.php` und wird **nicht** durch den Frontend-Upload ersetzt.

GitHub Pages ist **nicht** der produktive Veröffentlichungsweg. Das Repository enthält außerdem einen manuellen SFTP-Workflow für das Backend; dieser darf nicht versehentlich als Frontend-Deployment verwendet werden.

## Funktionen

- Fahrzeuge und zugehörige Lade-/Tankvorgänge verwalten.
- Fahrzeug-Gesamtkosten einschließlich SQL-gespeicherter Ausgaben und Wartungserinnerungen anzeigen.
- Verbrauch, Energiebilanz, mehrjährige Kostenentwicklung und Jahreskostenprognose auswerten.
- Vorjahreskosten nach gleichen abgeschlossenen Monaten vergleichen und auffällige Strom-/Benzin-Einheitspreise erkennen.
- Hypothetische Jahreskosten für ein frei einstellbares Fahrprofil berechnen (kein direkter Wirtschaftlichkeitsvergleich zwischen Fahrzeugen).
- Dashboard-Kacheln ausblenden und anordnen; Layout lokal und über vorhandene Cloud-Preferences synchronisieren.
- CSV-Import, PDF-Berichte, lokale Sicherungen und PWA-Offline-Cache.

## Entwicklung und Tests

- Frontend: `index.html`, `app.js`, modulare `*.js`-Helfer und `styles.css`.
- Backend: `server/api.php` und SQL-Migrationen in `server/`.
- Regressionstests: `node --test tests/*.test.cjs` (einzelne Browser-/Produktivtests benötigen eine geeignete Umgebung).
- PHP-Syntax: `php -l server/api.php`.
- Architektur, Cache-Versionierung und Releasehinweise: [ENTWICKLERHANDBUCH.md](ENTWICKLERHANDBUCH.md).

## Datenschutz und Sicherheit

Keine echten CSV-Exporte, Zugangsdaten, `config.php`, Sessioninformationen oder Nutzerdaten ins öffentliche Repository übernehmen. Cloud-Daten, Offline-Warteschlangen und Browser-Caches nicht ohne Migrationskonzept löschen. Backups vor Backend-Migrationen anfertigen.
