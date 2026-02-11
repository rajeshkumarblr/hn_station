package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rajeshkumarblr/my_hn/internal/storage"
	"github.com/stretchr/testify/assert"
)

// Mocking the store would be ideal for unit tests,
// but for this phase we can do a simple integration test if DB is available,
// or just test the handler logic with a mock if we want to be pure.
// Given the environment, let's write a test that relies on the DB being present
// (Integration Test) or skip if not.

func TestHealthCheck(t *testing.T) {
	// server with nil store is fine for health check
	server := NewServer(nil)

	req, _ := http.NewRequest("GET", "/healthc", nil)
	rr := httptest.NewRecorder()

	server.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "OK", rr.Body.String())
}

func TestGetStories_Integration(t *testing.T) {
	// usage: go test -v ./internal/api -tags=integration
	// currently we just run it if we can connect, else skip

	dbURL := "postgres://postgres:rootPass1@localhost:5432/my_hn" // Hardcoded for test environment or read from env
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skip("Skipping integration test: database not available")
	}
	defer pool.Close()

	// Ensure connection
	if err := pool.Ping(ctx); err != nil {
		t.Skip("Skipping integration test: database connection failed")
	}

	store := storage.New(pool)
	server := NewServer(store)

	// Seed a story for testing?
	// We assume data exists from ingestion or we can insert one.
	testStory := storage.Story{
		ID:       12345,
		Title:    "Test Story",
		URL:      "http://example.com",
		Score:    100,
		PostedAt: time.Now(),
	}
	_ = store.UpsertStory(ctx, testStory)

	req, _ := http.NewRequest("GET", "/api/stories?limit=5", nil)
	rr := httptest.NewRecorder()

	server.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var stories []storage.Story
	err = json.Unmarshal(rr.Body.Bytes(), &stories)
	assert.NoError(t, err)
	assert.GreaterOrEqual(t, len(stories), 1)
}
