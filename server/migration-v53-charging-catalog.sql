-- Version 53: separate, benutzergebundene Ladeorte und Anbieter
-- Keine bestehenden Tabellen oder Einträge werden gelöscht.
CREATE TABLE IF NOT EXISTS charging_locations (
 id VARCHAR(80) NOT NULL,
 user_id INT NOT NULL,
 name VARCHAR(100) NOT NULL,
 kind VARCHAR(20) NOT NULL DEFAULT '',
 price DECIMAL(12,5) NULL DEFAULT NULL,
 PRIMARY KEY (id, user_id),
 INDEX idx_charging_locations_user (user_id),
 CONSTRAINT fk_charging_locations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS charging_providers (
 id VARCHAR(80) NOT NULL,
 user_id INT NOT NULL,
 name VARCHAR(100) NOT NULL,
 price DECIMAL(12,5) NULL DEFAULT NULL,
 PRIMARY KEY (id, user_id),
 INDEX idx_charging_providers_user (user_id),
 CONSTRAINT fk_charging_providers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
