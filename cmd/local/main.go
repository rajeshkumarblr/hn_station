// cmd/local/main.go — Self-contained HN Station local backend
// Runs both the API server and ingestion worker in a single process using SQLite.
// Designed to be bundled inside the Electron desktop app.
package main

import (
	"container/heap"
	"context"
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
	Version      = "v1.0.0-RC38"
	workerCount  = 1
	totalStories = 100 // Keep top 100 front-page stories
)

func clearPoisonedSummaries(ctx context.Context, store storage.DB) error {
	return store.ClearPoisonedSummaries(ctx)
}

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

	log.SetOutput(f)
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
	log.Printf("--- BACKEND STARTUP (PID: %d) [%s] ---", os.Getpid(), Version)
	return f, nil
}

func runInteractive(dbPath, port, ollamaURL string, interval time.Duration) {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

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
	_ = godotenv.Load()

	store, err := storage.NewSQLite(dbPath)
	if err != nil {
		return fmt.Errorf("storage: %v", err)
	}

	hnClient := hn.NewClient()
	ollamaClient := ai.NewOllamaClient()
	geminiClient := ai.NewGeminiClient()

	authCfg := auth.NewLocalConfig()
	status := &api.IngestStatus{AIStatus: "Ready"}
	summaryManager := NewSummaryManager(status)
	srv := api.NewServer(store, authCfg, ollamaClient, geminiClient, true, summaryManager, status)

	if err := clearPoisonedSummaries(ctx, store); err != nil {
		log.Printf("[ingest] Failed to clear poisoned summaries: %v", err)
	}
    
	// Pruning is disabled to allow the database to grow indefinitely.
	/*
	log.Println("Pruning stories older than 7 days...")
	if err := store.PruneStories(ctx, 7); err != nil {
		log.Printf("Failed to prune stories: %v", err)
	}
	*/

	go func() {
		log.Printf("[ingest] Starting worker loop...")
		for {
			intervalStr, _ := store.GetSetting(ctx, "refresh_interval")
			currentInterval := 5 * time.Minute
			if intervalStr != "" {
				if d, err := time.ParseDuration(intervalStr); err == nil {
					currentInterval = d
				}
			}

			srv.Status.NextRefreshAt = time.Now().Add(currentInterval)
			srv.Status.IsRefreshing = true
			runIngestion(ctx, hnClient, store, summaryManager)
			srv.Status.IsRefreshing = false
			srv.Status.LastRefreshAt = time.Now()

			select {
			case <-ctx.Done():
				return
			case <-time.After(currentInterval):
			}
		}
	}()

	limiter := time.NewTicker(6 * time.Second)
	defer limiter.Stop()
	for i := 0; i < workerCount; i++ {
		go runSummaryWorker(i, ctx, store, ollamaClient, geminiClient, ollamaURL, summaryManager, limiter)
	}

	httpSrv := &http.Server{
		Addr:    listener.Addr().String(),
		Handler: srv,
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
	newPath := filepath.Join(newDir, "HN Station", "hn.db")
	markerPath := filepath.Join(newDir, "HN Station", ".migrated_v0.9.2")
	if _, err := os.Stat(markerPath); err == nil {
		return newPath
	}
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
	Rank  int
}

type jobHeap []summaryJob
func (h jobHeap) Len() int           { return len(h) }
func (h jobHeap) Less(i, j int) bool { return h[i].Rank < h[j].Rank }
func (h jobHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *jobHeap) Push(x interface{}) { *h = append(*h, x.(summaryJob)) }
func (h *jobHeap) Pop() interface{} {
	old := *h
	n := len(old)
	x := old[n-1]
	*h = old[0 : n-1]
	return x
}

type SummaryManager struct {
	mu           sync.Mutex
	cond         *sync.Cond
	heap         jobHeap
	status       *api.IngestStatus
	BackoffUntil time.Time
	activeCancel context.CancelFunc
	pendingIDs   map[int]bool
}

func NewSummaryManager(status *api.IngestStatus) *SummaryManager {
	sm := &SummaryManager{
		status:     status,
		pendingIDs: make(map[int]bool),
	}
	sm.cond = sync.NewCond(&sm.mu)
	heap.Init(&sm.heap)
	return sm
}

func (sm *SummaryManager) Push(job summaryJob) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	if sm.pendingIDs[job.ID] {
		return // Already in queue or being processed
	}
	
	sm.pendingIDs[job.ID] = true
	heap.Push(&sm.heap, job)
	sm.status.AutoSummarizeQueue = sm.heap.Len()
	sm.cond.Signal()
}

