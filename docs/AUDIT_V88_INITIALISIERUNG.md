# PHEV Tracker – Abhängigkeits- und Initialisierungsprüfung (v88)

Stand: 2026-10-22. Ausgangsbasis: `main`, Frontend-Version 88. **Statische Analyse und isolierte ausführbare Node-/DOM-Tests; keine echten Browser-/Cloud-End-to-End-Tests.**

## Schutzbereich
Keine Änderungen an `app.js`, `cloud.js`, `index.html`, `sw.js`, Datenbank, Cloud-Warteschlange, Einstellungen oder Benutzer-/Fahrzeugdaten. Der Audit liegt auf dem separaten Branch `audit/v88-initialization-dependencies`; `main` bleibt unverändert.

## Laden und Ausführen
`index.html` bindet per `defer` in dieser Reihenfolge ein: `jspdf.umd.min.js`, `charts.js`, `pagination.js`, `pdf-report.js`, `csv-import-utils.js`, `auto-backup.js`, `vehicle-costs.js`, `cloud.js`, `app.js`. Das sichert die Ausführungsreihenfolge der Skripte, **nicht** die Reihenfolge späterer asynchroner API-Antworten.

`cloud.js:265` startet beim Ausführen eine asynchrone Sitzungswiederherstellung. Der erste `await cloudCall('session')` (`cloud.js:271`) gibt die Ausführung frei, sodass `app.js` seine globalen Callbacks registrieren kann. Diese Reihenfolge setzt asynchrone `fetch`-Semantik voraus. Die direkten DOM-Listener werden bereits bei der Skriptausführung registriert.

## Schnittstellenmatrix

| Produzent | Konsument | Schnittstelle | Effekt |
| --- | --- | --- | --- |
| `app.js:34` | `cloud.js:96,277,302` | `window.setVehicles` | Fahrzeugliste setzen, Auswahl/Backup/Rendering aktualisieren |
| `app.js:554` | `cloud.js:87,279,304` | `window.showCloudRecords` | Cloud-Datensätze übernehmen und neu rendern |
| `app.js:531` | `cloud.js:87` | `window.applyCloudPreferences` | Einstellungen/Foto-Cache/Rendering ändern |
| `app.js` | `cloud.js:57` | `window.setManagedCharging` | Ladeort-/Anbieterkatalog übernehmen |
| `app.js:526` | `cloud.js:142,323,336,350` | `window.collectCloudPreferences` | Einstellungen für Cloud-Speicherung lesen |
| `cloud.js:360` | `app.js:131` | `window.queueCloudChanges` | Kontobezogene Offline-Queue aktualisieren |
| `pagination.js` | `app.js`, `cloud.js:197` | `window.paginateTable` | Nur sichtbare Tabellenzeilen ändern |
| `vehicle-costs.js:10` | `app.js:482,499` | `window.PhevTco` | Reine Kostenberechnung |
| `charts.js` | `app.js:260-263` | `AnalyticsCharts` | Diagramme zeichnen |
| `auto-backup.js` | `app.js:851` | `updateAutomaticBackupStatus` | Backup-Anzeige initialisieren |

## Aufrufketten und kritische Abhängigkeiten

1. `cloud.js:265-312`: Sitzung prüfen → vorhandene Caches optional anzeigen (`:275-280`) → `loadCloudOverview()` (`:281`).
2. `loadCloudOverview()` (`cloud.js:87`): Fahrzeuge laden → API-Einträge mit Offline-Queue zusammenführen → `showCloudRecords` → Queue-Synchronisierung anstoßen → Ladekatalog laden → Preferences übernehmen. Diese Schritte können mehrfach `render()` auslösen.
3. `app.js:34`: `setVehicles` → `refreshVehicles` → `scheduleAutomaticBackup` → `render`.
4. `app.js:554`: `showCloudRecords` → Daten normalisieren → Backup vormerken → `render` → Zähler aktualisieren.
5. `app.js:185-286`: `render` liest aktuelle globale `records`, `vehicles`, `settings`, Filter und DOM-Elemente; ruft Verbrauchsanalyse, Energiebilanz, Trend, Kostenvergleich und `AnalyticsCharts` auf. Timeline und Fahrzeugübersicht werden in derselben Funktion aufgebaut. Eine ungeschützte Exception vor `:264-285` kann diese Bereiche leer lassen.
6. `app.js:531-552`: `applyCloudPreferences` aktualisiert Einstellungen und rendert erneut.
7. `app.js:130-135`: `save` nutzt bei Cloud-Ansicht `queueCloudChanges`; `cloud.js:360,366` schreibt Queue/Cache und synchronisiert sequenziell. **Isolierte Fehler- und Offline-Queue-Tests liegen inzwischen vor; echte Browser-/Cloud-Integrationsprüfungen stehen aus.**

