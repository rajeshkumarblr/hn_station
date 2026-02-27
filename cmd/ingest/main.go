package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"sort"
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
	WorkerCount  = 1
	TotalStories = 100
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
		ollamaURL = "http://ollama:11434"
	}
	summaryQueue := make(chan SummaryJob, 500)

	// Create a shared rate limiter for Ollama
	limiter := time.NewTicker(5 * time.Second)
	defer limiter.Stop()

	var workerWg sync.WaitGroup
	for i := 0; i < WorkerCount; i++ {
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

	// Truncate content for CPU inference speed (6000 chars ~ 1500 words)
	textContent := fetchRes.Content
	if len(textContent) > 20000 {
		textContent = textContent[:20000] + "..."
	}

	// Use unified GenerateSummary which takes title and text
	responseStr, err := aiClient.GenerateSummary(workCtx, ollamaURL, job.Title, textContent)
	if err != nil {
		log.Printf("Failed to generate summary (story %d): %v", job.ID, err)
		return
	}

	// Try to parse the JSON (assuming Ollama phi3 outputs it directly)
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
		log.Printf("Failed to parse JSON for story %d. Error: %v. Raw response: %s", job.ID, err, responseStr)
		result.Summary = responseStr // Fallback
		result.Topics = []string{}
	} else {
		// Handle Summary being either a string or an array of strings
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

	if err := store.UpdateStorySummaryAndTopics(workCtx, job.ID, result.Summary, result.Topics); err != nil {
		log.Printf("Failed to save summary/topics (story %d): %v", job.ID, err)
	} else {
		log.Printf("Successfully saved summary and %d topics for story %d", len(result.Topics), job.ID)
	}
}

func runIngestion(ctx context.Context, client *hn.Client, store *storage.Store, aiClient *ai.OllamaClient, summaryQueue chan<- SummaryJob) {
	log.Println("Fetching stories...")

	// Fetch Top Stories (Ranked)
	topIDs, err := client.GetTopStories(ctx)
	if err != nil {
		log.Printf("Failed to fetch top stories: %v", err)
	} else {
		log.Printf("Fetched %d top stories", len(topIDs))
		if err := store.ClearRanksNotIn(ctx, topIDs); err != nil {
			log.Printf("Failed to clear old ranks: %v", err)
		}
	}

	// Fetch New Stories
	newIDs, err := client.GetNewStories(ctx)
	if err != nil {
		log.Printf("Failed to fetch new stories: %v", err)
	} else {
		log.Printf("Fetched %d new stories", len(newIDs))
	}

	// Map IDs to their Rank
	rankMap := make(map[int]int)
	for i, id := range topIDs {
		rankMap[id] = i + 1
	}

	// IMMEDIATE UPDATE: Update ranks
	log.Println("Updating ranks for existing stories...")
	if err := store.UpdateRanks(ctx, rankMap); err != nil {
		log.Printf("Failed to update ranks: %v", err)
	}

	// Combine and Deduplicate
	uniqueIDs := make(map[int]struct{})
	for _, id := range topIDs {
		uniqueIDs[id] = struct{}{}
	}
	for _, id := range newIDs {
		uniqueIDs[id] = struct{}{}
	}

	// Sort IDs by Rank before processing
	var ids []int
	for id := range uniqueIDs {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool {
		rI, hasI := rankMap[ids[i]]
		rJ, hasJ := rankMap[ids[j]]
		if hasI && hasJ {
			return rI < rJ
		}
		if hasI {
			return true
		}
		if hasJ {
			return false
		}
		return ids[i] > ids[j] // Fallback to newer IDs
	})

	// Truncate to a reasonable number to avoid heavy backlogs (e.g. 200)
	if len(ids) > 200 {
		ids = ids[:200]
	}

	log.Printf("Queuing %d unique stories for ingestion (prioritizing by rank)...", len(ids))

	// OPTIMIZATION: Check which stories already have summaries in the DB
	statusMap, err := store.GetStoriesStatus(ctx, ids)
	if err != nil {
		log.Printf("Failed to fetch story statuses: %v", err)
		statusMap = make(map[int]bool) // Fallback to processing all
	}

	jobs := make(chan int, len(ids))
	var wg sync.WaitGroup

	// Start workers
	for i := 0; i < WorkerCount; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for id := range jobs {
				select {
				case <-ctx.Done():
					return
				default:
					rank, hasRank := rankMap[id]
					hasSummary := statusMap[id]

					// SKIP CRITERIA:
					// 1. If it has a summary AND it's not in the top 50 (to keep top stories fresh)
					// 2. OR if it has a summary and no rank (older "New" stories)
					if hasSummary && (!hasRank || rank > 50) {
						continue
					}

					var rankPtr *int
					if hasRank {
						rankPtr = &rank
					}

					if err := processStory(ctx, client, store, id, rankPtr, summaryQueue); err != nil {
						log.Printf("Worker %d: Failed to process story %d: %v", workerID, id, err)
					}
				}
			}
		}(i)
	}

	for _, id := range ids {
		jobs <- id
	}
	close(jobs)
	wg.Wait()

	// Cleanup old stories: Keep only top 100
	log.Println("Cleaning up old stories (keeping only top 100)...")
	cleanupOldStories(ctx, store)

	log.Println("Ingestion run completed.")
}

func cleanupOldStories(ctx context.Context, store *storage.Store) {
	if err := store.PruneStories(ctx, 100); err != nil {
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
		// Optimization: Check if summary exists before queuing
		// This adds a DB read, but saves the queue from being flooded with already-summarized items
		existing, err := store.GetStory(ctx, id)
		if err == nil && (existing.Summary == nil || *existing.Summary == "") {
			select {
			case summaryQueue <- SummaryJob{ID: id, URL: item.URL, Title: item.Title}:
				// Queued successfully
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