func (sm *SummaryManager) Pop() (summaryJob, bool) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	for sm.heap.Len() == 0 {
		sm.cond.Wait()
	}
	// Skip backoff for local provider (Ollama)
	// We only backoff for Gemini (non-local) if needed.
	
	if sm.heap.Len() == 0 { return summaryJob{}, false }
	job := heap.Pop(&sm.heap).(summaryJob)
	// Note: We KEEP it in pendingIDs while processing!
	sm.status.AutoSummarizeQueue = sm.heap.Len()
	return job, true
}

func (sm *SummaryManager) MarkDone(id int) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	delete(sm.pendingIDs, id)
}

func (sm *SummaryManager) Prioritize(ids []int) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if len(ids) == 0 { return }
	idMap := make(map[int]bool)
	for _, id := range ids { idMap[id] = true }
	changed := false
	for i := range sm.heap {
		if idMap[sm.heap[i].ID] {
			sm.heap[i].Rank = -1
			changed = true
		}
	}
	if changed {
		heap.Init(&sm.heap)
	}
}

func (sm *SummaryManager) RegisterCancel(cf context.CancelFunc) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.activeCancel = cf
}

func (sm *SummaryManager) CancelOngoing() {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if sm.activeCancel != nil {
		sm.activeCancel()
		sm.activeCancel = nil
	}
}

func runSummaryWorker(id int, ctx context.Context, store storage.DB, aiClient *ai.OllamaClient, geminiClient *ai.GeminiClient, ollamaURL string, manager *SummaryManager, limiter *time.Ticker) {
	log.Printf("[worker %d] Started successfully", id)
	for {
		job, ok := manager.Pop()
		if !ok { return }

		// Wrap in func to ensure cleanup happens every iteration
		func() {
			defer manager.MarkDone(job.ID)

			enabled, _ := store.GetSetting(ctx, "auto_summarize_enabled")
			if enabled == "false" { return }

			provider, _ := store.GetSetting(ctx, "ai_provider")
			if provider != "local" {
				select {
				case <-ctx.Done(): return
				case <-limiter.C:
				}
			}

			manager.status.AIStatus = "Busy"
			manager.status.CurrentTask = fmt.Sprintf("Article #%d: %s", job.Rank, job.Title)
			jobCtx, jobCancel := context.WithCancel(ctx)
			manager.RegisterCancel(jobCancel)

			err := processSummary(jobCtx, store, aiClient, geminiClient, ollamaURL, job)
			jobCancel()
			manager.RegisterCancel(nil)

			if err != nil {
				wait := 5 * time.Minute
				isQuota := false
				if re, ok := err.(*ai.RateLimitError); ok {
					isQuota = true
					log.Printf("[ingest] Gemini error for story %d: %v", job.ID, err)
					if re.RetryAfter > 0 {
						wait = re.RetryAfter + 5*time.Second
					}
				} else if strings.Contains(strings.ToLower(err.Error()), "429") || strings.Contains(strings.ToLower(err.Error()), "quota") {
					isQuota = true
					log.Printf("[ingest] Gemini quota reached for story %d: %v", job.ID, err)
				}

				if isQuota {
					// Pushing it back will re-add to pendingIDs via Push()
					// But we are about to call MarkDone via defer.
					// So we need to be careful.
					// Actually, calling Push() will return early if it's still in pendingIDs.
					// And then defer will remove it.
					// Best to call MarkDone BEFORE Push if retrying?
					// No, if we call MarkDone then Push, it's safe.
					manager.MarkDone(job.ID)
					manager.Push(job)
					manager.mu.Lock()
					manager.BackoffUntil = time.Now().Add(wait)
					manager.mu.Unlock()
				} else {
					log.Printf("[ingest] Summary failed for story %d: %v", job.ID, err)
				}
			}
			manager.status.AIStatus = "Ready"
			manager.status.CurrentTask = ""
		}()
	}
}

