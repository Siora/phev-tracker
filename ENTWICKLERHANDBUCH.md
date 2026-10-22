# PHEV Tracker – Entwicklerhandbuch

Stand: Version 88 · Branch `main`

## 1. Systemüberblick

Die Anwendung ist eine deutschsprachige Progressive Web App (PWA) mit einer HTML-Oberfläche, JavaScript-Logik, CSS-Design und einem Service Worker. Die produktive Website liegt unter `https://tracker.web-produktion.com/`.

| Datei | Verantwortung |
| --- | --- |
| `index.html` | Seiten, Formulare, Navigation und Einbindung der Skripte |
| `pagination.js` | Wiederverwendbare Tabellen-Pagination (ohne Änderung der Quelldaten) |
| `consumption-analysis.js` | Archivierter, derzeit **nicht eingebundener** Versuch der Analyse-Auslagerung aus v86 |
| `vehicle-costs.js` | Reine TCO-Berechnung und Währungsumrechnung, ohne DOM oder Cloud-Nebenwirkungen |
| `csv-import-utils.js` | CSV-Zeilenparser und Datumsnormalisierung für den Import |
| `auto-backup.js` | Kontobezogene, rotierende lokale Sicherungen ohne Cloud-Eingriff |
| `pdf-report.js` | jsPDF-basierte Layout-Klasse `PhevPdfReport` |
| `app.js` | Einträge, Fahrzeugauswahl, Dashboard, Filter, Ladeorte/Anbieter, Kosten, CSV-/PDF-Export, lokale Backups |
| `cloud.js` | Anmeldung, Cloud-API, Fahrzeugverwaltung, Benutzerverwaltung, Synchronisationswarteschlange und Kontoeinstellungen |
| `charts.js` | Diagramme aus bereits gefilterten Einträgen |
| `styles.css` | Responsives Design und spätere visuelle Overrides |
| `sw.js` | Cache der PWA-Dateien und Offline-Verfügbarkeit |
| `manifest.webmanifest` | Installationsmetadaten |
| `.github/workflows/deploy-pwa-hetzner.yml` | Automatischer Upload der Frontend-Dateien |

**Servergrenze:** Die produktive PHP-API `/api/api.php` und MySQL liegen auf Hetzner. Der Frontend-Workflow darf den Ordner `api/` weder überschreiben noch löschen.

## 2. Datenhaltung

### Lokale Browserdaten

- `phev-records-1`: lokale Einträge.
- `phev-session-v1`: Kontoinformationen für die Wiederherstellung einer bestehenden Sitzung, **kein Cookie-Geheimnis**.
- `phev-cache-<email>`: letzter bekannter Stand der Cloud-Einträge.
- `phev-queue-<email>`: ausstehende Änderungen, die bei Verbindung synchronisiert werden.
- `phev-vehicles-cache-<email>`: zwischengespeicherte Fahrzeugliste.
- `phev-photo-<vehicleId>`: URL des Fahrzeugbilds.
- `phev-record-times-<email>`, `phev-charge-modes-<email>`: ergänzende Angaben für ältere Eintragsschemata.
- Weitere lokale Einstellungen und Ladeort-/Anbieterdaten sind in `app.js` über ihre jeweiligen Schlüssel definiert.

**Sicherheitsregel:** Browserdaten, Warteschlangen und Caches nicht pauschal löschen. Das kann noch nicht synchronisierte Einträge betreffen.

### Cloud

`cloud.js` kommuniziert mit `https://tracker.web-produktion.com/api/api.php`. Die Anmeldung verwendet eine Cookie-Sitzung; Anfragen verwenden `credentials: 'same-origin'`. Fahrzeuge, Einträge und Kontoeinstellungen werden über die vorhandenen API-Aktionen geladen und gespeichert. Zusätzliche Fahrzeugausgaben stehen im Preferences-Feld `vehicle_expenses`; sie sind keine eigene SQL-Tabelle.

## 3. Wichtige Abläufe

### Anmeldung und Start

1. Der Browser lädt HTML, CSS, `app.js`, `cloud.js` und weitere Assets.
2. `cloud.js` prüft die bestehende Sitzung.
3. Lokale Cloud-Caches ermöglichen eine schnelle Darstellung, bevor die aktuellen Serverdaten eintreffen.
4. `loadCloudOverview()` lädt Fahrzeuge, Einträge, Ladeort-/Anbieterkatalog und Preferences.
5. `app.js` übernimmt die Daten über `window.setVehicles`, `window.showCloudRecords` und `window.applyCloudPreferences`.

### Speichern und Synchronisieren

1. Die Benutzeraktion aktualisiert die lokale Eintragsliste.
2. `window.queueCloudChanges` ermittelt neue/geänderte/gelöschte Einträge.
3. Die Operationen werden kontobezogen in `phev-queue-<email>` vorgemerkt.
4. `syncCloudQueue()` sendet die Operationen nacheinander.
5. Erst nach erfolgreicher API-Antwort wird die jeweilige Operation aus der Warteschlange entfernt.

