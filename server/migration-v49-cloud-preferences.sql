-- Add optional cloud preferences to existing user settings.
-- Run once only; preserves all existing rows.
ALTER TABLE user_settings ADD COLUMN prefs_json TEXT NULL DEFAULT NULL;
