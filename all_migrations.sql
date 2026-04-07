CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS stories (
    id BIGINT PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT,
    score INT DEFAULT 0,
    by TEXT,
    descendants INT DEFAULT 0,
    posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_posted_at ON stories(posted_at DESC);

CREATE TABLE IF NOT EXISTS stories (
    id BIGINT PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT,
    score INT DEFAULT 0,
    by TEXT,
    descendants INT DEFAULT 0,
    posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_posted_at ON stories(posted_at DESC);

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

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- HN username
    created INT NOT NULL, -- Unix timestamp
    karma INT NOT NULL DEFAULT 0,
    about TEXT,
    submitted INT[], -- Array of item IDs submitted
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add hn_rank column
ALTER TABLE stories ADD COLUMN IF NOT EXISTS hn_rank INT;

-- Add search_vector column
ALTER TABLE stories ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', title)) STORED;
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, story_id)
);

CREATE INDEX idx_user_interactions_saved ON user_interactions(user_id, is_saved) WHERE is_saved = TRUE;
CREATE INDEX idx_user_interactions_read ON user_interactions(user_id, is_read) WHERE is_read = TRUE;

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column for nomic-embed-text (768 dimensions)
ALTER TABLE stories ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_stories_embedding_hnsw
  ON stories USING hnsw (embedding vector_cosine_ops);

ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_user_interactions_hidden ON user_interactions(user_id, is_hidden) WHERE is_hidden = TRUE;

ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'model')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_messages_user_story ON chat_messages(user_id, story_id, created_at);

-- Add summary column to stories table
ALTER TABLE stories ADD COLUMN IF NOT EXISTS summary TEXT;

ALTER TABLE stories ADD COLUMN topics text[] DEFAULT '{}';