**Wichtig:** Bei Verbindungsproblemen die Queue nicht verwerfen. Cloud-Preferences (z. B. Fahrzeugausgaben) haben einen separaten Speicherablauf; dort wird ein Erfolg erst nach Serverbestätigung angezeigt.

### Tabellen und Seitennavigation

Die gemeinsame Funktion `window.paginateTable(container, table, tbody, items, pageSize, key, makeRow)` in `pagination.js` zeigt nur einen Ausschnitt der bereits vorhandenen Datensätze. Sie ändert weder Einträge noch die Datenbank.

| Liste | Größe pro Seite |
| --- | ---: |
| Lade-/Tankeinträge | 20 |
| Benutzer | 20 |
| Fahrzeuge | 5 |
| Ladeorte | 5 |
| Anbieter | 5 |

Die Seitennummer wird während der geöffneten Sitzung je Liste gespeichert und bei kleiner werdenden Listen auf den gültigen Bereich begrenzt. Editieren und Löschen verwenden weiterhin die Originalobjekte.

### PDF-Berichte

`exportPdfReport(mode)` berechnet den Bericht aus Einträgen und zusätzlichen Fahrzeugausgaben. `PhevPdfReport` aus `pdf-report.js` setzt die Darstellung mit **jsPDF** um. Die Bibliothek wird als `jspdf.umd.min.js` vom selben Webserver geladen und durch den Deployment-Workflow aus der festgelegten npm-Version bereitgestellt. PDF-Erstellung findet im Browser statt; es werden dafür keine Berichtsdaten an einen PDF-Dienst gesendet.

### Service Worker und Releases

`sw.js` verwaltet den Cache `phev-tracker-vNN`. Bei einer neuen Frontend-Version müssen die Asset-Query-Parameter in `index.html`, die sichtbare Versionsangabe und die Cache-Version in `sw.js` konsistent erhöht werden. Ein Kommentar-/Dokumentations-Commit benötigt **keinen** Release-Bump, sofern die ausgelieferten Dateien unverändert bleiben; bei Änderungen an JS/CSS/HTML ist der Cache-Bump sinnvoll.

## 4. Code-Konventionen

- Funktionsnamen und API-Schlüssel stabil halten; eine reine Formatierung darf kein Datenformat ändern.
- Komplexe Funktionen mit Kommentaren zu **Zweck**, **Eingaben**, **Nebenwirkungen** und **Fehlerfällen** versehen.
- DOM-Texte mit `textContent` setzen, insbesondere bei Benutzerdaten.
- Bei Formularen bestehende Validierungen und Bestätigungen beibehalten.
- Keine direkten Datenbankoperationen im Frontend; Kommunikation nur über die bestehende API.
- Für neue Tabellen die vorhandene Pagination wiederverwenden.
- Die vielen historischen CSS-Overrides nicht unkontrolliert löschen: spätere Regeln überschreiben bewusst ältere Designs.

## 5. Testcheckliste

1. Anmeldung bleibt nach Neuladen bestehen.
2. Fahrzeuge, Fotos, Lade- und Tankeinträge erscheinen weiterhin.
3. Speichern, Bearbeiten und Löschen funktionieren.
4. Seitenwechsel bei 20 bzw. 5 Datensätzen; letzte Seite und leere Listen prüfen.
5. Ladeorte und Anbieter bleiben nach Neuladen vorhanden.
6. Offline-Eintrag wird später synchronisiert; keine Queue-Daten gehen verloren.
7. Monats- und Jahres-PDF zeigen Kennzahlen, Tabellen und Seitenumbrüche.
8. GitHub Actions: Hetzner-Upload erfolgreich, **kein Eingriff in `api/`**.

## 6. Bekannte Wartungsthemen

- `app.js` und `cloud.js` enthalten mehrere große Funktionen und kompakte Einzeiler. Eine spätere Modulaufteilung sollte separat und mit Regressionstests erfolgen.
- `styles.css` enthält ältere Themes und mehrere Override-Blöcke. Eine Bereinigung erfordert visuelle Tests auf iPhone und Desktop.
- Ein erfolgreicher GitHub-Commit allein beweist keinen erfolgreichen Hetzner-Upload oder Browser-Test.

## 7. Refactoring-Stand (v84)

**Erste abgeschlossene Etappe:** Die Tabellen-Pagination und das PDF-Layout wurden unverändert aus `app.js` in eigenständige Dateien verschoben. `app.js` enthält weiterhin die Berechnung der Berichte und die Eintragsverwaltung. Die Reihenfolge der `defer`-Skripte in `index.html` ist relevant: jsPDF → Diagramme → Pagination → PDF-Layout → Cloud → App. Der Hetzner-Workflow und der Service-Worker-Cache berücksichtigen beide neuen Dateien.

