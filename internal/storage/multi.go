package storage

import (
	"context"
	"log"
	"sync"
	"time"
)

// MultiStore implements DB over multiple DB instances.
type MultiStore struct {
	Primary     DB
	Secondaries []DB
	mu          sync.RWMutex
}

func NewMultiStore(primary DB) *MultiStore {
	return &MultiStore{Primary: primary}
}

func (m *MultiStore) AddSecondary(db DB) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Secondaries = append(m.Secondaries, db)
}

// ─── Story Methods ───

func (m *MultiStore) UpsertStory(ctx context.Context, story Story) error {
	err := m.Primary.UpsertStory(ctx, story)
	if err != nil {
		return err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		secCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		sErr := sec.UpsertStory(secCtx, story)
		cancel()
		if sErr != nil {
			log.Printf("MultiStore: Secondary UpsertStory failed: %v", sErr)
		}
	}
	return nil
}

func (m *MultiStore) GetStory(ctx context.Context, id int) (*Story, error) {
	return m.Primary.GetStory(ctx, id)
}

func (m *MultiStore) GetStories(ctx context.Context, limit, offset int, sortStrategy string, topics []string, userID string, showHidden bool) ([]Story, int, error) {
	return m.Primary.GetStories(ctx, limit, offset, sortStrategy, topics, userID, showHidden)
}

func (m *MultiStore) GetStoriesStatus(ctx context.Context, ids []int) (map[int]bool, error) {
	return m.Primary.GetStoriesStatus(ctx, ids)
}

func (m *MultiStore) UpdateStorySummary(ctx context.Context, id int, summary string) error {
	err := m.Primary.UpdateStorySummary(ctx, id, summary)
	if err != nil {
		return err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if sErr := sec.UpdateStorySummary(ctx, id, summary); sErr != nil {
			log.Printf("MultiStore: Secondary UpdateStorySummary failed: %v", sErr)
		}
	}
	return nil
}

func (m *MultiStore) UpdateStorySummaryAndTopics(ctx context.Context, id int, summary string, topics []string) error {
	err := m.Primary.UpdateStorySummaryAndTopics(ctx, id, summary, topics)
	if err != nil {
		return err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		secCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		sErr := sec.UpdateStorySummaryAndTopics(secCtx, id, summary, topics)
		cancel()
		if sErr != nil {
			log.Printf("MultiStore: Secondary UpdateStorySummaryAndTopics failed: %v", sErr)
		}
	}
	return nil
}

func (m *MultiStore) UpdateStoryDiscussionSummary(ctx context.Context, id int, summary string) error {
	err := m.Primary.UpdateStoryDiscussionSummary(ctx, id, summary)
	if err != nil {
		return err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if sErr := sec.UpdateStoryDiscussionSummary(ctx, id, summary); sErr != nil {
			log.Printf("MultiStore: Secondary UpdateStoryDiscussionSummary failed: %v", sErr)
		}
	}
	return nil
}

func (m *MultiStore) UpdateStoryIframeStatus(ctx context.Context, id int, blocked bool) error {
	err := m.Primary.UpdateStoryIframeStatus(ctx, id, blocked)
	if err != nil {
		return err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if sErr := sec.UpdateStoryIframeStatus(ctx, id, blocked); sErr != nil {
			log.Printf("MultiStore: Secondary UpdateStoryIframeStatus failed: %v", sErr)
		}
	}
	return nil
}

func (m *MultiStore) ClearRanksNotIn(ctx context.Context, ids []int) error {
	err := m.Primary.ClearRanksNotIn(ctx, ids)
	if err != nil {
		return err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if sErr := sec.ClearRanksNotIn(ctx, ids); sErr != nil {
			log.Printf("MultiStore: Secondary ClearRanksNotIn failed: %v", sErr)
		}
	}
	return nil
}

func (m *MultiStore) UpdateRanks(ctx context.Context, rankMap map[int]int) error {
	err := m.Primary.UpdateRanks(ctx, rankMap)
	if err != nil {
		return err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if sErr := sec.UpdateRanks(ctx, rankMap); sErr != nil {
			log.Printf("MultiStore: Secondary UpdateRanks failed: %v", sErr)
		}
	}
	return nil
}

func (m *MultiStore) PruneStories(ctx context.Context, daysToKeep int) error {
	err := m.Primary.PruneStories(ctx, daysToKeep)
	if err != nil {
		return err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if sErr := sec.PruneStories(ctx, daysToKeep); sErr != nil {
			log.Printf("MultiStore: Secondary PruneStories failed: %v", sErr)
		}
	}
	return nil
}

// ─── Comment Methods ───

func (m *MultiStore) UpsertComment(ctx context.Context, comment Comment) error {
	err := m.Primary.UpsertComment(ctx, comment)
	if err != nil {
		return err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if sErr := sec.UpsertComment(ctx, comment); sErr != nil {
			log.Printf("MultiStore: Secondary UpsertComment failed: %v", sErr)
		}
	}
	return nil
}

