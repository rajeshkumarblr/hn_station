package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/rajeshkumarblr/hn_station/internal/tags"
	_ "modernc.org/sqlite"
)

// SQLiteStore implements DB using a local SQLite file.
// Topics are stored as a JSON text column (no PostgreSQL arrays/tsquery).
// Authentication, interactions, and embeddings are not supported — they are no-ops.
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLite opens (or creates) the SQLite database file and auto-migrates the schema.
func NewSQLite(path string) (*SQLiteStore, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1) // SQLite serialises writes

	s := &SQLiteStore{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return s, nil
}

func (s *SQLiteStore) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS stories (
		id          INTEGER PRIMARY KEY,
		title       TEXT    NOT NULL,
		url         TEXT    NOT NULL DEFAULT '',
		score       INTEGER NOT NULL DEFAULT 0,
		by          TEXT    NOT NULL DEFAULT '',
		descendants INTEGER NOT NULL DEFAULT 0,
		posted_at   DATETIME NOT NULL,
		created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
		hn_rank     INTEGER,
		summary     TEXT,
		discussion_summary TEXT,
		topics      TEXT    NOT NULL DEFAULT '[]', -- JSON array of strings
		is_read     BOOLEAN NOT NULL DEFAULT 0,
		is_saved    BOOLEAN NOT NULL DEFAULT 0,
		is_hidden   BOOLEAN NOT NULL DEFAULT 0,
		iframe_blocked BOOLEAN NOT NULL DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS comments (
		id          INTEGER PRIMARY KEY,
		story_id    INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
		parent_id   INTEGER,
		text        TEXT    NOT NULL DEFAULT '',
		by          TEXT    NOT NULL DEFAULT '',
		posted_at   DATETIME NOT NULL,
		created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
	);
	CREATE INDEX IF NOT EXISTS idx_comments_story_id ON comments(story_id);

	CREATE TABLE IF NOT EXISTS hn_users (
		id         TEXT PRIMARY KEY,
		created    INTEGER,
		karma      INTEGER,
		about      TEXT,
		updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
	);

	CREATE TABLE IF NOT EXISTS settings (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS auth_users (
		id         TEXT PRIMARY KEY,
		email      TEXT NOT NULL,
		name       TEXT NOT NULL,
		avatar_url TEXT NOT NULL,
		is_admin   BOOLEAN NOT NULL DEFAULT 0,
		summaries_enabled BOOLEAN NOT NULL DEFAULT 1,
		topics     TEXT NOT NULL DEFAULT '[]',
		created_at DATETIME NOT NULL DEFAULT (datetime('now'))
	);

	CREATE TABLE IF NOT EXISTS chat_messages (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id     TEXT NOT NULL,
		story_id    INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
		role        TEXT NOT NULL,
		content     TEXT NOT NULL,
		created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
	);
	CREATE INDEX IF NOT EXISTS idx_chat_messages_story_user ON chat_messages(story_id, user_id);
	`
	_, err := s.db.Exec(schema)
	if err != nil {
		return err
	}

	// Add interaction columns if they don't exist
	cols := []string{
		"ALTER TABLE stories ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT 0",
		"ALTER TABLE stories ADD COLUMN is_saved BOOLEAN NOT NULL DEFAULT 0",
		"ALTER TABLE stories ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT 0",
		"ALTER TABLE stories ADD COLUMN iframe_blocked BOOLEAN NOT NULL DEFAULT 0",
		"ALTER TABLE stories ADD COLUMN discussion_summary TEXT",
		"ALTER TABLE auth_users ADD COLUMN summaries_enabled BOOLEAN NOT NULL DEFAULT 1",
		"ALTER TABLE auth_users ADD COLUMN topics TEXT NOT NULL DEFAULT '[]'",
	}
	for _, sql := range cols {
		_, _ = s.db.Exec(sql)
	}

	ftsSchema := `
	CREATE VIRTUAL TABLE IF NOT EXISTS stories_fts USING fts5(title, summary, topics, content='stories', content_rowid='id', tokenize='porter unicode61');

	CREATE TRIGGER IF NOT EXISTS stories_ai AFTER INSERT ON stories BEGIN
		INSERT INTO stories_fts(rowid, title, summary, topics) VALUES (new.id, new.title, new.summary, new.topics);
	END;
	CREATE TRIGGER IF NOT EXISTS stories_ad AFTER DELETE ON stories BEGIN
		INSERT INTO stories_fts(stories_fts, rowid, title, summary, topics) VALUES('delete', old.id, old.title, old.summary, old.topics);
	END;
	CREATE TRIGGER IF NOT EXISTS stories_au AFTER UPDATE ON stories BEGIN
		INSERT INTO stories_fts(stories_fts, rowid, title, summary, topics) VALUES('delete', old.id, old.title, old.summary, old.topics);
		INSERT INTO stories_fts(rowid, title, summary, topics) VALUES (new.id, new.title, new.summary, new.topics);
	END;
	`
	if _, err := s.db.Exec(ftsSchema); err != nil {
		return err
	}

	// Step 4: Force FTS rebuild if transitioning to Porter stemmer
	configDir, _ := os.UserConfigDir()
	porterMarker := filepath.Join(configDir, "HN Station", ".migrated_fts_porter_v2")
	if _, err := os.Stat(porterMarker); os.IsNotExist(err) {
		log.Printf("SQLiteStore: Rebuilding FTS index with Porter stemmer...")
		s.db.Exec("DROP TABLE IF EXISTS stories_fts")
		s.db.Exec(ftsSchema)
		s.db.Exec("INSERT INTO stories_fts(stories_fts) VALUES('rebuild')")
		os.WriteFile(porterMarker, []byte("ok"), 0644)
	}

	// Initialize FTS if empty
	var ftsCount int
	s.db.QueryRow("SELECT COUNT(*) FROM stories_fts").Scan(&ftsCount)
	if ftsCount == 0 {
		s.db.Exec("INSERT INTO stories_fts(stories_fts) VALUES('rebuild')")
	}

	return nil
}

func (s *SQLiteStore) GetSetting(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx, "SELECT value FROM settings WHERE key = ?", key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

func (s *SQLiteStore) SetSetting(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO settings (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`, key, value)
	return err
}

