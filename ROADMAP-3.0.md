# PHEV Tracker – Version 3.0

Stand: Oktober 2026. Quellcode-Integration, Deployment und produktive Abnahme sind unterschiedliche Schritte.

## Verbindlicher Funktionsumfang für Version 3.0

Diese vier Erweiterungen gehören ausdrücklich zu Version 3.0. Die bisherige Kontoverwaltung allein schließt Version 3.0 nicht ab.

- [ ] **3.0 – Familienverwaltung:** Mitglieder einladen und verwalten, Fahrzeuge mit expliziten Rollen/Berechtigungen teilen, Ausgaben einzelnen Fahrern zuordnen. Vor Umsetzung: Eigentümerschaft, Zugriff auf Historie, Austritt und Löschung sicher modellieren.
- [ ] **3.0 – Erweiterte Auswertungen:** Langfristige Kostenentwicklung, Vergleiche zwischen Fahrzeugen und individuell einstellbare Wirtschaftlichkeitsanalysen mit nachvollziehbaren Annahmen.
- [ ] **3.0 – Belegerkennung:** Fotos von Tank- und Laderechnungen erfassen, relevante Werte auslesen, Vorschau und manuelle Korrektur vor dem Speichern. Datenschutz und Aufbewahrung klären.
- [ ] **3.0 – Automatische Fahrzeugdaten:** Kilometerstand und Ladezustand über geeignete Hersteller- oder Drittanbieter-Schnittstellen einlesen, nur sofern für das Fahrzeug unterstützt. Manuelle Eingabe bleibt möglich; Zugangsdaten und Tokens geschützt speichern.

**Vorgeschlagene Reihenfolge:** Familienverwaltung → Auswertungen → Belegerkennung → Fahrzeugschnittstellen. Technische Machbarkeit und Anbieterabhängigkeiten vor der letzten Etappe klären. Ein Release 3.0 ist erst nach Umsetzung und Abnahme aller vier Bereiche vorgesehen; nicht unterstützte Hersteller müssen ausdrücklich als Einschränkung dokumentiert werden.

## In GitHub integriert

- [x] Passwortänderung mit erneuter Authentifizierung und Sitzungswiderruf (PR #41)
- [x] Eigene Kontolöschung mit Schutz des letzten Administrators (PR #42)
- [x] Passwort-Reset per zeitlich begrenztem E-Mail-Link (PR #43)
- [x] SMTP-Versand mit STARTTLS und Fehlerbehandlung (PR #44 und #45)
- [x] Exklusive Ansicht zum Festlegen des neuen Passworts (PR #46)
- [x] Bereinigung von Fahrzeugbildern und kontobezogenen Browser-Caches bei Kontolöschung (PR #47)

## Produktive Abnahme

- [x] Hetzner-Postfach noreply@web-produktion.com eingerichtet (Betreiberbestätigung)
- [x] SMTP-Hostname mail.your-server.de in der privaten Serverkonfiguration hinterlegt (Betreiberbestätigung)
- [x] Passwort-Reset-Migration ausgeführt (Betreiberbestätigung)
- [x] Passwort-Reset mit E-Mail erfolgreich getestet (Betreiberbestätigung)
- [x] Aktuelle PHP-API nach PR #47 auf Hetzner bereitgestellt (Betreiberbestätigung; keine unabhängige Versionsprüfung)
- [x] Passwortänderung mit einem Testkonto erfolgreich geprüft (Betreiberbestätigung)
- [x] Kontolöschung mit einem separaten Testkonto erfolgreich getestet (Betreiberbestätigung; serverseitige Bilddatei-Löschung nicht unabhängig geprüft)
- [ ] Passwort-Reset-Ansicht nach Frontend-Deployment erneut prüfen
- [ ] iPhone-/Safari-Test für Login, Dashboard, Offline-Cache und Cloud-Synchronisierung
- [ ] Nach erfolgreicher Abnahme Release- und Service-Worker-Cache-Version konsistent aktualisieren

## Weitere Aufgaben

- [ ] Automatisierte Backend-Tests für Kontolöschung, Bildbereinigung und Reset ergänzen
- [ ] Technische Dokumentation und Betriebsanweisungen aktuell halten

## Sicherheit und Deployment

Die echte server/config.php bleibt außerhalb des Repositorys. SMTP-Zugangsdaten nicht committen. Zertifikatsprüfung aktiv lassen. Vor Datenbankänderungen Backups erstellen. Backend-Deployment ist vom automatischen Frontend-Deployment getrennt. GitHub-Checks ersetzen keine produktive Abnahme.
