package storage

import (
	"context"
	"time"

	pgvector "github.com/pgvector/pgvector-go"
)

// DB is the abstract interface over any database backend (PostgreSQL or SQLite).
// Both PostgresStore and SQLiteStore implement this.
type DB interface {
	// Story CRUD
	UpsertStory(ctx context.Context, story Story) error
	GetStory(ctx context.Context, id int) (*Story, error)
	GetStories(ctx context.Context, limit, offset int, sortStrategy string, topics []string, userID string, showHidden bool) ([]Story, int, error)
	GetStoriesStatus(ctx context.Context, ids []int) (map[int]bool, error)
	UpdateStorySummary(ctx context.Context, id int, summary string) error
	UpdateStorySummaryAndTopics(ctx context.Context, id int, summary string, topics []string) error
	UpdateStoryDiscussionSummary(ctx context.Context, id int, summary string) error
	UpdateStoryGeminiURL(ctx context.Context, id int64, url string) error
	UpdateStoryIframeStatus(ctx context.Context, id int, blocked bool) error
	ClearRanksNotIn(ctx context.Context, ids []int) error
	UpdateRanks(ctx context.Context, rankMap map[int]int) error
	PruneStories(ctx context.Context, daysToKeep int) error
	ClearPoisonedSummaries(ctx context.Context) error

	// Comments
	UpsertComment(ctx context.Context, comment Comment) error
	GetComments(ctx context.Context, storyID int) ([]Comment, error)

	// HN Users (authors)
	UpsertUser(ctx context.Context, user User) error

	// Auth Users (cloud only — local returns stubs/errors)
	UpsertAuthUser(ctx context.Context, googleID, email, name, avatarURL string) (*AuthUser, error)
	GetAuthUser(ctx context.Context, userID string) (*AuthUser, error)
	UpdateUserGeminiKey(ctx context.Context, userID, apiKey string) error
	UpdateUserTopics(ctx context.Context, userID string, topics []string) error
	GetActiveTopics(ctx context.Context) ([]string, error)
	GetAllUsers(ctx context.Context) ([]*AuthUser, error)
	GetAnyAdminAPIKey(ctx context.Context) (string, error)
	GetAppStats(ctx context.Context) (*AppStats, error)

	// Interactions (cloud only — local is no-op)
	UpsertInteraction(ctx context.Context, userID string, storyID int, isRead *bool, isSaved *bool, isHidden *bool) error
	GetSavedStories(ctx context.Context, userID string, limit, offset int) ([]Story, int, error)

	// Chat history (cloud only — local is no-op)
	SaveChatMessage(ctx context.Context, userID string, storyID int, role, content string) error
	GetChatHistory(ctx context.Context, userID string, storyID int) ([]ChatMessage, error)

	// Settings
	GetSetting(ctx context.Context, key string) (string, error)
	SetSetting(ctx context.Context, key, value string) error
}

// ─── Common Types ───

type Story struct {
	ID            int64            `json:"id"`
	Title         string           `json:"title"`
	URL           string           `json:"url"`
	Score         int              `json:"score"`
	By            string           `json:"by"`
	Descendants   int              `json:"descendants"`
	PostedAt      time.Time        `json:"time"`
	CreatedAt     time.Time        `json:"created_at"`
	HNRank        *int             `json:"hn_rank,omitempty"`
	IsRead        *bool            `json:"is_read,omitempty"`
	IsSaved       *bool            `json:"is_saved,omitempty"`
	IsHidden      *bool            `json:"is_hidden,omitempty"`
	Summary           *string          `json:"summary,omitempty"`
	DiscussionSummary *string          `json:"discussion_summary,omitempty"`
	Topics            []string         `json:"topics,omitempty"`
	IframeBlocked     *bool            `json:"iframe_blocked,omitempty"`
	GeminiURL         *string          `json:"gemini_url,omitempty"`
	Embedding     *pgvector.Vector `json:"-"`
	Similarity    *float64         `json:"similarity,omitempty"`
}

type Comment struct {
	ID        int64     `json:"id"`
	StoryID   int64     `json:"story_id"`
	ParentID  *int64    `json:"parent_id"`
	Text      string    `json:"text"`
	By        string    `json:"by"`
	PostedAt  time.Time `json:"time"`
	CreatedAt time.Time `json:"created_at"`
}

type User struct {
	ID        string `json:"id"`
	Created   int    `json:"created"`
	Karma     int    `json:"karma"`
	About     string `json:"about"`
	Submitted []int  `json:"submitted"`
}

type AuthUser struct {
	ID           string     `json:"id"`
	GoogleID     string     `json:"google_id"`
	Email        string     `json:"email"`
	Name             string     `json:"name"`
	AvatarURL        string     `json:"avatar_url"`
	IsAdmin          bool       `json:"is_admin"`
	SummariesEnabled bool       `json:"ai_summaries_enabled"`
	Topics           []string   `json:"topics"` // User-preferred filters (synced)
	TotalViews   int        `json:"total_views"`
	LastSeen     *time.Time `json:"last_seen"` // Pointer to handle nulls
	GeminiAPIKey string     `json:"-"`         // Never expose to frontend
	CreatedAt    time.Time  `json:"created_at"`
}

type ChatMessage struct {
	ID        int       `json:"id"`
	UserID    string    `json:"user_id"`
	StoryID   int       `json:"story_id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

type AppStats struct {
	TotalUsers        int `json:"total_users"`
	TotalInteractions int `json:"total_interactions"`
	TotalStories      int `json:"total_stories"`
	TotalComments     int `json:"total_comments"`
}
