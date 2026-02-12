package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
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
	HNRank      *int      `json:"hn_rank,omitempty"`
}

type Store struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

func (s *Store) UpsertStory(ctx context.Context, story Story) error {
	query := `
		INSERT INTO stories (id, title, url, score, by, descendants, posted_at, hn_rank, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
		ON CONFLICT (id) DO UPDATE
		SET title = EXCLUDED.title,
			url = EXCLUDED.url,
			score = EXCLUDED.score,
			by = EXCLUDED.by,
			descendants = EXCLUDED.descendants,
			posted_at = EXCLUDED.posted_at,
			hn_rank = EXCLUDED.hn_rank;
	`
	_, err := s.db.Exec(ctx, query, story.ID, story.Title, story.URL, story.Score, story.By, story.Descendants, story.PostedAt, story.HNRank)
	return err
}

func (s *Store) GetStories(ctx context.Context, limit, offset int, sortStrategy string, topic string) ([]Story, error) {
	query := `SELECT id, title, url, score, by, descendants, posted_at, created_at, hn_rank FROM stories WHERE 1=1`
	var args []interface{}
	argID := 1

	if topic != "" {
		query += fmt.Sprintf(` AND search_vector @@ plainto_tsquery('english', $%d)`, argID)
		args = append(args, topic)
		argID++
	}

	orderBy := "hn_rank ASC NULLS LAST"
	switch sortStrategy {
	case "votes":
		orderBy = "score DESC"
	case "latest":
		orderBy = "posted_at DESC"
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
		if err := rows.Scan(&story.ID, &story.Title, &story.URL, &story.Score, &story.By, &story.Descendants, &story.PostedAt, &story.CreatedAt, &story.HNRank); err != nil {
			return nil, err
		}
		stories = append(stories, story)
	}
	return stories, nil
}

func (s *Store) GetStory(ctx context.Context, id int) (*Story, error) {
	query := `SELECT id, title, url, score, by, descendants, posted_at, created_at, hn_rank FROM stories WHERE id = $1`
	var story Story
	err := s.db.QueryRow(ctx, query, id).Scan(&story.ID, &story.Title, &story.URL, &story.Score, &story.By, &story.Descendants, &story.PostedAt, &story.CreatedAt, &story.HNRank)
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
