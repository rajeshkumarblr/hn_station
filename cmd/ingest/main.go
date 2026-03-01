package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/rajeshkumarblr/hn_station/internal/ai"
	"github.com/rajeshkumarblr/hn_station/internal/content"
	"github.com/rajeshkumarblr/hn_station/internal/hn"
	"github.com/rajeshkumarblr/hn_station/internal/storage"
)

const (
	WorkerCount  = 3
	TotalStories = 20 // Only keep top 20 front-page stories
)

func main() {
	// Parse CLI flags
	interval := flag.Duration("interval", 1*time.Minute, "Interval between ingestion runs (e.g. 5m, 1h)")
	oneShot := flag.Bool("one-shot", false, "Run once and exit")
	flag.Parse()

	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on environment variables")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Received shutdown signal")
		cancel()
	}()

	// Connect to database
	dbpool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("Unable to create connection pool: %v\n", err)
	}
	defer dbpool.Close()

	store := storage.New(dbpool)
	client := hn.NewClient()
	aiClient := ai.NewOllamaClient()

	log.Printf("Starting Ingestion Service (Interval: %v, One-shot: %v)...", *interval, *oneShot)

	// Start Summary Workers
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://localhost:11434"
	}
	summaryQueue := make(chan SummaryJob, 100)

	// Create a shared rate limiter for Ollama
	// 500ms interval for faster local processing
	limiter := time.NewTicker(500 * time.Millisecond)
	defer limiter.Stop()

	var workerWg sync.WaitGroup
	// 5 workers for local power
	for i := 0; i < 5; i++ {
		workerWg.Add(1)
		go func(workerID int) {
			defer workerWg.Done()
			startWorker(workerID, ctx, store, aiClient, ollamaURL, summaryQueue, limiter)
		}(i)
	}

	// Run initially
	runIngestion(ctx, client, store, aiClient, summaryQueue)

	if *oneShot {
		log.Println("One-shot mode: waiting for summary queue to drain...")
		close(summaryQueue)
		workerWg.Wait()
		log.Println("One-shot run completed.")
		return
	}

	// Ticker for periodic updates
	ticker := time.NewTicker(*interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("Shutting down ingestion service...")
			close(summaryQueue)
			workerWg.Wait()
			return
		case <-ticker.C:
			runIngestion(ctx, client, store, aiClient, summaryQueue)
		}
	}
}

type SummaryJob struct {
	ID    int
	URL   string
	Title string
}

func startWorker(id int, ctx context.Context, store *storage.Store, aiClient *ai.OllamaClient, ollamaURL string, jobs <-chan SummaryJob, limiter *time.Ticker) {
	for {
		select {
		case <-ctx.Done():
			return
		case job, ok := <-jobs:
			if !ok {
				return
			}
			// Wait for tick before processing
			<-limiter.C
			processSummary(ctx, store, aiClient, ollamaURL, job)
		}
	}
}

func processSummary(ctx context.Context, store *storage.Store, aiClient *ai.OllamaClient, ollamaURL string, job SummaryJob) {
	log.Printf("Processing summary for story %d: %s", job.ID, job.Title)

	// Use a new context with timeout for the actual work
	workCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()

	fetchRes, err := content.FetchArticle(job.URL)
	if err != nil {
		log.Printf("Failed to fetch content (story %d): %v", job.ID, err)
		return
	}

	if len(fetchRes.Content) < 100 {
		log.Printf("Content too short (story %d)", job.ID)
		return
	}

	// Truncate content for Llama3 success (8k chars)
	textContent := fetchRes.Content
	if len(textContent) > 8000 {
		textContent = textContent[:8000] + "..."
	}

	// Use unified GenerateSummary which takes title and text
	responseStr, err := aiClient.GenerateSummary(workCtx, ollamaURL, job.Title, textContent)
	if err != nil {
		log.Printf("Failed to generate summary (story %d): %v", job.ID, err)
		return
	}

	// Try to parse the JSON (assuming Ollama phi3 outputs it directly)
	cleanJSON := strings.TrimSpace(responseStr)

	// Robust JSON extraction: Find first { and last }
	firstBrace := strings.Index(cleanJSON, "{")
	lastBrace := strings.LastIndex(cleanJSON, "}")
	if firstBrace != -1 && lastBrace != -1 && lastBrace > firstBrace {
		cleanJSON = cleanJSON[firstBrace : lastBrace+1]
	}

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
		log.Printf("Failed to parse JSON for story %d. Error: %v. Raw response: %s", job.ID, err, responseStr)
		result.Summary = responseStr // Fallback
		result.Topics = []string{}
	} else {
		// Flatten summary (could be string, []string, or [][]string)
		summaryParts := flattenStringArray(intermediate.Summary)
		if len(summaryParts) > 0 {
			var bulletPoints []string
			for _, s := range summaryParts {
				s = strings.TrimSpace(s)
				if s == "" {
					continue
				}
				if !strings.HasPrefix(s, "-") && !strings.HasPrefix(s, "•") {
					s = "- " + s
				}
				bulletPoints = append(bulletPoints, s)
			}
			result.Summary = strings.Join(bulletPoints, "\n")
		} else if s, ok := intermediate.Summary.(string); ok {
			result.Summary = s
		} else {
			result.Summary = fmt.Sprintf("%v", intermediate.Summary)
		}

		// Flatten topics
		result.Topics = flattenStringArray(intermediate.Topics)
	}

	if err := store.UpdateStorySummaryAndTopics(workCtx, job.ID, result.Summary, result.Topics); err != nil {
		log.Printf("Failed to save summary/topics (story %d): %v", job.ID, err)
	} else {
		log.Printf("Successfully saved summary and %d topics for story %d", len(result.Topics), job.ID)
	}
}

