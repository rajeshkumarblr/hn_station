// cmd/local/main.go — Self-contained HN Station local backend
// Runs both the API server and ingestion worker in a single process using SQLite.
// Designed to be bundled inside the Electron desktop app.
//
// Usage:
//
//	hn-local [--db PATH] [--port PORT] [--ollama URL] [--interval DURATION]
//
// On startup it prints "LISTENING:<port>" to stdout so Electron can read the port.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/rajeshkumarblr/hn_station/internal/ai"
	"github.com/rajeshkumarblr/hn_station/internal/api"
	"github.com/rajeshkumarblr/hn_station/internal/auth"
	"github.com/rajeshkumarblr/hn_station/internal/content"
	"github.com/rajeshkumarblr/hn_station/internal/hn"
	"github.com/rajeshkumarblr/hn_station/internal/storage"
)

const (
	workerCount  = 3
	totalStories = 30 // Keep top 30 front-page stories
)

func main() {
	// ── Flags ──────────────────────────────────────────────────────────────────
	dbPath := flag.String("db", defaultDBPath(), "Path to SQLite database file")
	port := flag.String("port", "0", "HTTP port (0 = OS picks a free port)")
	ollamaURL := flag.String("ollama", "http://localhost:11434", "Ollama base URL")
	interval := flag.Duration("interval", 5*time.Minute, "Ingestion interval")
	flag.Parse()

	// ── DB ─────────────────────────────────────────────────────────────────────
	if err := os.MkdirAll(filepath.Dir(*dbPath), 0755); err != nil {
		log.Fatalf("create db dir: %v", err)
	}
	store, err := storage.NewSQLite(*dbPath)
	if err != nil {
		log.Fatalf("open sqlite: %v", err)
	}
	log.Printf("Database: %s", *dbPath)

	// ── Context / shutdown ─────────────────────────────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Shutdown signal received")
		cancel()
	}()

	// ── Ingestion worker ───────────────────────────────────────────────────────
	hnClient := hn.NewClient()
	aiClient := ai.NewOllamaClient()
	summaryQueue := make(chan summaryJob, 100)
	limiter := time.NewTicker(500 * time.Millisecond)
	defer limiter.Stop()

	var workerWg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		workerWg.Add(1)
		go func(id int) {
			defer workerWg.Done()
			runSummaryWorker(id, ctx, store, aiClient, *ollamaURL, summaryQueue, limiter)
		}(i)
	}

	// Run initial ingestion synchronously so the app has data on first launch
	log.Println("Running initial ingestion...")
	runIngestion(ctx, hnClient, store, summaryQueue)

	// Periodic ingestion ticker
	go func() {
		ticker := time.NewTicker(*interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				close(summaryQueue)
				workerWg.Wait()
				return
			case <-ticker.C:
				runIngestion(ctx, hnClient, store, summaryQueue)
			}
		}
	}()

	// ── HTTP server ────────────────────────────────────────────────────────────
	// Use a stub auth config (no OAuth in local mode)
	authCfg := auth.NewLocalConfig()
	server := api.NewServer(store, authCfg, aiClient, true /* localMode */)

	// Listen on a free port if port=0
	listener, err := net.Listen("tcp", ":"+*port)
	if err != nil {
		log.Fatalf("listen: %v", err)
	}
	actualPort := listener.Addr().(*net.TCPAddr).Port

	// Print port to stdout so Electron can read it
	fmt.Printf("LISTENING:%d\n", actualPort)
	log.Printf("Local API server on http://localhost:%d", actualPort)

	srv := &http.Server{Handler: server}
	go func() {
		if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTP server error: %v", err)
		}
	}()

	// Wait for shutdown
	<-ctx.Done()
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutCancel()
	srv.Shutdown(shutCtx)
	log.Println("Local server stopped")
}

// defaultDBPath returns ~/.hn-station/hn.db
func defaultDBPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "hn.db"
	}
	return filepath.Join(home, ".hn-station", "hn.db")
}

// ── Ingestion ──────────────────────────────────────────────────────────────────

type summaryJob struct {
	ID    int
	URL   string
	Title string
}

func runSummaryWorker(id int, ctx context.Context, store storage.DB, aiClient *ai.OllamaClient, ollamaURL string, jobs <-chan summaryJob, limiter *time.Ticker) {
	for {
		select {
		case <-ctx.Done():
			return
		case job, ok := <-jobs:
			if !ok {
				return
			}
			<-limiter.C
			processSummary(ctx, store, aiClient, ollamaURL, job)
		}
	}
}

