package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

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
		topics      TEXT    NOT NULL DEFAULT '[]'  -- JSON array of strings
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
	`
	_, err := s.db.Exec(schema)
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
	var summary sql.NullString
	var postedAt, createdAt string

	if err := row.Scan(
		&story.ID, &story.Title, &story.URL, &story.Score,
		&story.By, &story.Descendants, &postedAt, &createdAt,
		&hnRank, &summary, &topicsJSON,
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
		INSERT INTO stories (id, title, url, score, by, descendants, posted_at, created_at, hn_rank, topics)
		VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, COALESCE(?, '[]'))
		ON CONFLICT(id) DO UPDATE SET
			title       = excluded.title,
			url         = excluded.url,
			score       = excluded.score,
			by          = excluded.by,
			descendants = excluded.descendants,
			posted_at   = excluded.posted_at,
			hn_rank     = excluded.hn_rank,
			topics      = CASE WHEN excluded.topics != '[]' AND excluded.topics != '' THEN excluded.topics ELSE stories.topics END
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
		`SELECT id, title, url, score, by, descendants, posted_at, created_at, hn_rank, summary, topics
		 FROM stories WHERE id = ?`, id)
	story, err := scanStory(row)
	if err != nil {
		return nil, err
	}
	return &story, nil
}

func (s *SQLiteStore) GetStories(ctx context.Context, limit, offset int, sortStrategy string, topics []string, userID string, showHidden bool) ([]Story, int, error) {
	// Build WHERE for topic filtering (simple client-friendly LIKE matching)
	whereClause := "WHERE 1=1"
	var args []interface{}

	if sortStrategy == "show" {
		whereClause += " AND title LIKE 'Show HN:%'"
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
	var total int
	if err := s.db.QueryRowContext(ctx, countQ, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Get stories
	query := `SELECT id, title, url, score, by, descendants, posted_at, created_at, hn_rank, summary, topics
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

		// Client-side topic filtering (SQLite doesn't have tsquery)
		if len(topics) > 0 {
			matched := false
			storyTopicsLower := strings.ToLower(strings.Join(story.Topics, " "))
			titleLower := strings.ToLower(story.Title)
			for _, t := range topics {
				tl := strings.ToLower(t)
				if strings.Contains(storyTopicsLower, tl) || strings.Contains(titleLower, tl) {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
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

func (s *SQLiteStore) UpdateStorySummaryAndTopics(ctx context.Context, id int, summary string, topics []string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stories SET summary = ?, topics = ? WHERE id = ?`,
		summary, topicsToJSON(topics), id)
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
		`DELETE FROM stories WHERE created_at < datetime('now', ? || ' days')`,
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

func (s *SQLiteStore) UpsertAuthUser(_ context.Context, _, _, _, _ string) (*AuthUser, error) {
	return nil, fmt.Errorf("auth not supported in local mode")
}

func (s *SQLiteStore) GetAuthUser(_ context.Context, _ string) (*AuthUser, error) {
	return nil, fmt.Errorf("auth not supported in local mode")
}

func (s *SQLiteStore) UpdateUserGeminiKey(_ context.Context, _, _ string) error {
	return nil
}

func (s *SQLiteStore) GetAllUsers(_ context.Context) ([]*AuthUser, error) {
	return nil, nil
}

func (s *SQLiteStore) GetAnyAdminAPIKey(_ context.Context) (string, error) {
	return "", nil
}

func (s *SQLiteStore) GetAppStats(ctx context.Context) (*AppStats, error) {
	stats := &AppStats{}
	_ = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM stories").Scan(&stats.TotalStories)
	_ = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM comments").Scan(&stats.TotalComments)
	return stats, nil
}

// ─── Interaction stubs (no-ops in local mode) ───

func (s *SQLiteStore) UpsertInteraction(_ context.Context, _ string, _ int, _, _, _ *bool) error {
	return nil
}

func (s *SQLiteStore) GetSavedStories(_ context.Context, _ string, _, _ int) ([]Story, int, error) {
	return nil, 0, nil
}

// ─── Chat stubs ───

func (s *SQLiteStore) SaveChatMessage(_ context.Context, _ string, _ int, _, _ string) error {
	return nil
}

func (s *SQLiteStore) GetChatHistory(_ context.Context, _ string, _ int) ([]ChatMessage, error) {
	return nil, nil
}
