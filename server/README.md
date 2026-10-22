# PHEV Tracker – Hetzner PHP/MySQL-Backend

**Status:** Produktiv verwendete API. Dieser Ordner ist keine bloße Vorbereitung und wird nicht durch den Frontend-Workflow automatisch in `/api/` hochgeladen.

## Architektur

- Die PWA ruft `https://tracker.web-produktion.com/api/api.php` auf.
- Anmeldung und Berechtigungen werden serverseitig geprüft; die Anwendung verwendet eine Cookie-Sitzung.
- Fahrzeuge, Einträge, Ladeort-/Anbieterkatalog und Fahrzeugausgaben werden über die API und MySQL verwaltet.
- Fahrzeugausgaben stehen in der SQL-Tabelle `vehicle_expenses`, **nicht** in den Cloud-Preferences. Die API-Aktionen lauten `vehicle-expenses`, `vehicle-expense-save`, `vehicle-expense-delete`.
- Dashboard-Anordnung und weitere Benutzereinstellungen können über Cloud-Preferences synchronisiert werden.

## Sichere Änderungen

1. Vor Änderungen an SQL oder PHP ein Datenbank- und Dateibackup anfertigen.
2. Migrationen in `server/` auf einer Testumgebung prüfen; niemals bereits vorhandene Nutzerdaten überschreiben.
3. `server/config.example.php` ist nur eine Vorlage. Die produktive `config.php` mit Zugangsdaten gehört **nicht** ins Repository.
4. PHP-Syntax mit `php -l server/api.php` und die relevanten Regressionstests prüfen.
5. Backend-Änderungen nur über einen bewusst gestarteten, kontrollierten Deploymentprozess ausrollen. Der Workflow `deploy-sftp.yml` ist ein **manueller Fallback**, kein automatischer Produktivdeploy.
6. Berechtigungsgrenzen zwischen verschiedenen Konten testen. Keine Änderungen an Login, Session oder CSRF-Schutz ohne gesondertes Security-Review.

## Neue Installation (nicht für bestehende Produktionsdatenbanken ausführen)

Die SQL-Dateien unter `server/` dokumentieren Basisschema und nachfolgende Migrationen. Eine Neuinstallation benötigt eine zum aktuellen API-Code passende Schema-Version. Die SQL-Dateien dürfen **nicht** ungeprüft erneut auf einer bestehenden Datenbank eingespielt werden.

## Offene Sicherheitsaufgaben

Vor einer breiteren öffentlichen Nutzung Rate-Limiting, Wiederherstellung von Konten, Backup-/Restore-Prozess und Berechtigungsprüfungen erneut bewerten. Diese Hinweise sind keine Bestätigung, dass alle Maßnahmen bereits implementiert wurden.