func (m *MultiStore) GetComments(ctx context.Context, storyID int) ([]Comment, error) {
	return m.Primary.GetComments(ctx, storyID)
}

// ─── User Methods ───

func (m *MultiStore) UpsertUser(ctx context.Context, user User) error {
	err := m.Primary.UpsertUser(ctx, user)
	if err != nil {
		return err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if sErr := sec.UpsertUser(ctx, user); sErr != nil {
			log.Printf("MultiStore: Secondary UpsertUser failed: %v", sErr)
		}
	}
	return nil
}

// ─── Auth Methods ───

func (m *MultiStore) UpsertAuthUser(ctx context.Context, googleID, email, name, avatarURL string) (*AuthUser, error) {
	// 1. Update Primary
	user, err := m.Primary.UpsertAuthUser(ctx, googleID, email, name, avatarURL)
	if err != nil {
		return nil, err
	}

	// 2. Propagate to Secondaries
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if _, sErr := sec.UpsertAuthUser(ctx, googleID, email, name, avatarURL); sErr != nil {
			log.Printf("MultiStore: Secondary UpsertAuthUser failed: %v", sErr)
		}
	}
	return user, nil
}

func (m *MultiStore) GetAuthUser(ctx context.Context, userID string) (*AuthUser, error) {
	// Try secondaries first (Cloud is source of truth for authenticated users)
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if user, err := sec.GetAuthUser(ctx, userID); err == nil {
			return user, nil
		}
	}
	// Fallback to Primary (SQLite)
	return m.Primary.GetAuthUser(ctx, userID)
}

func (m *MultiStore) UpdateUserGeminiKey(ctx context.Context, userID, apiKey string) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if sErr := sec.UpdateUserGeminiKey(ctx, userID, apiKey); sErr != nil {
			log.Printf("MultiStore: Secondary UpdateUserGeminiKey failed: %v", sErr)
		}
	}
	return m.Primary.UpdateUserGeminiKey(ctx, userID, apiKey)
}

func (m *MultiStore) UpdateUserTopics(ctx context.Context, userID string, topics []string) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if sErr := sec.UpdateUserTopics(ctx, userID, topics); sErr != nil {
			log.Printf("MultiStore: Secondary UpdateUserTopics failed: %v", sErr)
		}
	}
	return m.Primary.UpdateUserTopics(ctx, userID, topics)
}

func (m *MultiStore) GetAllUsers(ctx context.Context) ([]*AuthUser, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		return sec.GetAllUsers(ctx)
	}
	return m.Primary.GetAllUsers(ctx)
}

func (m *MultiStore) GetAnyAdminAPIKey(ctx context.Context) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		return sec.GetAnyAdminAPIKey(ctx)
	}
	return m.Primary.GetAnyAdminAPIKey(ctx)
}

func (m *MultiStore) GetAppStats(ctx context.Context) (*AppStats, error) {
	return m.Primary.GetAppStats(ctx)
}

// ─── Interaction Methods ───

func (m *MultiStore) UpsertInteraction(ctx context.Context, userID string, storyID int, isRead, isSaved, isHidden *bool) error {
	err := m.Primary.UpsertInteraction(ctx, userID, storyID, isRead, isSaved, isHidden)
	if err != nil {
		return err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if sErr := sec.UpsertInteraction(ctx, userID, storyID, isRead, isSaved, isHidden); sErr != nil {
			log.Printf("MultiStore: Secondary UpsertInteraction failed: %v", sErr)
		}
	}
	return nil
}

func (m *MultiStore) GetSavedStories(ctx context.Context, userID string, limit, offset int) ([]Story, int, error) {
	return m.Primary.GetSavedStories(ctx, userID, limit, offset)
}

// ─── Chat Methods ───

func (m *MultiStore) SaveChatMessage(ctx context.Context, userID string, storyID int, role, content string) error {
	err := m.Primary.SaveChatMessage(ctx, userID, storyID, role, content)
	if err != nil {
		return err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if sErr := sec.SaveChatMessage(ctx, userID, storyID, role, content); sErr != nil {
			log.Printf("MultiStore: Secondary SaveChatMessage failed: %v", sErr)
		}
	}
	return nil
}

func (m *MultiStore) GetChatHistory(ctx context.Context, userID string, storyID int) ([]ChatMessage, error) {
	return m.Primary.GetChatHistory(ctx, userID, storyID)
}

// ─── Settings Methods ───

func (m *MultiStore) GetSetting(ctx context.Context, key string) (string, error) {
	return m.Primary.GetSetting(ctx, key)
}

func (m *MultiStore) SetSetting(ctx context.Context, key, value string) error {
	err := m.Primary.SetSetting(ctx, key, value)
	if err != nil {
		return err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sec := range m.Secondaries {
		if sErr := sec.SetSetting(ctx, key, value); sErr != nil {
			log.Printf("MultiStore: Secondary SetSetting failed: %v", sErr)
		}
	}
	return nil
}
