# HN Station Database Schema

This document describes the SQLite schema for the HN Station local-first desktop application. The database is located at `%AppData%\HN Station\hn.db` on Windows.

## Tables

### 1. `stories`
The primary table containing all Hacker News stories.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER` (PK) | Hacker News item ID. |
| `title` | `TEXT` | Title of the story. |
| `url` | `TEXT` | Link to the article. |
| `score` | `INTEGER` | HN upvote count. |
| `by` | `TEXT` | HN username of the submitter. |
| `descendants` | `INTEGER` | Number of comments. |
| `posted_at` | `DATETIME` | When it was posted on HN. |
| `created_at` | `DATETIME` | When it was first ingested locally. |
| `hn_rank` | `INTEGER` | Current rank on the front page (NULL if off-page). |
| `summary` | `TEXT` | AI-generated summary of the content (JSON or text). |
| `discussion_summary` | `TEXT` | AI-generated summary of the comments. |
| `topics` | `TEXT` | JSON array of category tags (e.g. `["#AI", "#Rust"]`). |
| `is_read` | `BOOLEAN` | Whether the user has clicked on the story. |
| `is_saved` | `BOOLEAN` | Whether the story is bookmarked. |
| `is_hidden` | `BOOLEAN` | Whether the user has hidden the story. |
| `iframe_blocked` | `BOOLEAN` | Whether the source site blocks iframe embedding. |

### 2. `comments`
Local cache of story comments (used for discussion summarization).

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER` (PK) | HN comment ID. |
| `story_id` | `INTEGER` (FK) | References `stories(id)`. |
| `parent_id` | `INTEGER` | ID of the parent comment. |
| `text` | `TEXT` | HTML content of the comment. |
| `by` | `TEXT` | HN username. |
| `posted_at` | `DATETIME` | When it was posted. |

### 3. `chat_messages`
History of conversations with the local AI about specific stories.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER` (PK) | Auto-incrementing message ID. |
| `user_id` | `TEXT` | Local user ID (usually `local-user`). |
| `story_id` | `INTEGER` (FK) | References `stories(id)`. |
| `role` | `TEXT` | `user` or `model`. |
| `content` | `TEXT` | The message text. |
| `created_at` | `DATETIME` | Message timestamp. |

### 4. `settings`
Key-value store for application configuration.

| Column | Type | Description |
| :--- | :--- | :--- |
| `key` | `TEXT` (PK) | Setting name (e.g., `ollama_model`, `active_topics`). |
| `value` | `TEXT` | Setting value. |

### 5. `hn_users`
Cache of HN user profiles.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `TEXT` (PK) | HN username. |
| `karma` | `INTEGER` | User's karma points. |
| `about` | `TEXT` | Profile bio. |

---

## Important Indexes
- `idx_comments_story_id`: Fast lookup of all comments for a story.
- `idx_chat_messages_story_user`: Fast retrieval of chat history for a specific story context.
