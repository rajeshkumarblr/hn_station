package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/rajeshkumarblr/hn_station/internal/ai"
	"github.com/rajeshkumarblr/hn_station/internal/content"
	"github.com/rajeshkumarblr/hn_station/internal/storage"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	ctx := context.Background()
	dbpool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("Unable to create connection pool: %v\n", err)
	}
	defer dbpool.Close()

	store := storage.New(dbpool)
	aiClient := ai.NewOllamaClient()
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://ollama:11434"
	}

	log.Println("Catch-up Job: Fetching top 20 stories without summaries...")

	// Query top 20 stories without summaries, ordered by rank
	query := `
		SELECT id, title, url 
		FROM stories 
		WHERE (summary IS NULL OR summary = '') AND url != '' 
		ORDER BY hn_rank ASC NULLS LAST 
		LIMIT 20
	`
	rows, err := dbpool.Query(ctx, query)
	if err != nil {
		log.Fatalf("Query failed: %v", err)
	}
	defer rows.Close()

	type StoryJob struct {
		ID    int
		Title string
		URL   string
	}

	var jobs []StoryJob
	for rows.Next() {
		var j StoryJob
		if err := rows.Scan(&j.ID, &j.Title, &j.URL); err != nil {
			log.Printf("Scan failed: %v", err)
			continue
		}
		jobs = append(jobs, j)
	}

	log.Printf("Found %d stories to process.", len(jobs))

	for i, job := range jobs {
		log.Printf("[%d/%d] Processing story %d: %s", i+1, len(jobs), job.ID, job.Title)
		processSummary(ctx, store, aiClient, ollamaURL, job.ID, job.Title, job.URL)
		// Small delay to be kind to the CPU
		time.Sleep(2 * time.Second)
	}

	log.Println("Catch-up Job Completed.")
}

func processSummary(ctx context.Context, store *storage.Store, aiClient *ai.OllamaClient, ollamaURL string, id int, title string, url string) {
	workCtx, cancel := context.WithTimeout(ctx, 20*time.Minute)
	defer cancel()

	fetchRes, err := content.FetchArticle(url)
	if err != nil {
		log.Printf("Failed to fetch content (story %d): %v", id, err)
		return
	}

	if len(fetchRes.Content) < 100 {
		log.Printf("Content too short (story %d)", id)
		return
	}

	textContent := fetchRes.Content
	if len(textContent) > 20000 {
		textContent = textContent[:20000] + "..."
	}

	responseStr, err := aiClient.GenerateSummary(workCtx, ollamaURL, title, textContent)
	if err != nil {
		log.Printf("Failed to generate summary (story %d): %v", id, err)
		return
	}

	cleanJSON := strings.TrimSpace(responseStr)
	cleanJSON = strings.TrimPrefix(cleanJSON, "```json")
	cleanJSON = strings.TrimPrefix(cleanJSON, "```")
	cleanJSON = strings.TrimSuffix(cleanJSON, "```")
	cleanJSON = strings.TrimSpace(cleanJSON)

	var intermediate struct {
		Summary interface{} `json:"summary"`
		Topics  []string    `json:"topics"`
	}

	var result struct {
		Summary string
		Topics  []string
	}

	if err := json.Unmarshal([]byte(cleanJSON), &intermediate); err != nil {
		log.Printf("Failed to parse JSON for story %d. Error: %v. Raw: %s", id, err, responseStr)
		result.Summary = responseStr
		result.Topics = []string{}
	} else {
		switch v := intermediate.Summary.(type) {
		case string:
			result.Summary = v
		case []interface{}:
			var parts []string
			for _, part := range v {
				if s, ok := part.(string); ok {
					parts = append(parts, s)
				}
			}
			result.Summary = strings.Join(parts, " ")
		default:
			result.Summary = fmt.Sprintf("%v", v)
		}
		result.Topics = intermediate.Topics
	}

	if err := store.UpdateStorySummaryAndTopics(workCtx, id, result.Summary, result.Topics); err != nil {
		log.Printf("Failed to save summary (story %d): %v", id, err)
	} else {
		log.Printf("Successfully saved summary for story %d", id)
	}
}
