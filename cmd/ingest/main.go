package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/rajeshkumarblr/my_hn/internal/hn"
	"github.com/rajeshkumarblr/my_hn/internal/storage"
)

const (
	WorkerCount  = 20
	TotalStories = 500
)

func main() {
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

	log.Println("Starting Ingestion Service...")

	// Run initially
	runIngestion(ctx, client, store)

	// Ticker for periodic updates (every 15 minutes)
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("Shutting down ingestion service...")
			return
		case <-ticker.C:
			runIngestion(ctx, client, store)
		}
	}
}

func runIngestion(ctx context.Context, client *hn.Client, store *storage.Store) {
	log.Println("Fetching stories...")

	// Fetch Top Stories
	topIDs, err := client.GetTopStories(ctx)
	if err != nil {
		log.Printf("Failed to fetch top stories: %v", err)
	} else {
		log.Printf("Fetched %d top stories", len(topIDs))
	}

	// Fetch New Stories
	newIDs, err := client.GetNewStories(ctx)
	if err != nil {
		log.Printf("Failed to fetch new stories: %v", err)
	} else {
		log.Printf("Fetched %d new stories", len(newIDs))
	}

	// Combine and Deduplicate
	uniqueIDs := make(map[int]struct{})
	for _, id := range topIDs {
		uniqueIDs[id] = struct{}{}
	}
	for _, id := range newIDs {
		uniqueIDs[id] = struct{}{}
	}

	// Convert to slice
	var ids []int
	for id := range uniqueIDs {
		ids = append(ids, id)
	}

	log.Printf("Queuing %d unique stories for ingestion with %d workers...", len(ids), WorkerCount)

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
					if err := processStory(ctx, client, store, id); err != nil {
						log.Printf("Worker %d: Failed to process story %d: %v", workerID, id, err)
					}
				}
			}
		}(i)
	}

	// Enqueue jobs
	for _, id := range ids {
		jobs <- id
	}
	close(jobs)

	// Wait for workers to finish
	wg.Wait()
	log.Println("Ingestion run completed.")
}

func processStory(ctx context.Context, client *hn.Client, store *storage.Store, id int) error {
	item, err := client.GetItem(ctx, id)
	if err != nil {
		return err
	}

	// Only process stories
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
	}

	if err := store.UpsertStory(ctx, story); err != nil {
		return err
	}

	// 2. Upsert Story Author
	if item.By != "" {
		go processUser(ctx, client, store, item.By)
	}

	// 3. Process Comments (Kids)
	if len(item.Kids) > 0 {
		processComments(ctx, client, store, item.Kids, int64(item.ID), nil)
	}

	return nil
}

func processComments(ctx context.Context, client *hn.Client, store *storage.Store, kids []int, storyID int64, parentID *int64) {
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
