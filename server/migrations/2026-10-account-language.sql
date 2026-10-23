-- PHEV Tracker 3.0 – einmalige Migration NACH verifiziertem Datenbank-Backup.
-- Vorher prüfen: SHOW COLUMNS FROM users LIKE 'language';
-- Nur ausführen, wenn noch keine language-Spalte vorhanden ist.
-- Bestehende Konten bleiben deutsch; keine Datensätze werden gelöscht.
ALTER TABLE users ADD COLUMN language ENUM('de','en') NOT NULL DEFAULT 'de';
-- Kontrolle: SELECT language, COUNT(*) FROM users GROUP BY language;
-- Rollback nur nach Prüfung, ob neue Spracheinstellungen erhalten bleiben müssen:
-- ALTER TABLE users DROP COLUMN language;
