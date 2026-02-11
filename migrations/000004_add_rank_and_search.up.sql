-- Add hn_rank column
ALTER TABLE stories ADD COLUMN IF NOT EXISTS hn_rank INT;

-- Add search_vector column
ALTER TABLE stories ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', title)) STORED;

-- Create indices
CREATE INDEX IF NOT EXISTS idx_stories_rank ON stories(hn_rank);
CREATE INDEX IF NOT EXISTS idx_stories_score_desc ON stories(score DESC);
CREATE INDEX IF NOT EXISTS idx_stories_search ON stories USING GIN(search_vector);
