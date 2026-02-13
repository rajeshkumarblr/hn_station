CREATE TABLE IF NOT EXISTS user_interactions (
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    story_id BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    is_saved BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, story_id)
);

CREATE INDEX idx_user_interactions_saved ON user_interactions(user_id, is_saved) WHERE is_saved = TRUE;
CREATE INDEX idx_user_interactions_read ON user_interactions(user_id, is_read) WHERE is_read = TRUE;
