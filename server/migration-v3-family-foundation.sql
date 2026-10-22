-- Version 3.0: additive Grundlage für Familien-/Fahrzeugfreigaben.
-- Vor Ausführung Datenbank sichern. Bestehende Fahrzeuge, Benutzer und Buchungen bleiben unverändert.
-- Einmalig ausführen; Migration ist nicht idempotent.

CREATE TABLE family_groups (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(120) NOT NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_family_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE family_members (
 family_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 role ENUM('owner','member') NOT NULL DEFAULT 'member',
 joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (family_id,user_id),
 KEY idx_family_members_user (user_id),
 CONSTRAINT fk_family_members_family FOREIGN KEY (family_id) REFERENCES family_groups(id) ON DELETE CASCADE,
 CONSTRAINT fk_family_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE family_vehicle_shares (
 family_id BIGINT UNSIGNED NOT NULL,
 vehicle_id BIGINT UNSIGNED NOT NULL,
 owner_user_id BIGINT UNSIGNED NOT NULL,
 access_level ENUM('view','edit') NOT NULL DEFAULT 'view',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (family_id,vehicle_id),
 KEY idx_family_vehicle_owner (owner_user_id,vehicle_id),
 CONSTRAINT fk_family_vehicle_family FOREIGN KEY (family_id) REFERENCES family_groups(id) ON DELETE CASCADE,
 CONSTRAINT fk_family_vehicle_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sicherheitsregel für kommende API: vehicle_id muss zur owner_user_id gehören.
-- Die Zuordnung muss vor INSERT/UPDATE transaktional gegen vehicles geprüft werden.
-- Diese Migration ändert ausdrücklich KEINE vorhandenen API-Berechtigungen.