func runIngestion(ctx context.Context, client *hn.Client, store *storage.Store, aiClient *ai.OllamaClient, summaryQueue chan<- SummaryJob) {
	log.Println("Fetching top stories from HN front page...")

	// Fetch Top Stories (Ranked) - only top 20
	topIDs, err := client.GetTopStories(ctx)
	if err != nil {
		log.Printf("Failed to fetch top stories: %v", err)
		return
	}

	// Limit to top 20 only
	if len(topIDs) > TotalStories {
		topIDs = topIDs[:TotalStories]
	}
	log.Printf("Processing top %d front-page stories", len(topIDs))

	// Build rank map
	rankMap := make(map[int]int)
	for i, id := range topIDs {
		rankMap[id] = i + 1
	}

	// Clear ranks that are no longer in top list
	if err := store.ClearRanksNotIn(ctx, topIDs); err != nil {
		log.Printf("Failed to clear old ranks: %v", err)
	}

	// Update ranks for existing stories
	log.Println("Updating ranks...")
	if err := store.UpdateRanks(ctx, rankMap); err != nil {
		log.Printf("Failed to update ranks: %v", err)
	}

	// Start jobs
	jobs := make(chan int, len(topIDs))
	var wg sync.WaitGroup

	// Start workers
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for id := range jobs {
				select {
				case <-ctx.Done():
					return
				default:
					rank := rankMap[id]
					// Always summarize for top 20 in clean re-ingest
					rankPtr := &rank
					if err := processStory(ctx, client, store, id, rankPtr, summaryQueue); err != nil {
						log.Printf("Worker %d: Failed to process story %d: %v", workerID, id, err)
					}
				}
			}
		}(i)
	}

	for _, id := range topIDs {
		jobs <- id
	}
	close(jobs)
	wg.Wait()

	// Prune DB: keep only top 20 (protected: saved stories)
	log.Println("Pruning stories to top 20...")
	if err := store.PruneStories(ctx, TotalStories); err != nil {
		log.Printf("Failed to prune stories: %v", err)
	}

	log.Println("Ingestion run completed.")
}

// cleanupOldStories is kept for compatibility but no longer used in main flow.
func cleanupOldStories(ctx context.Context, store *storage.Store) {
	if err := store.PruneStories(ctx, TotalStories); err != nil {
		log.Printf("Failed to prune old stories: %v", err)
	}
}

