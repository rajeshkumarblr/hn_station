package storage

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	pgvector "github.com/pgvector/pgvector-go"
)

type PostgresStore struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{db: db}
}

func (s *PostgresStore) Migrate(ctx context.Context) error {
	// Initial schema creation if stories table doesn't exist
	initQuery := `
		CREATE TABLE IF NOT EXISTS stories (
			id BIGINT PRIMARY KEY,
			title TEXT NOT NULL,
			url TEXT,
			score INT DEFAULT 0,
			by TEXT,
			descendants INT DEFAULT 0,
			posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
			hn_rank INT,
			summary TEXT,
			discussion_summary TEXT,
			topics TEXT[] DEFAULT '{}',
			search_vector tsvector,
			iframe_blocked BOOLEAN
		);
		CREATE INDEX IF NOT EXISTS idx_stories_posted_at ON stories(posted_at DESC);
		CREATE INDEX IF NOT EXISTS idx_stories_search_vector ON stories USING gin(search_vector);

		CREATE TABLE IF NOT EXISTS comments (
			id BIGINT PRIMARY KEY,
			story_id BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
			parent_id BIGINT,
			text TEXT NOT NULL,
			by TEXT,
			posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_comments_story_id ON comments(story_id);

		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			created INT,
			karma INT,
			about TEXT,
			submitted INT[],
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS auth_users (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			google_id TEXT UNIQUE NOT NULL,
			email TEXT UNIQUE NOT NULL,
			name TEXT,
			avatar_url TEXT,
			is_admin BOOLEAN DEFAULT FALSE,
			summaries_enabled BOOLEAN DEFAULT TRUE,
			topics TEXT[] DEFAULT '{}',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS user_interactions (
			user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,
			story_id BIGINT REFERENCES stories(id) ON DELETE CASCADE,
			is_read BOOLEAN DEFAULT FALSE,
			is_saved BOOLEAN DEFAULT FALSE,
			is_hidden BOOLEAN DEFAULT FALSE,
			PRIMARY KEY (user_id, story_id)
		);

		CREATE TABLE IF NOT EXISTS chat_messages (
			id SERIAL PRIMARY KEY,
			user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,
			story_id BIGINT REFERENCES stories(id) ON DELETE CASCADE,
			role TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		);
	`
	if _, err := s.db.Exec(ctx, initQuery); err != nil {
		return fmt.Errorf("initial migration failed: %w", err)
	}

	// Hot-fix migrations for existing tables
	hotFixQuery := `
		DO $$
		BEGIN
			IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stories' AND column_name='iframe_blocked') THEN
				ALTER TABLE stories ADD COLUMN iframe_blocked BOOLEAN DEFAULT NULL;
			END IF;
			IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stories' AND column_name='discussion_summary') THEN
				ALTER TABLE stories ADD COLUMN discussion_summary TEXT DEFAULT NULL;
			END IF;
			IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='auth_users' AND column_name='topics') THEN
				ALTER TABLE auth_users ADD COLUMN topics TEXT[] DEFAULT '{}';
			END IF;
			IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='auth_users' AND column_name='summaries_enabled') THEN
				ALTER TABLE auth_users ADD COLUMN summaries_enabled BOOLEAN DEFAULT TRUE;
			END IF;
		END $$;
	`
	_, err := s.db.Exec(ctx, hotFixQuery)
	return err
}

func (s *PostgresStore) UpsertStory(ctx context.Context, story Story) error {
	query := `
		INSERT INTO stories (id, title, url, score, by, descendants, posted_at, hn_rank, embedding, topics, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, '{}'::text[]), NOW())
		ON CONFLICT (id) DO UPDATE
		SET title = EXCLUDED.title,
			url = EXCLUDED.url,
			score = EXCLUDED.score,
			by = EXCLUDED.by,
			descendants = EXCLUDED.descendants,
			posted_at = EXCLUDED.posted_at,
			hn_rank = EXCLUDED.hn_rank,
			topics = COALESCE(EXCLUDED.topics, stories.topics),
			embedding = COALESCE(EXCLUDED.embedding, stories.embedding);
	`
	_, err := s.db.Exec(ctx, query, story.ID, story.Title, story.URL, story.Score, story.By, story.Descendants, story.PostedAt, story.HNRank, story.Embedding, story.Topics)
	return err
}

