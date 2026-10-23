# Version 3.0 – Familienverwaltung sicher aktivieren

> **Produktivsystem:** Bestehende MySQL-Datenbank verwenden; **keine neue Datenbank anlegen** und keinesfalls `server/schema.sql` auf der Produktivdatenbank ausführen.

## Voraussetzungen (vor der ersten SQL-Anweisung)

1. In Hetzner/phpMyAdmin die **bereits verwendete** PHEV-Tracker-Datenbank identifizieren (Datenbankname nur lokal in `server/config.php` nachsehen, keine Zugangsdaten versenden).
2. Vollständigen SQL-Export erstellen und an einem sicheren Ort speichern. Stichprobenartig kontrollieren, dass `users`, `vehicles` und `records` im Export enthalten sind; Wiederherstellbarkeit prüfen.
3. Bestehende `/api/api.php` und die **private** `/api/config.php` getrennt sichern. `config.php` niemals ins Git-Repository übernehmen.
4. In phpMyAdmin kontrollieren, ob `family_groups`, `family_members`, `family_vehicle_shares` oder `family_invitations` bereits existieren. Bei vorhandenen Tabellen **anhalten**, nicht blind erneut migrieren.
5. Geplantes Wartungsfenster wählen. Vor dem Deploy PHP-Version und SMTP-Einstellungen prüfen; kein Live-Test mit fremden Familienkonten.

## Migration (einmalig, in dieser Reihenfolge)

1. `server/migration-v3-family-foundation.sql` auf der **bestehenden** Datenbank ausführen. Erstellt `family_groups`, `family_members`, `family_vehicle_shares`.
2. `server/migration-v3-family-invitations.sql` ausführen. Erstellt `family_invitations`.
3. Tabellen und Fremdschlüssel in phpMyAdmin prüfen. Beide Skripte enthalten `CREATE TABLE` ohne `IF NOT EXISTS` und sind nicht für erneute Ausführung vorgesehen.
4. Bei Fehlern **nicht** mit unvollständigem Schema weiterarbeiten. Fehler und vorhandene Tabellen prüfen; kein automatischer Rollback von DDL voraussetzen.

## API-Deployment

1. Aktuellen geprüften Stand von `server/api.php` manuell auf Hetzner als `/api/api.php` bereitstellen; vorhandene `/api/config.php` erhalten.
2. Falls SMTP noch nicht eingerichtet ist: `smtp_host`, `smtp_port`, `smtp_username`, `smtp_password` und `reset_mail_from` ausschließlich serverseitig prüfen. Einladungen brauchen funktionierenden SMTP-Versand.
3. Kein produktives `server/schema.sql` ausführen. Frontend-Deploy allein aktualisiert die PHP-API nicht.

## Funktionstest mit eigenen Testkonten

- Familie erstellen und anschließend in der Liste sehen.
- Ein anderes eigenes Testkonto per E-Mail einladen und die Einladung mit exakt diesem angemeldeten Konto annehmen.
- Mitgliederliste: Familienmitglieder sehen Mitglieder; Außenstehende nicht.
- Eigenes Testfahrzeug freigeben: Empfänger sieht nur explizit freigegebenes Fahrzeug; private Fahrzeuge bleiben verborgen.
- Freigabe widerrufen: Fahrzeug verschwindet unmittelbar beim Empfänger.
- Fremdbenutzer darf keine Freigabe ändern; der Gründer erhält beim Kontolöschversuch eine verständliche Sperre.
- In Browser-Konsole und Serverlogs keine unerwarteten Fehler, keine Tokens/Passwörter veröffentlichen.

## Rückfallstrategie und Grenzen

- Bei Problemen **zuerst** die gesicherte vorherige `/api/api.php` wiederherstellen. Bestehende Familien-Tabellen nicht unüberlegt löschen: nach Nutzung können sie Daten enthalten.
- Datenbank-Restore nur kontrolliert und nach Abgleich zwischen Backup-Zeitpunkt und neu entstandenen Nutzerdaten durchführen.
- Automatisierte CI nutzt isolierte MySQL-Testdaten und ist **kein** Nachweis, dass das Produktivschema schon migriert wurde.
- Stand v3.0: Familienfreigaben bieten aktuell Lesesicht; der Wert `edit` ist vorbereitet, aber **kein** Schreibrecht. Beleg-OCR, OEM-Fahrzeugdaten und erweiterte Auswertungen sind separate, noch offene 3.0-Bausteine.
- Einladungen setzen derzeit ein passendes angemeldetes E-Mail-Konto voraus; die E-Mail-Adresse des Kontos wird dabei nicht unabhängig verifiziert. Für breitere Freigabe ist ein gesondertes E-Mail-Verifizierungsverfahren zu planen.
