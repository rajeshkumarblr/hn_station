-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column for nomic-embed-text (768 dimensions)
ALTER TABLE stories ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_stories_embedding_hnsw
  ON stories USING hnsw (embedding vector_cosine_ops);