// ─── helpers ───

func topicsToJSON(topics []string) string {
	if len(topics) == 0 {
		return "[]"
	}
	b, _ := json.Marshal(topics)
	return string(b)
}

func jsonToTopics(s string) []string {
	if s == "" || s == "[]" || s == "null" {
		return nil
	}
	var topics []string
	_ = json.Unmarshal([]byte(s), &topics)
	return topics
}

func scanStory(row interface{ Scan(...any) error }) (Story, error) {
	var story Story
	var topicsJSON string
	var hnRank sql.NullInt64
	var summary, discussSummary sql.NullString
	var postedAt, createdAt string

	if err := row.Scan(
		&story.ID, &story.Title, &story.URL, &story.Score,
		&story.By, &story.Descendants, &postedAt, &createdAt,
		&hnRank, &summary, &discussSummary, &topicsJSON,
		&story.IsRead, &story.IsSaved, &story.IsHidden, &story.IframeBlocked,
	); err != nil {
		return story, err
	}

	if hnRank.Valid {
		r := int(hnRank.Int64)
		story.HNRank = &r
	}
	if summary.Valid && summary.String != "" {
		story.Summary = &summary.String
	}
	if discussSummary.Valid && discussSummary.String != "" {
		story.DiscussionSummary = &discussSummary.String
	}
	story.Topics = jsonToTopics(topicsJSON)

	// Parse time strings (SQLite stores as text)
	if t, err := time.Parse("2006-01-02T15:04:05Z", postedAt); err == nil {
		story.PostedAt = t
	} else if t, err := time.Parse("2006-01-02 15:04:05", postedAt); err == nil {
		story.PostedAt = t
	}
	if t, err := time.Parse("2006-01-02T15:04:05Z", createdAt); err == nil {
		story.CreatedAt = t
	} else if t, err := time.Parse("2006-01-02 15:04:05", createdAt); err == nil {
		story.CreatedAt = t
	}

	return story, nil
}

// ─── Story methods ───

func (s *SQLiteStore) UpsertStory(ctx context.Context, story Story) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO stories (id, title, url, score, by, descendants, posted_at, hn_rank, topics, is_read, is_saved, is_hidden)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title, url = excluded.url, score = excluded.score,
			descendants = excluded.descendants, hn_rank = excluded.hn_rank,
			topics = CASE WHEN excluded.topics = '[]' OR excluded.topics IS NULL THEN topics ELSE excluded.topics END
			-- DO NOT update is_read, is_saved, is_hidden on conflict
	`,
		story.ID, story.Title, story.URL, story.Score,
		story.By, story.Descendants,
		story.PostedAt.UTC().Format("2006-01-02T15:04:05Z"),
		story.HNRank,
		topicsToJSON(story.Topics),
	)
	return err
}

func (s *SQLiteStore) GetStory(ctx context.Context, id int) (*Story, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, title, url, score, by, descendants, posted_at, created_at, hn_rank, summary, discussion_summary, topics, is_read, is_saved, is_hidden, iframe_blocked
		 FROM stories WHERE id = ?`, id)
	story, err := scanStory(row)
	if err != nil {
		return nil, err
	}
	return &story, nil
}

