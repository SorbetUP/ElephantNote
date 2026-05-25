-- Add note sharing fields for local mode.
-- Keep schema compatible with SQLite ALTER TABLE limitations (add columns only).

ALTER TABLE notes ADD COLUMN share_password TEXT NOT NULL DEFAULT '';
ALTER TABLE notes ADD COLUMN share_encrypted_url TEXT;
ALTER TABLE notes ADD COLUMN share_expiry_date TEXT;
ALTER TABLE notes ADD COLUMN share_max_view INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN share_view_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_notes_share_encrypted_url ON notes(share_encrypted_url);

