# PHEV Tracker v88 – Refactoring-Abschlussreview (Audit-Branch)

Stand: 22. Oktober 2026. Basis: `audit/v88-initialization-dependencies` (nicht `main`).

## Ergebnis und Umfang

Die bisherige Dashboard- und Eintrags-Refactoring-Serie ist in kleine, unabhängig geprüfte Pull Requests aufgeteilt. Die bestehenden Funktionsaufrufe wurden schrittweise in dokumentierte Helfer ausgelagert, ohne die ursprünglichen Cloud-/Persistenzschnittstellen bewusst zu ändern.

| Pull Request | Bereich | Zusätzliche Absicherung |
| --- | --- | --- |
| #2 | Dashboard-Kennzahlen berechnen | Berechnungs-/Format-Verträge |
| #3 | Monatsvergleich | DOM und Sortierung |
| #4 | Timeline | letzte acht Einträge, Leerzustand |
| #5 | Fahrzeugübersicht | Zähler, Fahrzeugfilter, Leerzustand |
| #6 | Fahrzeugzusammenfassung | Auswahl, Kilometerstand |
| #7 | Kennzahlen-HTML | DOM-Ausgabe |
| #8 | Diagrammaufrufe | Reihenfolge und Argumente |
| #9 | Ortsfilter | Optionen, Auswahl |
| #10 | Eintragshistorie | sieben Spalten, 20 Einträge/Seite |
| #11 | Eintrag bearbeiten | Formularwerte und Reihenfolge |
| #12 | Eintrag löschen | Bestätigung und Speichern |
| #13 | Ladeorte/Anbieter | Bearbeiten und Löschen |
| #14 | Fahrzeug-Auswahllisten | Auswahl und Einzel-Fahrzeug-Automatik |

Der CI-Testlauf für PR #14 hat **99 von 99 Offline-Tests** bestanden. Zusätzlich hat PR #16 einen **echten Chromium-Browsertest mit synthetischen API-Antworten** erfolgreich abgeschlossen: Dashboard-Initialisierung, Einträge (20), Fahrzeuge (5), Benutzer (20), Ladeorte/Anbieter (je 5) und Eintrag-Bearbeitungsnavigation. Die produktive API wurde dabei vollständig abgefangen. Die Seitengröße für Einträge ist 20, für Ladeorte und Anbieter 5; die ursprüngliche Nutzer-/Fahrzeug-Pagination wird durch diese Serie nicht verändert.

## Qualitätsgrenzen – wichtig vor einem produktiven Merge

1. **Browser-Test mit isolierter API erfolgreich, kein echter Backend-E2E-Test:** Der Chromium-Test prüft reale HTML-/DOM-Interaktion und Browser-Initialisierung, aber die API-Antworten sind simuliert. Ein vollständiger Login und Datenabgleich mit einer Testdatenbank wurde nicht durchgeführt.
2. **Keine echte Cloud-Integration:** Synchronisierung, Warteschlange, Mehrbenutzer-Szenarien, Rechte und echte Datenbank-Interaktionen wurden nicht gegen eine isolierte Testdatenbank geprüft. Auffällig: Die eingecheckte Datei `server/api.php` bietet keine `session`-Aktion, während `cloud.js` sie für die Sitzungswiederherstellung aufruft. Ob die produktive API von dieser Repository-Datei abweicht, muss vor einer Live-Freigabe geklärt werden.
3. **Keine produktive Migration:** `main`, Deployment, Service Worker und Cloud-Daten wurden in dieser Serie nicht geändert.
4. **Nicht vollständig modularisiert:** `app.js` enthält weiterhin globale Zustände, lange Initialisierungs-/Verwaltungsfunktionen und verbrauchsbezogene Logik. Weitere Umbauten sind möglich, aber angesichts der v86/v87-Regression besonders risikobehaftet. Die bisherige Serie ist ein *abgesicherter Zwischenstand*, keine vollständige Architektur-Neufassung.
5. **Bestehende HTML-Erzeugung:** Der Kachelrenderer übernimmt absichtlich die bisherige `innerHTML`-Ausgabe; Sicherheits-/Escaping-Härtung wäre eine separate Verhaltensänderung und sollte separat geprüft werden.

## Freigabe-Checkliste für spätere Produktion

- [x] Headless-Chromium-Smoke-Test mit synthetischer API: Dashboard, Eintragsbearbeitung und Tabellen-Pagination
- [ ] Manueller Browser-Smoketest: Diagramme, Fahrzeugübersicht und Verbrauchskacheln nach Reload mit realistischen Testdaten
- [ ] Einträge: Erstellen, Bearbeiten, Löschen, 20er-Pagination und Filterwechsel
- [ ] Benutzer: 20er-Pagination, Rechte und Anmeldung
- [ ] Fahrzeuge: 5er-Pagination, Einzelfahrzeug, Wechsel und Neuanlage
- [ ] Ladeorte und Anbieter: jeweils 5er-Pagination, Erstellen/Bearbeiten/Löschen
- [ ] Cloud-Synchronisierung und Offline-Warteschlange mit Testdaten prüfen
- [ ] Deployment-/Rollback-Plan dokumentieren und **separate Freigabe für `main` und Produktion** einholen

## Empfehlung

Den aktuellen Audit-Branch als **funktional durch Offline-Regressionen abgesicherten Refactoring-Kandidaten** behandeln. Ohne isolierten Browser-/Cloud-End-to-End-Test keine Aussage „vollständig produktionsreif“ treffen. Vor einem Merge nach `main` ist eine gesonderte Review- und Freigaberunde nötig.