func (s *SQLiteStore) GetStories(ctx context.Context, limit, offset int, sortStrategy string, topics []string, topicMatch, searchQuery, userID string, showHidden bool) ([]Story, int, error) {
	// Build WHERE for topic filtering and FTS
	whereClause := "WHERE 1=1"
	var args []interface{}

	if sortStrategy == "show" {
		whereClause += " AND title LIKE 'Show HN:%'"
	}
	if !showHidden {
		whereClause += " AND is_hidden = 0"
	}

	if searchQuery != "" {
		// Step 3: Query Expansion for FTS5
		tagMgr := tags.GetManager()
		expanded := tagMgr.ExpandTag(searchQuery)
		if len(expanded) > 1 {
			var matchParts []string
			for _, v := range expanded {
				// Escape double quotes and always wrap in quotes to prevent
				// special characters (hyphens, dots) from being interpreted as FTS5 operators
				v = strings.ReplaceAll(v, "\"", "\"\"")
				matchParts = append(matchParts, fmt.Sprintf("\"%s\"", v))
			}
			searchQuery = strings.Join(matchParts, " OR ")
		}

		// SQLite FTS5 syntax supports prefix matching and more
		log.Printf("[FTS5 Search] Query: %q", searchQuery)
		whereClause += " AND id IN (SELECT rowid FROM stories_fts WHERE stories_fts MATCH ?)"
		args = append(args, searchQuery)
	}

	if len(topics) > 0 {
		tagMgr := tags.GetManager()
		var topicConditions []string
		for _, t := range topics {
			// Step 3: Expand tag filtering to include synonyms
			expanded := tagMgr.ExpandTag(t)
			var variants []string
			for _, v := range expanded {
				vEscaped := strings.ReplaceAll(strings.ToLower(v), "'", "''")
				// Check both formal tags and FTS for each variant
				variants = append(variants, fmt.Sprintf("(EXISTS (SELECT 1 FROM json_each(topics) WHERE LOWER(value) = '%[1]s') OR id IN (SELECT rowid FROM stories_fts WHERE stories_fts MATCH '\"%[1]s\"'))", vEscaped))
			}
			topicConditions = append(topicConditions, "("+strings.Join(variants, " OR ")+")")
		}
		
		joiner := " OR "
		if topicMatch == "all" || topicMatch == "both" {
			joiner = " AND "
		}
		whereClause += " AND (" + strings.Join(topicConditions, joiner) + ")"
	}

	// Build ORDER BY
	orderBy := "hn_rank ASC NULLS LAST"
	switch sortStrategy {
	case "votes":
		orderBy = "score DESC"
	case "latest", "new":
		orderBy = "posted_at DESC"
	case "show":
		orderBy = "posted_at DESC"
	}

	// Get total count
	countQ := "SELECT COUNT(*) FROM stories " + whereClause
	log.Printf("SQLiteStore: Query: %s, Args: %v", countQ, args)
	var total int
	if err := s.db.QueryRowContext(ctx, countQ, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Get stories
	query := `SELECT id, title, url, score, by, descendants, posted_at, created_at, hn_rank, summary, discussion_summary, topics, is_read, is_saved, is_hidden, iframe_blocked
			  FROM stories ` + whereClause + ` ORDER BY ` + orderBy + ` LIMIT ? OFFSET ?`
	finalArgs := append(args, limit, offset)

	rows, err := s.db.QueryContext(ctx, query, finalArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var stories []Story
	for rows.Next() {
		story, err := scanStory(rows)
		if err != nil {
			return nil, 0, err
		}
		stories = append(stories, story)
	}
	return stories, total, nil
}

func (s *SQLiteStore) GetStoriesStatus(ctx context.Context, ids []int) (map[int]bool, error) {
	if len(ids) == 0 {
		return make(map[int]bool), nil
	}
	placeholders := strings.Repeat("?,", len(ids))
	placeholders = placeholders[:len(placeholders)-1]
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, (summary IS NOT NULL AND summary != '') FROM stories WHERE id IN (`+placeholders+`)`, args...)
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

func (s *SQLiteStore) UpdateStorySummary(ctx context.Context, id int, summary string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stories SET summary = ? WHERE id = ?`, summary, id)
	return err
}

func (s *SQLiteStore) UpdateStoryDiscussionSummary(ctx context.Context, id int, summary string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stories SET discussion_summary = ? WHERE id = ?`, summary, id)
	return err
}

func (s *SQLiteStore) UpdateStorySummaryAndTopics(ctx context.Context, id int, summary string, topics []string) error {
	_, err := s.db.ExecContext(ctx, "UPDATE stories SET summary = ?, topics = ? WHERE id = ?", summary, topicsToJSON(topics), id)
	return err
}

func (s *SQLiteStore) UpdateStoryIframeStatus(ctx context.Context, id int, blocked bool) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stories SET iframe_blocked = ? WHERE id = ?`, blocked, id)
	return err
}

