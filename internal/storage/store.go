package storage

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Story struct {
	ID          int64     `json:"id"`
	Title       string    `json:"title"`
	URL         string    `json:"url"`
	Score       int       `json:"score"`
	By          string    `json:"by"`
	Descendants int       `json:"descendants"`
	PostedAt    time.Time `json:"time"`
	CreatedAt   time.Time `json:"created_at"`
}

type Store struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

func (s *Store) UpsertStory(ctx context.Context, story Story) error {
	query := `
		INSERT INTO stories (id, title, url, score, by, descendants, posted_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
		ON CONFLICT (id) DO UPDATE
		SET title = EXCLUDED.title,
			url = EXCLUDED.url,
			score = EXCLUDED.score,
			by = EXCLUDED.by,
			descendants = EXCLUDED.descendants,
			posted_at = EXCLUDED.posted_at;
	`
	_, err := s.db.Exec(ctx, query, story.ID, story.Title, story.URL, story.Score, story.By, story.Descendants, story.PostedAt)
	return err
}

func (s *Store) GetStories(ctx context.Context, limit, offset int, sortStrategy string) ([]Story, error) {
	orderBy := "score DESC"
	if sortStrategy == "new" {
		orderBy = "posted_at DESC"
	}

	query := `
		SELECT id, title, url, score, by, descendants, posted_at, created_at
		FROM stories
		ORDER BY ` + orderBy + `
		LIMIT $1 OFFSET $2
	`
	rows, err := s.db.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stories []Story
	for rows.Next() {
		var story Story
		if err := rows.Scan(&story.ID, &story.Title, &story.URL, &story.Score, &story.By, &story.Descendants, &story.PostedAt, &story.CreatedAt); err != nil {
			return nil, err
		}
		stories = append(stories, story)
	}
	return stories, nil
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