**Nächste mögliche Etappen:** Diagramm-/Auswertungslogik, Import-/Exportfunktionen und Fahrzeugkostenverwaltung weiter isolieren. Vor jedem Schritt Syntax-, Lade- und Funktionstests durchführen. Die Datenhaltung und das API-Protokoll bleiben unangetastet.

## 8. Refactoring-Etappe v85

CSV-Parser (`csvRows`, `date`) und automatische lokale Backup-Funktionen wurden aus `app.js` in `csv-import-utils.js` bzw. `auto-backup.js` ausgelagert. Die Importoberfläche, Bestätigungen und Eintragsänderungen bleiben in `app.js`. Der abschließende Aufruf von `updateAutomaticBackupStatus()` bleibt dort ebenfalls stehen, damit alle App-Zustandsvariablen vorher initialisiert sind. Beide neuen Skripte werden **vor** `app.js` geladen und in Service Worker und Hetzner-Workflow mit ausgeliefert. Keine Änderung der Datenformate oder Cloud-API.

## 9. Refactoring-Etappe v86

Die Verbrauchs- und Energiebilanzfunktionen (`fuelEnergyFactor`, `energyBalance`, `consumptionTrendRows`, `renderConsumptionTrend`, `renderEnergyBalance`, `getCostComparison`, `renderCostComparison` und Ladearten-Helfer) wurden aus `app.js` nach `consumption-analysis.js` verschoben. Die Funktionen verwenden weiterhin dieselben globalen App-Zustände und LocalStorage-Schlüssel; der Datenfluss und die Cloud-API bleiben unverändert. Das Modul wird vor `app.js` geladen und im Offline-Cache sowie Hetzner-Deployment berücksichtigt. Fahrzeugausgaben und TCO verbleiben vorerst in `app.js` und sollten als eigenständige nächste Etappe mit UI-Regressionstests ausgelagert werden.

## 10. Dashboard-Stabilisierung v87

Nach v86 meldete ein iPhone-Test leere Diagramme, Timeline und Fahrzeugübersicht. Zur Risikobegrenzung wurde die v86-Auslagerung der Verbrauchsanalysen rückgängig gemacht: Die unveränderten Funktionen stehen wieder in `app.js`. `consumption-analysis.js` bleibt vorerst nur als ungenutzte Datei im Repository und wird **nicht** in HTML, Service Worker oder Hetzner-Upload eingebunden. Dies ist ein gezielter Rollback des letzten Refactorings, kein Löschen von Nutzerdaten. Vor einem erneuten Auslagern sind Browser-Konsole, Ladefehler und ein Dashboard-Regressionstest zu prüfen.

## 11. Vorsichtige TCO-Auslagerung v88

Nach dem bestätigten Dashboard-Rollback in v87 wurden in v88 **nur die reinen TCO-Rechenoperationen** nach `vehicle-costs.js` ausgelagert. `renderVehicleExpenses`, `applyVehicleExpenses`, `window.setVehicleExpenses`, die Formular-Ereignisse und die Cloud-Preferences verbleiben in `app.js`. Das Modul besitzt keine Start-Initialisierung und verändert weder Speicher noch Datensätze. Es wird vor `app.js` geladen und in Deployment sowie Offline-Cache aufgenommen. Ein isolierter Test mit zwei Fahrzeugen prüfte die Filterung, EUR→CHF-Umrechnung, laufende Kosten und Kilometerstandsspanne. JavaScript-Syntaxprüfung bestanden; realer iPhone-/Deployment-Test weiterhin erforderlich.

## 12. Automatische Sicherheitsprüfungen (nach v88, ohne App-Release)

Das Repository enthält jetzt `tests/smoke.test.cjs` und den GitHub-Actions-Workflow `.github/workflows/test-frontend.yml`. Bei Änderungen am Frontend, den Tests oder den Workflow-Dateien laufen isolierte Node.js-Tests. Die Tests verändern **keine** produktiven Daten und laden **nichts** auf Hetzner hoch.

Abgedeckt werden: JavaScript-Syntax der lokal eingebundenen Module, Existenz der Dateien, Reihenfolge der Skriptabhängigkeiten, Vollständigkeit des Service-Worker-Caches, Frontend-Uploadliste ohne `api/`, TCO-Beispielrechnung sowie CSV-Parsing und Datumsnormalisierung. Ein fehlgeschlagener Test wird als fehlgeschlagener GitHub-Check sichtbar. Die bestehende Hetzner-Deployment-Aktion ist davon aktuell **nicht technisch blockiert**; die Testresultate sollten vor weiteren Releases kontrolliert werden.

**Grenzen:** Diese Tests ersetzen keinen echten iPhone-/Safari-Test. Insbesondere DOM-Rendering, Login, Cloud-Synchronisierung und PDF-Ausgabe müssen nach Änderungen weiterhin manuell geprüft werden. Die Testdateien selbst lösen keinen produktiven Upload aus und erfordern keinen Versionssprung von v88.
