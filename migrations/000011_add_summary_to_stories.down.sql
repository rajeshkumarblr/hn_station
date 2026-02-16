-- Remove summary column from stories table
ALTER TABLE stories DROP COLUMN IF EXISTS summary;
