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
	"io"
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

	"github.com/joho/godotenv"
	"github.com/rajeshkumarblr/hn_station/internal/ai"
	"github.com/rajeshkumarblr/hn_station/internal/api"
	"github.com/rajeshkumarblr/hn_station/internal/auth"
	"github.com/rajeshkumarblr/hn_station/internal/content"
	"github.com/rajeshkumarblr/hn_station/internal/hn"
	"github.com/rajeshkumarblr/hn_station/internal/storage"
)

const (
	workerCount  = 3
	totalStories = 100 // Keep top 100 front-page stories
)

func main() {
	dbPath := flag.String("db", defaultDBPath(), "Path to SQLite database file")
	port := flag.String("port", "58090", "HTTP port (0 = OS picks a free port in interactive mode)")
	ollamaURL := flag.String("ollama", "http://localhost:11434", "Ollama base URL")
	interval := flag.Duration("interval", 5*time.Minute, "Ingestion interval")
	flag.Parse()

	if err := os.MkdirAll(filepath.Dir(*dbPath), 0755); err != nil {
		log.Printf("Warning: failed to create DB directory: %v", err)
	}

	// Setup file logging
	logFile, err := setupLogging(*dbPath)
	if err != nil {
		log.Printf("Warning: failed to setup file logging: %v", err)
	} else if logFile != nil {
		defer logFile.Close()
	}

	runInteractive(*dbPath, *port, *ollamaURL, *interval)
}

func setupLogging(dbPath string) (*os.File, error) {
	logDir := filepath.Dir(dbPath)
	logPath := filepath.Join(logDir, "hn-backend.log")

	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}

	// Log to both file and current stderr (captured by Electron in dev)
	log.SetOutput(f)
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
	log.Println("--- BACKEND STARTUP ---")
	return f, nil
}

func runInteractive(dbPath, port, ollamaURL string, interval time.Duration) {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Special case: if port is 0, we need to print LISTENING:port for Electron
	var listener net.Listener
	var err error
	if port == "0" {
		listener, err = net.Listen("tcp", ":0")
		if err != nil {
			log.Fatalf("listen: %v", err)
		}
		actualPort := listener.Addr().(*net.TCPAddr).Port
		fmt.Fprintf(os.Stdout, "LISTENING:%d\n", actualPort)
		os.Stdout.Sync()
	} else {
		listener, err = net.Listen("tcp", ":"+port)
		if err != nil {
			log.Fatalf("listen: %v", err)
		}
	}

	log.Printf("Starting backend on %s", listener.Addr())
	run(ctx, dbPath, ollamaURL, interval, listener)
}

func run(ctx context.Context, dbPath, ollamaURL string, interval time.Duration, listener net.Listener) error {
	// Load environment if .env exists
	_ = godotenv.Load()

	// Initialize database
	store, err := storage.NewSQLite(dbPath)
	if err != nil {
		return fmt.Errorf("storage: %v", err)
	}

	// Initialize HN Client
	hnClient := hn.NewClient()

	// Initialize AI Clients
	ollamaClient := ai.NewOllamaClient()
	geminiClient := ai.NewGeminiClient()

	// Start Ingestion Worker
	summaryQueue := make(chan summaryJob, 100)
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		log.Printf("[ingest] Starting worker loop (interval: %v)...", interval)
		// Run immediately on start
		log.Println("[ingest] Triggering initial run...")
		runIngestion(ctx, hnClient, store, summaryQueue)

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				runIngestion(ctx, hnClient, store, summaryQueue)
			}
		}
	}()

	// Start Summary Workers
	limiter := time.NewTicker(2 * time.Second)
	defer limiter.Stop()
	for i := 0; i < workerCount; i++ {
		go runSummaryWorker(i, ctx, store, ollamaClient, geminiClient, ollamaURL, summaryQueue, limiter)
	}

	// Start API Server
	authCfg := auth.NewLocalConfig()
	srv := api.NewServer(store, authCfg, ollamaClient, geminiClient, true) // localMode = true

	httpSrv := &http.Server{
		Addr:    listener.Addr().String(),
		Handler: srv, // Server implements ServeHTTP
	}

	go func() {
		if err := httpSrv.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("[server] Error: %v", err)
		}
	}()

	log.Printf("[server] API server listening on %s", listener.Addr())

	<-ctx.Done()
	log.Println("[server] Shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return httpSrv.Shutdown(shutdownCtx)
}

