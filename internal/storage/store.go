package storage

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	pgvector "github.com/pgvector/pgvector-go"
)

type Story struct {
	ID          int64            `json:"id"`
	Title       string           `json:"title"`
	URL         string           `json:"url"`
	Score       int              `json:"score"`
	By          string           `json:"by"`
	Descendants int              `json:"descendants"`
	PostedAt    time.Time        `json:"time"`
	CreatedAt   time.Time        `json:"created_at"`
	HNRank      *int             `json:"hn_rank,omitempty"`
	IsRead      *bool            `json:"is_read,omitempty"`
	IsSaved     *bool            `json:"is_saved,omitempty"`
	IsHidden    *bool            `json:"is_hidden,omitempty"`
	Summary     *string          `json:"summary,omitempty"`
	Embedding   *pgvector.Vector `json:"-"`
	Similarity  *float64         `json:"similarity,omitempty"`
}

type AuthUser struct {
	ID           string    `json:"id"`
	GoogleID     string    `json:"google_id"`
	Email        string    `json:"email"`
	Name         string    `json:"name"`
	AvatarURL    string    `json:"avatar_url"`
	IsAdmin      bool      `json:"is_admin"`
	GeminiAPIKey string    `json:"-"` // Never expose to frontend
	CreatedAt    time.Time `json:"created_at"`
}

type Store struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

func (s *Store) UpsertStory(ctx context.Context, story Story) error {
	query := `
		INSERT INTO stories (id, title, url, score, by, descendants, posted_at, hn_rank, embedding, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
		ON CONFLICT (id) DO UPDATE
		SET title = EXCLUDED.title,
			url = EXCLUDED.url,
			score = EXCLUDED.score,
			by = EXCLUDED.by,
			descendants = EXCLUDED.descendants,
			posted_at = EXCLUDED.posted_at,
			hn_rank = EXCLUDED.hn_rank,
			embedding = COALESCE(EXCLUDED.embedding, stories.embedding);
	`
	_, err := s.db.Exec(ctx, query, story.ID, story.Title, story.URL, story.Score, story.By, story.Descendants, story.PostedAt, story.HNRank, story.Embedding)
	return err
}

func (s *Store) GetStories(ctx context.Context, limit, offset int, sortStrategy string, topics []string, userID string, showHidden bool) ([]Story, error) {
	// Base select — optionally LEFT JOIN user_interactions for logged-in users
	selectCols := `s.id, s.title, s.url, s.score, s.by, s.descendants, s.posted_at, s.created_at, s.hn_rank, s.summary`
	fromClause := `FROM stories s`
	hasUser := userID != ""

	if hasUser {
		selectCols += `, ui.is_read, ui.is_saved, ui.is_hidden`
		fromClause += ` LEFT JOIN user_interactions ui ON s.id = ui.story_id AND ui.user_id = $1`
	}

	query := `SELECT ` + selectCols + ` ` + fromClause + ` WHERE 1=1`
	var args []interface{}
	argID := 1

	if hasUser {
		args = append(args, userID)
		argID = 2

		if !showHidden {
			query += ` AND (ui.is_hidden IS NULL OR ui.is_hidden = FALSE)`
		}
	}

	// Multi-topic OR filter
	if len(topics) > 0 {
		tsqueryParts := make([]string, len(topics))
		for i, t := range topics {
			tsqueryParts[i] = fmt.Sprintf("plainto_tsquery('english', $%d)", argID)
			args = append(args, t)
			argID++
		}
		query += ` AND s.search_vector @@ (` + strings.Join(tsqueryParts, " || ") + `)`
	}

	// Show HN filter
	if sortStrategy == "show" {
		query += ` AND s.title ILIKE 'Show HN:%'`
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
	query += ` ORDER BY ` + orderBy

	query += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, argID, argID+1)
	args = append(args, limit, offset)

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stories []Story
	for rows.Next() {
		var story Story
		if hasUser {
			if err := rows.Scan(&story.ID, &story.Title, &story.URL, &story.Score, &story.By, &story.Descendants, &story.PostedAt, &story.CreatedAt, &story.HNRank, &story.Summary, &story.IsRead, &story.IsSaved, &story.IsHidden); err != nil {
				return nil, err
			}
		} else {
			if err := rows.Scan(&story.ID, &story.Title, &story.URL, &story.Score, &story.By, &story.Descendants, &story.PostedAt, &story.CreatedAt, &story.HNRank, &story.Summary); err != nil {
				return nil, err
			}
		}
		stories = append(stories, story)
	}
	return stories, nil
}

func (s *Store) GetStory(ctx context.Context, id int) (*Story, error) {
	query := `SELECT id, title, url, score, by, descendants, posted_at, created_at, hn_rank, summary FROM stories WHERE id = $1`
	var story Story
	err := s.db.QueryRow(ctx, query, id).Scan(&story.ID, &story.Title, &story.URL, &story.Score, &story.By, &story.Descendants, &story.PostedAt, &story.CreatedAt, &story.HNRank, &story.Summary)
	if err != nil {
		return nil, err
	}
	return &story, nil
}

