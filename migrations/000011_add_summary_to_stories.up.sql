-- Add summary column to stories table
ALTER TABLE stories ADD COLUMN IF NOT EXISTS summary TEXT;
