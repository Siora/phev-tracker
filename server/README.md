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

## Version 3.0: Passwort-Wiederherstellung (Deployment erforderlich)

1. Datenbank und Backend-Dateien sichern.
2. Migration `server/migration-v3-password-resets.sql` **einmalig** ausführen.
3. Im produktiven `server/config.php` den Schlüssel `reset_mail_from` auf eine gültige Absenderadresse setzen. Einen funktionierenden, sicher konfigurierten Mailtransport des PHP-Servers sicherstellen (PHP `mail()`); ohne diesen funktioniert der Reset nicht.
4. `server/api.php` kontrolliert auf den Hetzner-Server deployen. Die Frontend-Bereitstellung allein aktualisiert die API **nicht**.
5. Mit einem Testkonto prüfen: unbekannte E-Mail gibt dieselbe Erfolgsmeldung, Link läuft nach 30 Minuten ab, Token ist nur einmal nutzbar, alte Sitzungen werden widerrufen, erneute Anforderung innerhalb von 10 Minuten sendet keinen weiteren Link.

**Sicherheit:** Reset-Token werden nur gehasht gespeichert. Der Link transportiert den Token als URL-Fragment, das der Browser sofort aus der Adresszeile entfernt. Für eine öffentliche Freigabe zusätzlich IP-basiertes Rate-Limiting am Webserver/API-Gateway aktivieren und E-Mail-Zustellbarkeit überwachen.

## Version 3.0: Hetzner SMTP-Versand

Konfigurationsvorlage: `reset_mail_from=noreply@web-produktion.com`, `smtp_host=mail.web-produktion.com`, `smtp_username=noreply@web-produktion.com`, `smtp_port=587` mit **STARTTLS**. Port und TLS-Unterstützung beim Provider verifizieren. Das echte `smtp_password` nur in der nicht versionierten produktiven `server/config.php` eintragen (Dateirechte einschränken). Der API-Server versendet Passwort-Reset-Mails über authentifiziertes SMTP, nicht mehr über PHP `mail()`. Vor Aktivierung mit einem Testkonto und gültigem Zertifikat testen; Migration `server/migration-v3-password-resets.sql` nicht vergessen.