func (s *Store) GetComments(ctx context.Context, storyID int) ([]Comment, error) {
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

type Comment struct {
	ID       int64     `json:"id"`
	StoryID  int64     `json:"story_id"`
	ParentID *int64    `json:"parent_id"`
	Text     string    `json:"text"`
	By       string    `json:"by"`
	PostedAt time.Time `json:"time"`
}

type User struct {
	ID        string `json:"id"`
	Created   int    `json:"created"`
	Karma     int    `json:"karma"`
	About     string `json:"about"`
	Submitted []int  `json:"submitted"`
}

func (s *Store) UpsertComment(ctx context.Context, comment Comment) error {
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

func (s *Store) UpsertUser(ctx context.Context, user User) error {
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

func (s *Store) ClearRanksNotIn(ctx context.Context, ids []int) error {
	if len(ids) == 0 {
		return nil
	}
	query := `UPDATE stories SET hn_rank = NULL WHERE hn_rank IS NOT NULL AND id != ALL($1)`
	_, err := s.db.Exec(ctx, query, ids)
	return err
}

func (s *Store) UpdateRanks(ctx context.Context, rankMap map[int]int) error {
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

func (s *Store) UpdateStorySummary(ctx context.Context, id int, summary string) error {
	query := `UPDATE stories SET summary = $1 WHERE id = $2`
	_, err := s.db.Exec(ctx, query, summary, id)
	return err
}

// UpsertAuthUser creates or updates a user based on their Google ID.
// Returns the user (with ID) after upsert.
func (s *Store) UpsertAuthUser(ctx context.Context, googleID, email, name, avatarURL string) (*AuthUser, error) {
	query := `
		INSERT INTO auth_users (google_id, email, name, avatar_url)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (google_id) DO UPDATE
		SET email = EXCLUDED.email,
			name = EXCLUDED.name,
			avatar_url = EXCLUDED.avatar_url
		RETURNING id, google_id, email, name, avatar_url, is_admin, COALESCE(gemini_api_key, ''), created_at
	`
	var user AuthUser
	err := s.db.QueryRow(ctx, query, googleID, email, name, avatarURL).Scan(
		&user.ID, &user.GoogleID, &user.Email, &user.Name, &user.AvatarURL, &user.IsAdmin, &user.GeminiAPIKey, &user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// GetAuthUser fetches a user by their UUID.
func (s *Store) GetAuthUser(ctx context.Context, userID string) (*AuthUser, error) {
	query := `SELECT id, google_id, email, name, avatar_url, is_admin, COALESCE(gemini_api_key, ''), created_at FROM auth_users WHERE id = $1`
	var user AuthUser
	err := s.db.QueryRow(ctx, query, userID).Scan(
		&user.ID, &user.GoogleID, &user.Email, &user.Name, &user.AvatarURL, &user.IsAdmin, &user.GeminiAPIKey, &user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Store) UpdateUserGeminiKey(ctx context.Context, userID, apiKey string) error {
	query := `UPDATE auth_users SET gemini_api_key = $1 WHERE id = $2`
	_, err := s.db.Exec(ctx, query, apiKey, userID)
	return err
}

// UpsertInteraction creates or updates a user-story interaction.
func (s *Store) UpsertInteraction(ctx context.Context, userID string, storyID int, isRead *bool, isSaved *bool, isHidden *bool) error {
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
func (s *Store) GetSavedStories(ctx context.Context, userID string, limit, offset int) ([]Story, error) {
	query := `
		SELECT s.id, s.title, s.url, s.score, s.by, s.descendants, s.posted_at, s.created_at, s.hn_rank, ui.is_read, ui.is_saved
		FROM stories s
		INNER JOIN user_interactions ui ON s.id = ui.story_id AND ui.user_id = $1
		WHERE ui.is_saved = TRUE
		ORDER BY ui.updated_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := s.db.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stories []Story
	for rows.Next() {
		var story Story
		if err := rows.Scan(&story.ID, &story.Title, &story.URL, &story.Score, &story.By, &story.Descendants, &story.PostedAt, &story.CreatedAt, &story.HNRank, &story.IsRead, &story.IsSaved); err != nil {
			return nil, err
		}
		stories = append(stories, story)
	}
	return stories, nil
}

// SearchStories performs a semantic similarity search using a query embedding vector.
func (s *Store) SearchStories(ctx context.Context, embedding pgvector.Vector, limit int) ([]Story, error) {
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

type ChatMessage struct {
	ID        int       `json:"id"`
	UserID    string    `json:"user_id"`
	StoryID   int       `json:"story_id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *Store) SaveChatMessage(ctx context.Context, userID string, storyID int, role, content string) error {
	query := `INSERT INTO chat_messages (user_id, story_id, role, content) VALUES ($1::uuid, $2, $3, $4)`
	_, err := s.db.Exec(ctx, query, userID, storyID, role, content)
	return err
}

func (s *Store) GetChatHistory(ctx context.Context, userID string, storyID int) ([]ChatMessage, error) {
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
