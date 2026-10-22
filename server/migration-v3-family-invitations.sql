-- Version 3.0: Einladungen für bereits bestehende Familiengruppen.
-- Nur nach migration-v3-family-foundation.sql und nach Datenbank-Backup ausführen.
-- Einmalige Migration, bestehende Benutzer-/Fahrzeugdaten bleiben unverändert.
CREATE TABLE family_invitations (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 family_id BIGINT UNSIGNED NOT NULL,
 invited_email VARCHAR(254) NOT NULL,
 invited_by BIGINT UNSIGNED NOT NULL,
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 expires_at DATETIME NOT NULL,
 accepted_at DATETIME NULL,
 revoked_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_family_invitation_token (token_hash),
 KEY idx_family_invitation_email (invited_email,expires_at),
 KEY idx_family_invitation_family (family_id,created_at),
 CONSTRAINT fk_family_invitation_family FOREIGN KEY (family_id) REFERENCES family_groups(id) ON DELETE CASCADE,
 CONSTRAINT fk_family_invitation_inviter FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- API-Sicherheitsregeln für folgende Implementierung:
-- 1. Nur owner darf einladen; Zieladresse nicht öffentlich auf Mitgliedschaft prüfen.
-- 2. 32 zufällige Token-Bytes; ausschließlich SHA-256-Hash persistieren.
-- 3. Token zeitlich begrenzen, bei Annahme transaktional sperren und einmalig verbrauchen.
-- 4. Angemeldete Zielperson muss dieselbe verifizierte E-Mail-Adresse besitzen.
-- 5. Keine automatische Mitgliedschaft vor expliziter Annahme.