func (s *SQLiteStore) ResetAllSummaries(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, "UPDATE stories SET summary = NULL, topics = '[]'")
	return err
}

func (s *SQLiteStore) ClearRanksNotIn(ctx context.Context, ids []int) error {
	if len(ids) == 0 {
		return nil
	}
	placeholders := strings.Repeat("?,", len(ids))
	placeholders = placeholders[:len(placeholders)-1]
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	_, err := s.db.ExecContext(ctx,
		`UPDATE stories SET hn_rank = NULL WHERE hn_rank IS NOT NULL AND id NOT IN (`+placeholders+`)`, args...)
	return err
}

func (s *SQLiteStore) UpdateRanks(ctx context.Context, rankMap map[int]int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for id, rank := range rankMap {
		if _, err := tx.ExecContext(ctx, `UPDATE stories SET hn_rank = ? WHERE id = ?`, rank, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *SQLiteStore) PruneStories(ctx context.Context, daysToKeep int) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM stories WHERE created_at < datetime('now', ? || ' days') AND is_saved = 0`,
		fmt.Sprintf("-%d", daysToKeep))
	return err
}

// ─── Comment methods ───

func (s *SQLiteStore) UpsertComment(ctx context.Context, comment Comment) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO comments (id, story_id, parent_id, text, by, posted_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
		ON CONFLICT(id) DO UPDATE SET text = excluded.text, posted_at = excluded.posted_at
	`,
		comment.ID, comment.StoryID, comment.ParentID, comment.Text, comment.By,
		comment.PostedAt.UTC().Format("2006-01-02T15:04:05Z"),
	)
	return err
}

func (s *SQLiteStore) GetComments(ctx context.Context, storyID int) ([]Comment, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, story_id, parent_id, text, by, posted_at FROM comments WHERE story_id = ? ORDER BY posted_at ASC`, storyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []Comment
	for rows.Next() {
		var c Comment
		var parentID sql.NullInt64
		var postedAt string
		if err := rows.Scan(&c.ID, &c.StoryID, &parentID, &c.Text, &c.By, &postedAt); err != nil {
			return nil, err
		}
		if parentID.Valid {
			pid := parentID.Int64
			c.ParentID = &pid
		}
		if t, err := time.Parse("2006-01-02T15:04:05Z", postedAt); err == nil {
			c.PostedAt = t
		} else if t, err := time.Parse("2006-01-02 15:04:05", postedAt); err == nil {
			c.PostedAt = t
		}
		comments = append(comments, c)
	}
	return comments, nil
}

// ─── HN Users ───

func (s *SQLiteStore) UpsertUser(ctx context.Context, user User) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO hn_users (id, created, karma, about, updated_at)
		VALUES (?, ?, ?, ?, datetime('now'))
		ON CONFLICT(id) DO UPDATE SET karma = excluded.karma, about = excluded.about, updated_at = datetime('now')
	`, user.ID, user.Created, user.Karma, user.About)
	return err
}

// ─── Auth stubs (local mode has no auth) ───

