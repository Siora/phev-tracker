-- PHEV Tracker: eigenständige Fahrzeugausgaben (Vorbereitung).
-- WICHTIG: Erst nach einem Datenbank-Backup manuell in phpMyAdmin ausführen.
-- Diese Migration übernimmt KEINE vorhandenen JSON-Ausgaben automatisch.
-- Bestehende user_settings.prefs_json / vehicle_expenses NICHT löschen.
--
-- Jede Ausgabe gehört zu einem Benutzer und einem Fahrzeug.
-- Ein zusammengesetzter Fremdschlüssel verhindert, dass Ausgaben versehentlich
-- einem Fahrzeug eines anderen Benutzerkontos zugeordnet werden.
-- Vor Ausführung prüfen: vehicles besitzt PRIMARY/UNIQUE KEY (user_id,id).
-- Falls nicht vorhanden, muss dieser Schlüssel vorab angelegt werden.
CREATE TABLE IF NOT EXISTS vehicle_expenses (
  user_id BIGINT UNSIGNED NOT NULL,
  id VARCHAR(64) NOT NULL,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(64) NOT NULL,
  expense_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency ENUM('CHF','EUR') NOT NULL,
  note VARCHAR(160) NOT NULL DEFAULT '',
  mileage_km DECIMAL(12,1) NULL,
  next_service_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,id),
  KEY idx_vehicle_expenses_vehicle_date (user_id,vehicle_id,expense_date),
  CONSTRAINT fk_vehicle_expenses_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_vehicle_expenses_vehicle
    FOREIGN KEY (user_id,vehicle_id) REFERENCES vehicles(user_id,id) ON DELETE CASCADE,
  CONSTRAINT chk_vehicle_expenses_amount CHECK (amount > 0),
  CONSTRAINT chk_vehicle_expenses_mileage CHECK (mileage_km IS NULL OR mileage_km >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
