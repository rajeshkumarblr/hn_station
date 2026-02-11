CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- HN username
    created INT NOT NULL, -- Unix timestamp
    karma INT NOT NULL DEFAULT 0,
    about TEXT,
    submitted INT[], -- Array of item IDs submitted
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
