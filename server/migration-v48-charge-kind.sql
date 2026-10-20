-- Run ONCE in phpMyAdmin, only if records.charge_kind does not yet exist.
-- Existing entries and vehicles are preserved.
ALTER TABLE `records` ADD COLUMN `charge_kind` VARCHAR(20) NULL DEFAULT NULL AFTER `charge_mode`;