func (s *SQLiteStore) UpsertAuthUser(ctx context.Context, id, email, name, avatar string) (*AuthUser, error) {
	user := &AuthUser{
		ID:               id,
		Email:            email,
		Name:             name,
		AvatarURL:        avatar,
		IsAdmin:          true, // Hardcode local user as admin for now if they are signed in
		SummariesEnabled: true,
	}
	topicsJSON := topicsToJSON(nil)

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO auth_users (id, email, name, avatar_url, is_admin, summaries_enabled, topics)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			email = excluded.email,
			name = excluded.name,
			avatar_url = excluded.avatar_url,
			summaries_enabled = excluded.summaries_enabled
	`, user.ID, user.Email, user.Name, user.AvatarURL, user.IsAdmin, user.SummariesEnabled, topicsJSON)

	return user, err
}

func (s *SQLiteStore) GetAuthUser(ctx context.Context, id string) (*AuthUser, error) {
	var user AuthUser
	var topicsJSON string
	err := s.db.QueryRowContext(ctx, "SELECT id, email, name, avatar_url, is_admin, summaries_enabled, topics FROM auth_users WHERE id = ?", id).
		Scan(&user.ID, &user.Email, &user.Name, &user.AvatarURL, &user.IsAdmin, &user.SummariesEnabled, &topicsJSON)
	user.Topics = jsonToTopics(topicsJSON)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *SQLiteStore) UpdateUserTopics(ctx context.Context, userID string, topics []string) error {
	// For local mode, we save topics to the settings table if it's the local user
	if userID == "local-user" || userID == "local_user" {
		return s.SetSetting(ctx, "active_topics", topicsToJSON(topics))
	}
	return nil
}

func (s *SQLiteStore) GetActiveTopics(ctx context.Context) ([]string, error) {
	val, err := s.GetSetting(ctx, "active_topics")
	if err != nil {
		return nil, err
	}
	return jsonToTopics(val), nil
}

func (s *SQLiteStore) GetAllUsers(ctx context.Context) ([]*AuthUser, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id, email, name, avatar_url, is_admin, created_at, summaries_enabled, topics FROM auth_users ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []*AuthUser{}
	for rows.Next() {
		u := &AuthUser{}
		var topicsJSON string
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.AvatarURL, &u.IsAdmin, &u.CreatedAt, &u.SummariesEnabled, &topicsJSON); err != nil {
			return nil, err
		}
		u.Topics = jsonToTopics(topicsJSON)
		users = append(users, u)
	}
	return users, nil
}


func (s *SQLiteStore) GetAppStats(ctx context.Context) (*AppStats, error) {
	stats := &AppStats{}
	_ = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM stories").Scan(&stats.TotalStories)
	_ = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM comments").Scan(&stats.TotalComments)
	_ = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM auth_users").Scan(&stats.TotalUsers)
	return stats, nil
}

// ─── Interaction stubs (no-ops in local mode) ───

func (s *SQLiteStore) UpsertInteraction(ctx context.Context, _ string, storyID int, read, saved, hidden *bool) error {
	query := "UPDATE stories SET "
	var updates []string
	var args []interface{}

	if read != nil {
		updates = append(updates, "is_read = ?")
		args = append(args, *read)
	}
	if saved != nil {
		updates = append(updates, "is_saved = ?")
		args = append(args, *saved)
	}
	if hidden != nil {
		updates = append(updates, "is_hidden = ?")
		args = append(args, *hidden)
	}

	if len(updates) == 0 {
		return nil
	}

	query += strings.Join(updates, ", ") + " WHERE id = ?"
	args = append(args, storyID)

	res, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("story %d not found in database", storyID)
	}
	return nil
}

func (s *SQLiteStore) GetSavedStories(ctx context.Context, _ string, limit, offset int) ([]Story, int, error) {
	var total int
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM stories WHERE is_saved = 1").Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT id, title, url, score, by, descendants, posted_at, created_at, hn_rank, summary, discussion_summary, topics, is_read, is_saved, is_hidden, iframe_blocked
		 FROM stories WHERE is_saved = 1 ORDER BY posted_at DESC LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var stories []Story
	for rows.Next() {
		story, err := scanStory(rows)
		if err != nil {
			return nil, 0, err
		}
		stories = append(stories, story)
	}
	return stories, total, nil
}

// ─── Chat methods ───

func (s *SQLiteStore) SaveChatMessage(ctx context.Context, userID string, storyID int, role, content string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO chat_messages (user_id, story_id, role, content)
		VALUES (?, ?, ?, ?)
	`, userID, storyID, role, content)
	return err
}

func (s *SQLiteStore) GetChatHistory(ctx context.Context, userID string, storyID int) ([]ChatMessage, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, story_id, role, content, created_at
		FROM chat_messages
		WHERE user_id = ? AND story_id = ?
		ORDER BY created_at ASC
	`, userID, storyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []ChatMessage
	for rows.Next() {
		var m ChatMessage
		var createdAt string
		if err := rows.Scan(&m.ID, &m.UserID, &m.StoryID, &m.Role, &m.Content, &createdAt); err != nil {
			return nil, err
		}
		// Parse time
		if t, err := time.Parse("2006-01-02T15:04:05Z", createdAt); err == nil {
			m.CreatedAt = t
		} else if t, err := time.Parse("2006-01-02 15:04:05", createdAt); err == nil {
			m.CreatedAt = t
		}
		history = append(history, m)
	}
	return history, nil
}
func (s *SQLiteStore) ClearPoisonedSummaries(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, "UPDATE stories SET summary = NULL WHERE summary LIKE 'AI Error: %'")
	return err
}