func processSummary(ctx context.Context, store storage.DB, aiClient *ai.OllamaClient, ollamaURL string, job summaryJob) {
	log.Printf("[ingest] Summarising story %d: %s", job.ID, job.Title)

	workCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()

	fetchRes, err := content.FetchArticle(job.URL)
	if err != nil || len(fetchRes.Content) < 100 {
		log.Printf("[ingest] Skip story %d (fetch failed or too short)", job.ID)
		return
	}

	text := fetchRes.Content
	if len(text) > 8000 {
		text = text[:8000] + "..."
	}

	responseStr, err := aiClient.GenerateSummary(workCtx, ollamaURL, job.Title, text)
	if err != nil {
		log.Printf("[ingest] Ollama error for story %d: %v", job.ID, err)
		return
	}

	cleanJSON := strings.TrimSpace(responseStr)
	if i := strings.Index(cleanJSON, "{"); i != -1 {
		if j := strings.LastIndex(cleanJSON, "}"); j > i {
			cleanJSON = cleanJSON[i : j+1]
		}
	}
	cleanJSON = strings.TrimPrefix(strings.TrimSuffix(strings.TrimSpace(strings.TrimPrefix(cleanJSON, "```json")), "```"), "```")

	var intermediate struct {
		Summary interface{} `json:"summary"`
		Topics  []string    `json:"topics"`
	}
	var finalSummary string
	var finalTopics []string

	if err := json.Unmarshal([]byte(cleanJSON), &intermediate); err != nil {
		finalSummary = responseStr
	} else {
		parts := flattenStrings(intermediate.Summary)
		for i, p := range parts {
			p = strings.TrimSpace(p)
			if !strings.HasPrefix(p, "-") {
				p = "- " + p
			}
			parts[i] = p
		}
		finalSummary = strings.Join(parts, "\n")
		finalTopics = flattenStrings(intermediate.Topics)
	}

	if err := store.UpdateStorySummaryAndTopics(workCtx, job.ID, finalSummary, finalTopics); err != nil {
		log.Printf("[ingest] Save summary error story %d: %v", job.ID, err)
	} else {
		log.Printf("[ingest] Saved summary + %d topics for story %d", len(finalTopics), job.ID)
	}
}

func runIngestion(ctx context.Context, client *hn.Client, store storage.DB, summaryQueue chan<- summaryJob) {
	log.Println("[ingest] Fetching top stories...")
	topIDs, err := client.GetTopStories(ctx)
	if err != nil {
		log.Printf("[ingest] Failed to fetch top stories: %v", err)
		return
	}
	if len(topIDs) > totalStories {
		topIDs = topIDs[:totalStories]
	}

	rankMap := make(map[int]int, len(topIDs))
	for i, id := range topIDs {
		rankMap[id] = i + 1
	}

	if err := store.ClearRanksNotIn(ctx, topIDs); err != nil {
		log.Printf("[ingest] ClearRanks: %v", err)
	}
	if err := store.UpdateRanks(ctx, rankMap); err != nil {
		log.Printf("[ingest] UpdateRanks: %v", err)
	}

	jobs := make(chan int, len(topIDs))
	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for id := range jobs {
				select {
				case <-ctx.Done():
					return
				default:
					rank := rankMap[id]
					if err := processStory(ctx, client, store, id, &rank, summaryQueue); err != nil {
						log.Printf("[ingest] Story %d: %v", id, err)
					}
				}
			}
		}()
	}
	for _, id := range topIDs {
		jobs <- id
	}
	close(jobs)
	wg.Wait()

	if err := store.PruneStories(ctx, 7); err != nil {
		log.Printf("[ingest] Prune: %v", err)
	}
	log.Println("[ingest] Run complete")
}

func processStory(ctx context.Context, client *hn.Client, store storage.DB, id int, rank *int, summaryQueue chan<- summaryJob) error {
	item, err := client.GetItem(ctx, id)
	if err != nil {
		return err
	}
	if item.Type != "story" {
		return nil
	}

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

	if item.URL != "" && item.Score > 10 {
		existing, err := store.GetStory(ctx, id)
		needsSummary := err != nil || existing.Summary == nil || *existing.Summary == ""
		needsTopics := err == nil && existing.Summary != nil && *existing.Summary != "" && len(existing.Topics) == 0
		if needsSummary || needsTopics {
			select {
			case summaryQueue <- summaryJob{ID: id, URL: item.URL, Title: item.Title}:
			default:
				log.Printf("[ingest] Summary queue full, skipping story %d", id)
			}
		}
	}

	// Process comments
	if len(item.Kids) > 0 {
		processComments(ctx, client, store, item.Kids, int64(item.ID), nil)
	}

	return nil
}

func processComments(ctx context.Context, client *hn.Client, store storage.DB, kids []int, storyID int64, parentID *int64) {
	for _, kidID := range kids {
		item, err := client.GetItem(ctx, kidID)
		if err != nil || item.Type != "comment" || item.Deleted || item.Dead {
			continue
		}
		comment := storage.Comment{
			ID:       int64(item.ID),
			StoryID:  storyID,
			ParentID: parentID,
			Text:     item.Text,
			By:       item.By,
			PostedAt: time.Unix(item.Time, 0),
		}
		if err := store.UpsertComment(ctx, comment); err != nil {
			log.Printf("[ingest] UpsertComment %d: %v", item.ID, err)
		}
		if len(item.Kids) > 0 {
			pID := int64(item.ID)
			processComments(ctx, client, store, item.Kids, storyID, &pID)
		}
	}
}

func flattenStrings(input interface{}) []string {
	if input == nil {
		return nil
	}
	switch v := input.(type) {
	case string:
		return []string{v}
	case []string:
		return v
	case []interface{}:
		var result []string
		for _, item := range v {
			switch tv := item.(type) {
			case string:
				result = append(result, tv)
			case []interface{}:
				if len(tv) > 0 {
					if s, ok := tv[0].(string); ok {
						result = append(result, s)
					}
				}
			}
		}
		return result
	}
	return nil
}