func defaultDBPath() string {
	newDir, _ := os.UserConfigDir()
	// Match Electron's app.setName('HN Station')
	newPath := filepath.Join(newDir, "HN Station", "hn.db")

	// 1. If the new standard path already has a database, use it.
	if _, err := os.Stat(newPath); err == nil {
		return newPath
	}

	// 2. Check for intermediate "no-space" version (from last update)
	noSpacePath := filepath.Join(newDir, "HNStation", "hn.db")
	if _, err := os.Stat(noSpacePath); err == nil {
		log.Printf("[migration] Detected no-space database at %s. Moving to %s...", noSpacePath, newPath)
		if err := migrateFile(noSpacePath, newPath); err == nil {
			return newPath
		}
	}

	// 2. New file doesn't exist. Check for legacy ProgramData database.
	pd := os.Getenv("PROGRAMDATA")
	if pd == "" {
		pd = "C:\\ProgramData"
	}
	legacyPath := filepath.Join(pd, "HNStation", "hn.db")
	if info, err := os.Stat(legacyPath); err == nil && !info.IsDir() {
		// Attempt migration (copy)
		log.Printf("[migration] Detected legacy database at %s. Moving to %s...", legacyPath, newPath)
		if err := migrateFile(legacyPath, newPath); err == nil {
			log.Println("[migration] Successfully migrated database to new location.")
			return newPath
		}
		log.Printf("[migration] WARNING: Copy failed: %v. Using legacy path for now.", err)
		return legacyPath
	}

	// 3. Brand new installation, use standard Electron path.
	return newPath
}

func migrateFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	s, err := os.Open(src)
	if err != nil {
		return err
	}
	defer s.Close()
	d, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer d.Close()
	_, err = io.Copy(d, s)
	return err
}

// ── Ingestion ──────────────────────────────────────────────────────────────────

type summaryJob struct {
	ID    int
	URL   string
	Title string
}

func runSummaryWorker(id int, ctx context.Context, store storage.DB, aiClient *ai.OllamaClient, geminiClient *ai.GeminiClient, ollamaURL string, jobs <-chan summaryJob, limiter *time.Ticker) {
	for {
		select {
		case <-ctx.Done():
			return
		case job, ok := <-jobs:
			if !ok {
				return
			}
			<-limiter.C
			processSummary(ctx, store, aiClient, geminiClient, ollamaURL, job)
		}
	}
}

func processSummary(ctx context.Context, store storage.DB, aiClient *ai.OllamaClient, geminiClient *ai.GeminiClient, ollamaURL string, job summaryJob) {
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

	// Determine provider preference
	provider, _ := store.GetSetting(workCtx, "ai_provider")
	if provider == "" {
		provider = "local"
	}

	var responseStr string
	var summarizeErr error

	// 1. Try Local Ollama if provider is "local" or "both"
	if provider == "local" || provider == "both" {
		model, _ := store.GetSetting(workCtx, "ollama_model")
		responseStr, err = aiClient.GenerateSummary(workCtx, ollamaURL, model, job.Title, text)
		if err != nil {
			summarizeErr = err
			log.Printf("[ingest] Ollama error for story %d: %v", job.ID, err)
		}
	}

	// 2. Fallback to Gemini if:
	// - Local failed OR provider is "gemini"
	// - AND provider is "gemini" or "both"
	if responseStr == "" && (provider == "gemini" || provider == "both") {
		geminiKey, _ := store.GetSetting(workCtx, "gemini_api_key")
		if geminiKey == "" {
			geminiKey = os.Getenv("GEMINI_API_KEY")
		}

		if geminiKey != "" {
			log.Printf("[ingest] Falling back to Gemini for story %d...", job.ID)
			responseStr, err = geminiClient.GenerateSummary(workCtx, geminiKey, text)
			if err != nil {
				log.Printf("[ingest] Gemini error for story %d: %v", job.ID, err)
				summarizeErr = err
			}
		} else {
			log.Printf("[ingest] Gemini fallback skipped (No API Key) for story %d", job.ID)
		}
	}

	if responseStr == "" {
		log.Printf("[ingest] All AI providers failed for story %d: %v", job.ID, summarizeErr)
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
		// Only queue for summary if AI features are enabled in settings
		aiEnabled := false
		if val, err := store.GetSetting(ctx, "ai_summaries_enabled"); err == nil && val == "true" {
			aiEnabled = true
		}

		if aiEnabled {
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