func processStory(ctx context.Context, client *hn.Client, store *storage.Store, id int, rank *int, summaryQueue chan<- SummaryJob) error {
	item, err := client.GetItem(ctx, id)
	if err != nil {
		return err
	}

	if item.Type != "story" {
		return nil
	}

	// 1. Upsert Story
	story := storage.Story{
		ID:          int64(item.ID),
		Title:       item.Title,
		URL:         item.URL,
		Score:       item.Score,
		By:          item.By,
		Descendants: item.Descendants,
		PostedAt:    time.Unix(item.Time, 0),
		HNRank:      rank,
	}

	if err := store.UpsertStory(ctx, story); err != nil {
		return err
	}

	// 1.5 Enqueue for Auto-Summarization
	// CRITERIA:
	// 1. Must have URL
	// 2. Score > 10 (Filtering noise)
	// 3. No existing summary (Checked by worker? Or here? Better here to save queue space)

	if item.URL != "" && item.Score > 10 {
		// Queue for summarization if:
		// 1. No summary exists yet, OR
		// 2. Summary exists but topics are missing (re-process to get tags)
		existing, err := store.GetStory(ctx, id)
		needsSummary := err != nil || existing.Summary == nil || *existing.Summary == ""
		needsTopics := err == nil && existing.Summary != nil && *existing.Summary != "" && len(existing.Topics) == 0
		if needsSummary || needsTopics {
			select {
			case summaryQueue <- SummaryJob{ID: id, URL: item.URL, Title: item.Title}:
				if needsTopics {
					log.Printf("Re-queuing story %d for topic tagging", id)
				}
			default:
				log.Printf("Summary queue full, skipping story %d", id)
			}
		}
	}

	// 2. Upsert Story Author
	if item.By != "" {
		go processUser(ctx, client, store, item.By)
	}

	// 3. Process Comments
	if len(item.Kids) > 0 {
		processComments(ctx, client, store, item.Kids, int64(item.ID), nil)
	}

	return nil
}

func processComments(ctx context.Context, client *hn.Client, store *storage.Store, kids []int, storyID int64, parentID *int64) {
	// ... (unchanged) ...
	// Need to copy the original body of processComments here or it will be lost if I don't include it in ReplacementContent
	// Since I'm replacing from line 63 onwards, I need to include EVERYTHING after that.

	// WAIT: replace_file_content replaces a chunk.
	// I need to be careful. The original code has `processComments` at the end.
	// I should only replace `main`, `runIngestion` and `processStory`.
	// Leaving `processComments` and `processUser` alone if possible,
	// BUT `processComments` is called by `processStory` and calls itself.
	// The previous `processStory` implementation was ending around line 265.

	// Let me rewrite the whole file content from main downwards to be safe,
	// OR just target the block from `main` to `processStory` end.
	// `processComments` starts at line 267.

	// I will replace from line 63 (inside main) to line 265 (end of processStory).
	// And I need to update `main` signature too, so I should start from line 62.

	for _, kidID := range kids {
		// Fetch comment item
		item, err := client.GetItem(ctx, kidID)
		if err != nil {
			log.Printf("Failed to fetch comment %d: %v", kidID, err)
			continue
		}

		if item.Type != "comment" || item.Deleted || item.Dead {
			continue
		}

		// Upsert Comment
		comment := storage.Comment{
			ID:       int64(item.ID),
			StoryID:  storyID,
			ParentID: parentID,
			Text:     item.Text,
			By:       item.By,
			PostedAt: time.Unix(item.Time, 0),
		}

		if err := store.UpsertComment(ctx, comment); err != nil {
			log.Printf("Failed to upsert comment %d: %v", item.ID, err)
		}

		// Upsert Comment Author
		if item.By != "" {
			go processUser(ctx, client, store, item.By)
		}

		// Recursively process replies
		if len(item.Kids) > 0 {
			pID := int64(item.ID)
			processComments(ctx, client, store, item.Kids, storyID, &pID)
		}
	}
}

func processUser(ctx context.Context, client *hn.Client, store *storage.Store, username string) {
	userItem, err := client.GetUser(ctx, username)
	if err != nil {
		log.Printf("Failed to fetch user %s: %v", username, err)
		return
	}

	user := storage.User{
		ID:        userItem.ID, // User struct ID is a string (username)
		Created:   userItem.Created,
		Karma:     userItem.Karma,
		About:     userItem.About,
		Submitted: userItem.Submitted,
	}

	if err := store.UpsertUser(ctx, user); err != nil {
		log.Printf("Failed to upsert user %s: %v", username, err)
	}
}

// flattenStringArray handles various hallucinated JSON formats from LLMs (e.g., nested arrays like [["string"]])
func flattenStringArray(input interface{}) []string {
	if input == nil {
		return nil
	}
	var result []string
	switch v := input.(type) {
	case string:
		return []string{v}
	case []string:
		return v
	case []interface{}:
		for _, item := range v {
			if item == nil {
				continue
			}
			switch tv := item.(type) {
			case string:
				result = append(result, tv)
			case []interface{}:
				// Handle nested array: [["string"]] -> take first element
				if len(tv) > 0 {
					if s, ok := tv[0].(string); ok {
						result = append(result, s)
					}
				}
			}
		}
	}
	return result
}
