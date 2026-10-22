-- Einmalig auf der bestehenden Datenbank ausführen (Backup vorher erstellen).
-- Tokens werden ausschließlich als SHA-256-Hash gespeichert.
CREATE TABLE password_resets (
 token_hash CHAR(64) PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at DATETIME NOT NULL,
 CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX idx_password_resets_user_created (user_id,created_at),
 INDEX idx_password_resets_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