func processSummary(ctx context.Context, store storage.DB, aiClient *ai.OllamaClient, geminiClient *ai.GeminiClient, ollamaURL string, job summaryJob) error {
	// FINAL DEDUPLICATION: Check if already summarized in DB
	existing, err := store.GetStory(ctx, job.ID)
	if err == nil && existing.Summary != nil && *existing.Summary != "" && len(existing.Topics) > 0 {
		log.Printf("[ingest] Story %d already summarized, skipping.", job.ID)
		return nil
	}

	provider, _ := store.GetSetting(ctx, "ai_provider")
	if provider == "" { provider = "local" }
	log.Printf("[ingest] STUB: processSummary starting for story %d. Provider: %s", job.ID, provider)

	workCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()

	fetchRes, err := content.FetchArticle(job.URL)
	if err != nil || len(fetchRes.Content) < 100 {
		return nil
	}

	text := fetchRes.Content
	if len(text) > 12000 {
		text = text[:12000] + "..."
	}

	var responseStr string
	if provider == "local" || provider == "both" {
		if aiClient.CheckAvailability(workCtx, ollamaURL) {
			model, _ := store.GetSetting(workCtx, "ollama_model")
			responseStr, _ = aiClient.GenerateSummary(workCtx, ollamaURL, model, job.Title, text)
		}
	}

	// Gemini fallback has been COMPLETELY REMOVED as per user request to enforce local-only.

	if responseStr == "" { return nil }

	result := ai.ParseGreedyJSON(responseStr, int64(job.ID))
	finalSummary := strings.Join(result.Summary, "\n")
	finalTopics := result.Topics

	if len(finalTopics) == 0 {
		log.Printf("[ingest] WARNING: No topics found for story %d. Raw AI Response: \n---\n%s\n---", job.ID, responseStr)
	}

	if err := store.UpdateStorySummaryAndTopics(workCtx, job.ID, finalSummary, finalTopics); err != nil {
		return err
	}
	log.Printf("[ingest] Saved summary + %d topics for story %d", len(finalTopics), job.ID)
	return nil
}

func runIngestion(ctx context.Context, client *hn.Client, store storage.DB, summaryManager *SummaryManager) {
	log.Println("[ingest] Fetching top stories...")
	topIDs, err := client.GetTopStories(ctx)
	if err != nil { return }
	if len(topIDs) > totalStories { topIDs = topIDs[:totalStories] }

	rankMap := make(map[int]int, len(topIDs))
	for i, id := range topIDs { rankMap[id] = i + 1 }

	_ = store.ClearRanksNotIn(ctx, topIDs)
	_ = store.UpdateRanks(ctx, rankMap)

	jobs := make(chan int, len(topIDs))
	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for id := range jobs {
				select {
				case <-ctx.Done(): return
				default:
					rank := rankMap[id]
					_ = processStory(ctx, client, store, id, &rank, summaryManager)
				}
			}
		}()
	}
	for _, id := range topIDs { jobs <- id }
	close(jobs)
	wg.Wait()
	// We no longer prune stories in the desktop app to allow the local DB to grow indefinitely.
	// _ = store.PruneStories(ctx, 7)
}

func processStory(ctx context.Context, client *hn.Client, store storage.DB, id int, rank *int, summaryManager *SummaryManager) error {
	item, err := client.GetItem(ctx, id)
	if err != nil { return err }
	if item.Type != "story" { return nil }

	story := storage.Story{
		ID: int64(item.ID), Title: item.Title, URL: item.URL,
		Score: item.Score, By: item.By, Descendants: item.Descendants,
		PostedAt: time.Unix(item.Time, 0), HNRank: rank,
	}
	_ = store.UpsertStory(ctx, story)

	// NEW: Fetch comments during ingestion
	if len(item.Kids) > 0 {
		processComments(ctx, client, store, item.Kids, int64(item.ID), nil)
	}

	if item.URL != "" && item.Score > 10 {
		aiEnabled, _ := store.GetSetting(ctx, "ai_summaries_enabled")
		autoEnabled, _ := store.GetSetting(ctx, "auto_summarize_enabled")
		if aiEnabled != "false" && autoEnabled != "false" {
			existing, err := store.GetStory(ctx, id)
			needsSummary := err != nil || existing.Summary == nil || *existing.Summary == ""
			// If we have a summary but NO topics, we might want to re-run to get topics (one-time migration for new parser)
			// But to avoid infinite loops, we only do this if the story is very new (last 24h)
			if !needsSummary && len(existing.Topics) == 0 && time.Since(existing.CreatedAt) < 24*time.Hour {
				needsSummary = true
			}

			if needsSummary {
				summaryManager.Push(summaryJob{ID: id, URL: item.URL, Title: item.Title, Rank: *rank})
			}
		}
	}
	return nil
}

func processComments(ctx context.Context, client *hn.Client, store storage.DB, kids []int, storyID int64, parentID *int64) {
	for _, kidID := range kids {
		item, err := client.GetItem(ctx, kidID)
		if err != nil {
			log.Printf("[ingest] Failed to fetch comment %d: %v", kidID, err)
			continue
		}

		if item.Type != "comment" || item.Deleted || item.Dead {
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
			log.Printf("[ingest] Failed to upsert comment %d: %v", item.ID, err)
		}

		if len(item.Kids) > 0 {
			pID := int64(item.ID)
			processComments(ctx, client, store, item.Kids, storyID, &pID)
		}
	}
}
