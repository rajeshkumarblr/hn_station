CREATE TABLE IF NOT EXISTS comments (
    id BIGINT PRIMARY KEY,
    story_id BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    parent_id BIGINT REFERENCES comments(id), -- Nullable, top-level comments have null parent (or point to story? HN API uses parent ID which can be story)
    text TEXT,
    by TEXT,
    posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fetching comments by story
CREATE INDEX IF NOT EXISTS idx_comments_story_id ON comments(story_id);
-- Index for fetching child comments
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
