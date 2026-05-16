package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rajeshkumarblr/hn_station/internal/storage"
	"github.com/stretchr/testify/assert"
)

func TestHealthCheck(t *testing.T) {
	// server with nil store is fine for health check
	server := NewServer(nil, nil, nil, false, nil, nil)

	req, _ := http.NewRequest("GET", "/healthc", nil)
	rr := httptest.NewRecorder()

	server.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "OK", rr.Body.String())
}

func TestGetStories_Integration(t *testing.T) {
	// usage: go test -v ./internal/api -tags=integration
	// currently we just run it if we can connect, else skip

	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("Skipping integration test: TEST_DATABASE_URL not set")
	}

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
	server := NewServer(store, nil, nil, false, nil, nil)

	// Seed a story for testing
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