func (s *PostgresStore) GetStories(ctx context.Context, limit, offset int, sortStrategy string, topics []string, topicMatch, searchQuery, userID string, showHidden bool) ([]Story, int, error) {
	// 1. Build common WHERE clause
	whereClause := " WHERE 1=1"
	var args []interface{}
	argID := 1
	hasUser := userID != ""

	if hasUser {
		args = append(args, userID)
		argID = 2
		if !showHidden {
			whereClause += ` AND (ui.is_hidden IS NULL OR ui.is_hidden = FALSE)`
		}
	}

	if len(topics) > 0 {
		tsqueryParts := make([]string, len(topics))
		for i, t := range topics {
			tsqueryParts[i] = fmt.Sprintf("plainto_tsquery('english', $%d)", argID)
			args = append(args, t)
			argID++
		}
		joiner := " || "
		if topicMatch == "all" {
			joiner = " && "
		}
		whereClause += ` AND s.search_vector @@ (` + strings.Join(tsqueryParts, joiner) + `)`
	}

	if searchQuery != "" {
		whereClause += fmt.Sprintf(` AND s.search_vector @@ plainto_tsquery('english', $%d)`, argID)
		args = append(args, searchQuery)
		argID++
	}

	if sortStrategy == "show" {
		whereClause += ` AND s.title ILIKE 'Show HN:%'`
	}

	// 2. Get Total Count
	countQuery := `SELECT COUNT(*) FROM stories s`
	if hasUser {
		countQuery += ` LEFT JOIN user_interactions ui ON s.id = ui.story_id AND ui.user_id = $1`
	}
	countQuery += whereClause

	var total int
	if err := s.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// 3. Get Stories
	selectCols := `s.id, s.title, COALESCE(s.url, ''), s.score, COALESCE(s.by, ''), s.descendants, s.posted_at, s.created_at, s.hn_rank, s.summary, COALESCE(s.topics, '{}'::text[]), s.iframe_blocked`
	fromClause := `FROM stories s`
	if hasUser {
		selectCols += `, ui.is_read, ui.is_saved, ui.is_hidden`
		fromClause += ` LEFT JOIN user_interactions ui ON s.id = ui.story_id AND ui.user_id = $1`
	}

	orderBy := "s.hn_rank ASC NULLS LAST"
	switch sortStrategy {
	case "votes":
		orderBy = "s.score DESC"
	case "latest":
		orderBy = "s.posted_at DESC"
	case "show":
		orderBy = "s.posted_at DESC"
	}

	query := `SELECT ` + selectCols + ` ` + fromClause + whereClause + ` ORDER BY ` + orderBy
	query += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, argID, argID+1)
	finalArgs := append(args, limit, offset)

	rows, err := s.db.Query(ctx, query, finalArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var stories []Story
	for rows.Next() {
		var story Story
		if hasUser {
			if err := rows.Scan(&story.ID, &story.Title, &story.URL, &story.Score, &story.By, &story.Descendants, &story.PostedAt, &story.CreatedAt, &story.HNRank, &story.Summary, &story.Topics, &story.IframeBlocked, &story.IsRead, &story.IsSaved, &story.IsHidden); err != nil {
				return nil, 0, err
			}
		} else {
			if err := rows.Scan(&story.ID, &story.Title, &story.URL, &story.Score, &story.By, &story.Descendants, &story.PostedAt, &story.CreatedAt, &story.HNRank, &story.Summary, &story.Topics, &story.IframeBlocked); err != nil {
				return nil, 0, err
			}
		}
		stories = append(stories, story)
	}
	return stories, total, nil
}

func (s *PostgresStore) GetStory(ctx context.Context, id int) (*Story, error) {
	query := `SELECT id, title, COALESCE(url, ''), score, COALESCE(by, ''), descendants, posted_at, created_at, hn_rank, summary, discussion_summary, COALESCE(topics, '{}'::text[]), iframe_blocked FROM stories WHERE id = $1`
	var story Story
	err := s.db.QueryRow(ctx, query, id).Scan(&story.ID, &story.Title, &story.URL, &story.Score, &story.By, &story.Descendants, &story.PostedAt, &story.CreatedAt, &story.HNRank, &story.Summary, &story.DiscussionSummary, &story.Topics, &story.IframeBlocked)
	if err != nil {
		return nil, err
	}
	return &story, nil
}