## Beobachtungen und Prüfbedarf

- **Priorität hoch:** Dashboard-Regression v86: `render()` hat zahlreiche DOM- und Zustandsabhängigkeiten; eine Exception kann nachfolgende Abschnitte verhindern. Der konkrete Fehler von v86 ist anhand des aktuellen v88-Codes allein **nicht bewiesen**. `consumption-analysis.js` bleibt deaktiviert.
- **Priorität hoch:** `loadCloudOverview()` startet `syncCloudQueue()` ohne `await`. Die UI kann bereits neu gezeichnet werden, während Queue-Operationen laufen. Das ist kein bestätigter Fehler, aber eine wichtige asynchrone Grenze.
- **Priorität mittel:** Wiederholte Aufrufe von `render()` während Cache-/Cloud-/Preferences-Übernahme sind vorgesehen. Regressionstests sollten Fahrzeugübersicht, Timeline, Diagramme und Filter nach jedem Schritt prüfen.
- **Priorität mittel:** `cloud.js:87` liest die Queue über `JSON.parse` ohne lokale Fehlerbehandlung; fehlerhafter gespeicherter JSON-Text könnte den Cloud-Überblick abbrechen. Nicht ohne isolierte Tests ändern.
- **Priorität mittel:** `cloud.js:360` hängt bei Änderungen Queue-Operationen an. Queue-Deduplizierung und konkurrierende Synchronisierung benötigen eigene Tests, bevor Änderungen vertretbar sind.
- **Priorität niedrig:** `charts.js` wird in `index.html` ohne `?v=88` geladen. Der bestehende Test nimmt diese Datei ausdrücklich von der Query-Parameter-Prüfung aus. Cache-/Update-Verhalten gesondert prüfen.
- **Testgrenze:** `tests/refactoring.test.cjs` prüft Syntax, Reihenfolge und einzelne Berechnungen, aber keine echten DOM-Renderzyklen, Browser-Ladefehler oder Cloud-Races.

## Erweiterte Regressionstests (Audit-Branch)

Die folgenden Tests führen produktive Funktionen unverändert mit künstlichen Daten aus; sie greifen weder auf produktiven Storage noch auf API-Endpunkte zu:

| Testdatei | Schutzbereich |
| --- | --- |
| `tests/pagination-dom.test.cjs` | 20/5 Einträge je Seite, Zustandswechsel, leere Tabellen |
| `tests/dashboard-contract.test.cjs` | Dashboard-Aufrufkette, Cloud-Callbacks, Queue-Vertrag |
| `tests/consumption-dom.test.cjs` | Leere Daten, Kosten/100 km, gewichtete Strompreise, Ausreißer |
| `tests/charts-dom.test.cjs` | Alle vier Diagrammtypen, SVG, DOM-Neuzeichnung |
| `tests/cloud-queue.test.cjs` | Bestätigte Operationen, Fehlererhalt, Offline, leere Queue |

Der GitHub-Actions-Lauf für Commit `0faf9bf3` ist erfolgreich abgeschlossen. Diese Tests sind keine Garantie für korrektes Verhalten in echten Browsern oder bei konkurrierenden Netzwerkantworten.

## Empfohlene sichere Fortsetzung

1. Als Nächstes einen **vollständigen Dashboard-DOM-Test** mit synthetischen Einträgen/Fahrzeugen ergänzen; besonders Timeline und Fahrzeugübersicht nach Filterwechseln.
2. Die Auswirkungen eines Fehlers in einem Teilrenderer mit einem gezielten Test sichtbar machen; eine produktive Fehlerisolierung erst nach gesonderter Freigabe ändern.
3. Asynchrone Cloud-Initialisierung und Queue-Zusammenführung getrennt mit gemockten Antworten prüfen.
4. Danach einen **kleinen, reversiblen** Refactoring-Schritt in einem eigenen PR vorbereiten; `main` und Deployment bis zur ausdrücklichen Freigabe nicht verändern.
