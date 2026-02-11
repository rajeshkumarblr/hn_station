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
