-- Einmalig nach einem Datenbank-Backup in phpMyAdmin ausführen.
-- Bestehende Einträge bleiben erhalten und haben zunächst keine Fahrzeugzuordnung.
CREATE TABLE IF NOT EXISTS vehicles (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 brand VARCHAR(100) NOT NULL,
 model VARCHAR(100) NOT NULL,
 model_year SMALLINT UNSIGNED NULL,
 plate VARCHAR(40) NOT NULL DEFAULT '',
 drivetrain VARCHAR(60) NOT NULL DEFAULT '',
 battery_kwh DECIMAL(8,2) NULL,
 tank_liters DECIMAL(8,2) NULL,
 notes TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 UNIQUE KEY vehicle_owner (user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE records ADD COLUMN vehicle_id BIGINT UNSIGNED NULL DEFAULT NULL;
ALTER TABLE records ADD INDEX idx_records_vehicle (user_id,vehicle_id);
ALTER TABLE records ADD CONSTRAINT fk_records_vehicle_owner
 FOREIGN KEY (user_id,vehicle_id) REFERENCES vehicles(user_id,id)
 ON DELETE RESTRICT;