// GetStoriesStatus returns a map of IDs to their summary status for a list of story IDs.
func (s *PostgresStore) GetStoriesStatus(ctx context.Context, ids []int) (map[int]bool, error) {
	if len(ids) == 0 {
		return make(map[int]bool), nil
	}

	query := `SELECT id, (summary IS NOT NULL AND summary != '') FROM stories WHERE id = ANY($1)`
	rows, err := s.db.Query(ctx, query, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	status := make(map[int]bool)
	for rows.Next() {
		var id int
		var hasSummary bool
		if err := rows.Scan(&id, &hasSummary); err != nil {
			return nil, err
		}
		status[id] = hasSummary
	}
	return status, nil
}

func (s *PostgresStore) GetComments(ctx context.Context, storyID int) ([]Comment, error) {
	query := `SELECT id, story_id, parent_id, text, by, posted_at FROM comments WHERE story_id = $1 ORDER BY posted_at ASC`
	rows, err := s.db.Query(ctx, query, storyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []Comment
	for rows.Next() {
		var c Comment
		if err := rows.Scan(&c.ID, &c.StoryID, &c.ParentID, &c.Text, &c.By, &c.PostedAt); err != nil {
			return nil, err
		}
		comments = append(comments, c)
	}
	return comments, nil
}

// Comment and User types moved to db.go

func (s *PostgresStore) UpsertComment(ctx context.Context, comment Comment) error {
	query := `
		INSERT INTO comments (id, story_id, parent_id, text, by, posted_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (id) DO UPDATE
		SET text = EXCLUDED.text,
			posted_at = EXCLUDED.posted_at;
	`
	_, err := s.db.Exec(ctx, query, comment.ID, comment.StoryID, comment.ParentID, comment.Text, comment.By, comment.PostedAt)
	return err
}

func (s *PostgresStore) UpsertUser(ctx context.Context, user User) error {
	query := `
		INSERT INTO users (id, created, karma, about, submitted, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (id) DO UPDATE
		SET karma = EXCLUDED.karma,
			about = EXCLUDED.about,
			submitted = EXCLUDED.submitted,
			updated_at = NOW();
	`
	_, err := s.db.Exec(ctx, query, user.ID, user.Created, user.Karma, user.About, user.Submitted)
	return err
}

func (s *PostgresStore) ClearRanksNotIn(ctx context.Context, ids []int) error {
	if len(ids) == 0 {
		return nil
	}
	query := `UPDATE stories SET hn_rank = NULL WHERE hn_rank IS NOT NULL AND id != ALL($1)`
	_, err := s.db.Exec(ctx, query, ids)
	return err
}

func (s *PostgresStore) UpdateRanks(ctx context.Context, rankMap map[int]int) error {
	batch := &pgx.Batch{}
	for id, rank := range rankMap {
		// Only update existing stories. If a story doesn't exist, it will be inserted with the correct rank by the worker.
		batch.Queue("UPDATE stories SET hn_rank = $1 WHERE id = $2", rank, id)
	}

	br := s.db.SendBatch(ctx, batch)
	defer br.Close()

	for range rankMap {
		_, err := br.Exec()
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *PostgresStore) UpdateStorySummary(ctx context.Context, id int, summary string) error {
	query := `UPDATE stories SET summary = $1 WHERE id = $2`
	_, err := s.db.Exec(ctx, query, summary, id)
	return err
}

func (s *PostgresStore) UpdateStoryDiscussionSummary(ctx context.Context, id int, summary string) error {
	query := `UPDATE stories SET discussion_summary = $1 WHERE id = $2`
	_, err := s.db.Exec(ctx, query, summary, id)
	return err
}

func (s *PostgresStore) UpdateStorySummaryAndTopics(ctx context.Context, id int, summary string, topics []string) error {
	query := `UPDATE stories SET summary = $1, topics = $2 WHERE id = $3`
	_, err := s.db.Exec(ctx, query, summary, topics, id)
	return err
}


func (s *PostgresStore) UpdateStoryIframeStatus(ctx context.Context, id int, blocked bool) error {
	query := `UPDATE stories SET iframe_blocked = $1 WHERE id = $2`
	_, err := s.db.Exec(ctx, query, blocked, id)
	return err
}

func (s *PostgresStore) ResetAllSummaries(ctx context.Context) error {
	_, err := s.db.Exec(ctx, "UPDATE stories SET summary = NULL, topics = '{}'")
	return err
}

// UpsertAuthUser creates or updates a user based on their Google ID.
// Returns the user (with ID) after upsert.
func (s *PostgresStore) UpsertAuthUser(ctx context.Context, googleID, email, name, avatarURL string) (*AuthUser, error) {
	query := `
		INSERT INTO auth_users (google_id, email, name, avatar_url)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (google_id) DO UPDATE
		SET email = EXCLUDED.email,
			name = EXCLUDED.name,
			avatar_url = EXCLUDED.avatar_url
		RETURNING id, google_id, email, name, avatar_url, is_admin, COALESCE(topics, '{}'::text[]), created_at
	`
	var user AuthUser
	err := s.db.QueryRow(ctx, query, googleID, email, name, avatarURL).Scan(
		&user.ID, &user.GoogleID, &user.Email, &user.Name, &user.AvatarURL, &user.IsAdmin, &user.Topics, &user.CreatedAt,
	)
	user.SummariesEnabled = true // Default for cloud upsert if not in returning
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// GetAuthUser fetches a user by their UUID.
func (s *PostgresStore) GetAuthUser(ctx context.Context, userID string) (*AuthUser, error) {
	query := `SELECT id, google_id, email, name, avatar_url, is_admin, summaries_enabled, COALESCE(topics, '{}'::text[]), created_at FROM auth_users WHERE id = $1`
	var user AuthUser
	err := s.db.QueryRow(ctx, query, userID).Scan(
		&user.ID, &user.GoogleID, &user.Email, &user.Name, &user.AvatarURL, &user.IsAdmin, &user.SummariesEnabled, &user.Topics, &user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *PostgresStore) UpdateUserTopics(ctx context.Context, userID string, topics []string) error {
	_, err := s.db.Exec(ctx, "UPDATE auth_users SET topics = $1 WHERE id = $2", topics, userID)
	return err
}

func (s *PostgresStore) GetActiveTopics(_ context.Context) ([]string, error) {
	return nil, nil // Not used in cloud mode currently (topics are per-user)
}


func (s *PostgresStore) UpsertInteraction(ctx context.Context, userID string, storyID int, isRead *bool, isSaved *bool, isHidden *bool) error {
	// Skip if not a valid UUID (e.g. "local-user" during guest mode on desktop)
	if len(userID) < 32 {
		return nil
	}
	query := `
		INSERT INTO user_interactions (user_id, story_id, is_read, is_saved, is_hidden, updated_at)
		VALUES ($1, $2, COALESCE($3, FALSE), COALESCE($4, FALSE), COALESCE($5, FALSE), NOW())
		ON CONFLICT (user_id, story_id) DO UPDATE SET
			is_read = COALESCE($3, user_interactions.is_read),
			is_saved = COALESCE($4, user_interactions.is_saved),
			is_hidden = COALESCE($5, user_interactions.is_hidden),
			updated_at = NOW()
	`
	_, err := s.db.Exec(ctx, query, userID, storyID, isRead, isSaved, isHidden)
	return err
}

// GetSavedStories returns stories saved by a user, newest first.
func (s *PostgresStore) GetSavedStories(ctx context.Context, userID string, limit, offset int) ([]Story, int, error) {
	countQuery := `SELECT COUNT(*) FROM user_interactions WHERE user_id = $1 AND is_saved = TRUE`
	var total int
	if err := s.db.QueryRow(ctx, countQuery, userID).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := `
		SELECT s.id, s.title, s.url, s.score, s.by, s.descendants, s.posted_at, s.created_at, s.hn_rank, s.summary, s.discussion_summary, s.topics, s.iframe_blocked, ui.is_read, ui.is_saved
		FROM stories s
		INNER JOIN user_interactions ui ON s.id = ui.story_id AND ui.user_id = $1
		WHERE ui.is_saved = TRUE
		ORDER BY ui.updated_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := s.db.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var stories []Story
	for rows.Next() {
		var story Story
		if err := rows.Scan(&story.ID, &story.Title, &story.URL, &story.Score, &story.By, &story.Descendants, &story.PostedAt, &story.CreatedAt, &story.HNRank, &story.Summary, &story.DiscussionSummary, &story.Topics, &story.IframeBlocked, &story.IsRead, &story.IsSaved); err != nil {
			return nil, 0, err
		}
		stories = append(stories, story)
	}
	return stories, total, nil
}

// SearchStories performs a semantic similarity search using a query embedding vector.
func (s *PostgresStore) SearchStories(ctx context.Context, embedding pgvector.Vector, limit int) ([]Story, error) {
	query := `
		SELECT id, title, url, score, by, descendants, posted_at, created_at, hn_rank,
		       1 - (embedding <=> $1) as similarity
		FROM stories
		WHERE embedding IS NOT NULL AND 1 - (embedding <=> $1) > 0.5
		ORDER BY similarity DESC
		LIMIT $2
	`
	rows, err := s.db.Query(ctx, query, embedding, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stories []Story
	for rows.Next() {
		var story Story
		var similarity float64
		if err := rows.Scan(&story.ID, &story.Title, &story.URL, &story.Score, &story.By, &story.Descendants, &story.PostedAt, &story.CreatedAt, &story.HNRank, &similarity); err != nil {
			return nil, err
		}
		story.Similarity = &similarity
		stories = append(stories, story)
	}
	return stories, nil
}

// ChatMessage type moved to db.go

func (s *PostgresStore) SaveChatMessage(ctx context.Context, userID string, storyID int, role, content string) error {
	query := `INSERT INTO chat_messages (user_id, story_id, role, content) VALUES ($1::uuid, $2, $3, $4)`
	_, err := s.db.Exec(ctx, query, userID, storyID, role, content)
	return err
}

func (s *PostgresStore) GetChatHistory(ctx context.Context, userID string, storyID int) ([]ChatMessage, error) {
	query := `SELECT id, user_id, story_id, role, content, created_at FROM chat_messages WHERE user_id = $1::uuid AND story_id = $2 ORDER BY created_at ASC`
	rows, err := s.db.Query(ctx, query, userID, storyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []ChatMessage
	for rows.Next() {
		var m ChatMessage
		if err := rows.Scan(&m.ID, &m.UserID, &m.StoryID, &m.Role, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, nil
}

func (s *PostgresStore) GetAppStats(ctx context.Context) (*AppStats, error) {
	stats := &AppStats{}

	// Total Users
	err := s.db.QueryRow(ctx, "SELECT COUNT(*) FROM auth_users").Scan(&stats.TotalUsers)
	if err != nil {
		return nil, fmt.Errorf("failed to count users: %w", err)
	}

	// Total Interactions (only read ones as proxy for views)
	err = s.db.QueryRow(ctx, "SELECT COUNT(*) FROM user_interactions WHERE is_read = TRUE").Scan(&stats.TotalInteractions)
	if err != nil {
		return nil, fmt.Errorf("failed to count interactions: %w", err)
	}

	// Total Stories
	err = s.db.QueryRow(ctx, "SELECT COUNT(*) FROM stories").Scan(&stats.TotalStories)
	if err != nil {
		return nil, fmt.Errorf("failed to count stories: %w", err)
	}

	// Total Comments
	err = s.db.QueryRow(ctx, "SELECT COUNT(*) FROM comments").Scan(&stats.TotalComments)
	if err != nil {
		return nil, fmt.Errorf("failed to count comments: %w", err)
	}

	return stats, nil
}

func (s *PostgresStore) GetAllUsers(ctx context.Context) ([]*AuthUser, error) {
	query := `
		SELECT 
			u.id, u.google_id, u.email, u.name, u.avatar_url, u.is_admin, u.summaries_enabled, u.created_at,
			COUNT(ui.story_id) FILTER (WHERE ui.is_read = TRUE) as total_views,
			MAX(ui.updated_at) as last_seen
		FROM auth_users u
		LEFT JOIN user_interactions ui ON u.id = ui.user_id
		GROUP BY u.id, u.google_id, u.email, u.name, u.avatar_url, u.is_admin, u.summaries_enabled, u.created_at
		ORDER BY u.created_at DESC
	`
	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*AuthUser
	for rows.Next() {
		var user AuthUser
		if err := rows.Scan(
			&user.ID, &user.GoogleID, &user.Email, &user.Name, &user.AvatarURL, &user.IsAdmin, &user.SummariesEnabled, &user.CreatedAt,
			&user.TotalViews, &user.LastSeen,
		); err != nil {
			return nil, err
		}
		users = append(users, &user)
	}
	return users, nil
}


// PruneStories removes stories that are older than daysToKeep and are not bookmarked.
func (s *PostgresStore) PruneStories(ctx context.Context, daysToKeep int) error {
	query := `
		DELETE FROM stories 
		WHERE created_at < NOW() - make_interval(days => $1)
		AND id NOT IN (
			SELECT story_id FROM user_interactions WHERE is_saved = TRUE
		)
	`
	_, err := s.db.Exec(ctx, query, daysToKeep)
	if err != nil {
		return fmt.Errorf("failed to prune stories: %w", err)
	}
	return nil
}

func (s *PostgresStore) GetSetting(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRow(ctx, "SELECT value FROM settings WHERE key = $1", key).Scan(&value)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	return value, err
}

func (s *PostgresStore) SetSetting(ctx context.Context, key, value string) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO settings (key, value) VALUES ($1, $2)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
	`, key, value)
	return err
}
func (s *PostgresStore) ClearPoisonedSummaries(ctx context.Context) error {
	query := "UPDATE stories SET summary = NULL WHERE summary LIKE '%quota%' OR summary LIKE 'AI Error: %'"
	_, err := s.db.Exec(ctx, query)
	return err
}
