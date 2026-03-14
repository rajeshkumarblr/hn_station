package storage

import "context"

// DB is the abstract interface over any database backend (PostgreSQL or SQLite).
// Both Store (PostgreSQL) and SQLiteStore implement this.
type DB interface {
	// Story CRUD
	UpsertStory(ctx context.Context, story Story) error
	GetStory(ctx context.Context, id int) (*Story, error)
	GetStories(ctx context.Context, limit, offset int, sortStrategy string, topics []string, userID string, showHidden bool) ([]Story, int, error)
	GetStoriesStatus(ctx context.Context, ids []int) (map[int]bool, error)
	UpdateStorySummary(ctx context.Context, id int, summary string) error
	UpdateStorySummaryAndTopics(ctx context.Context, id int, summary string, topics []string) error
	ClearRanksNotIn(ctx context.Context, ids []int) error
	UpdateRanks(ctx context.Context, rankMap map[int]int) error
	PruneStories(ctx context.Context, daysToKeep int) error

	// Comments
	UpsertComment(ctx context.Context, comment Comment) error
	GetComments(ctx context.Context, storyID int) ([]Comment, error)

	// HN Users (authors)
	UpsertUser(ctx context.Context, user User) error

	// Auth Users (cloud only — local returns stubs/errors)
	UpsertAuthUser(ctx context.Context, googleID, email, name, avatarURL string) (*AuthUser, error)
	GetAuthUser(ctx context.Context, userID string) (*AuthUser, error)
	UpdateUserGeminiKey(ctx context.Context, userID, apiKey string) error
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
