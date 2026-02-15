ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_user_interactions_hidden ON user_interactions(user_id, is_hidden) WHERE is_hidden = TRUE;
