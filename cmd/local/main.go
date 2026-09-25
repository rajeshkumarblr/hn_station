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
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
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
	Version                  = "v1.0.0-RC40"
	workerCount              = 1
	totalStories             = 40 // Keep top 40 front-page stories to minimize background network/CPU
	maxAutoSummariesPerCycle = 6  // Only auto-summarize top 6 stories per cycle to prevent sustained heat
	autoSummaryCooldown      = 35 * time.Second
)

// throttleLiteRTProcesses pins any running litert-lm processes to macOS Apple Silicon Efficiency (E) cores
// via `taskpolicy -b` and lowers their CPU scheduling priority via `renice +15` so they can never overheat the Mac.
func throttleLiteRTProcesses(ctx context.Context) {
	if runtime.GOOS != "darwin" {
		return
	}
	out, err := exec.CommandContext(ctx, "pgrep", "-f", "litert-lm").Output()
	if err != nil {
		return
	}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		pid := strings.TrimSpace(line)
		if pid == "" {
			continue
		}
		_ = exec.CommandContext(ctx, "/usr/sbin/taskpolicy", "-b", "-p", pid).Run()
		_ = exec.CommandContext(ctx, "renice", "+15", "-p", pid).Run()
	}
}

// isMacThermalSafe checks `pmset -g therm` on macOS to ensure the system has no thermal pressure before running background AI.
func isMacThermalSafe(ctx context.Context) bool {
	if runtime.GOOS != "darwin" {
		return true
	}
	checkCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	out, err := exec.CommandContext(checkCtx, "pmset", "-g", "therm").Output()
	if err != nil {
		return true
	}
	s := string(out)
	if strings.Contains(s, "Thermal warning level") && !strings.Contains(s, "No thermal warning level") {
		return false
	}
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "CPU_Speed_Limit") && !strings.HasSuffix(line, "100") {
			return false
		}
	}
	return true
}

func ensureLiteRTServer(ctx context.Context) {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:9379", 500*time.Millisecond)
	if err == nil {
		conn.Close()
		throttleLiteRTProcesses(ctx)
		log.Printf("[local] LiteRT-LM server already running on 127.0.0.1:9379 (pinned to Efficiency cores)")
		return
	}

	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, "litert-env", "bin", "litert-lm"),
		filepath.Join(home, ".virtualenvs", "litert-env", "bin", "litert-lm"),
		filepath.Join(home, "proj", "litert-env", "bin", "litert-lm"),
		filepath.Join(home, "proj", "hn_station", "litert-env", "bin", "litert-lm"),
		filepath.Join(home, "miniconda3", "envs", "litert-env", "bin", "litert-lm"),
		filepath.Join(home, "anaconda3", "envs", "litert-env", "bin", "litert-lm"),
		filepath.Join(home, "miniforge3", "envs", "litert-env", "bin", "litert-lm"),
		"/opt/homebrew/Caskroom/miniconda/base/envs/litert-env/bin/litert-lm",
		filepath.Join(home, ".local", "bin", "litert-lm"),
		"/opt/homebrew/bin/litert-lm",
	}

	var binPath string
	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && !info.IsDir() {
			binPath = c
			break
		}
	}

	if binPath == "" && home != "" {
		findCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
		out, err := exec.CommandContext(findCtx, "find", home, "-maxdepth", "4", "-name", "litert-lm", "-type", "f").Output()
		cancel()
		if err == nil {
			for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
				line = strings.TrimSpace(line)
				if line != "" {
					binPath = line
					break
				}
			}
		}
	}

	if binPath == "" {
		log.Printf("[local] Could not locate litert-lm binary to auto-start server on port 9379")
		return
	}

	log.Printf("[local] Auto-starting LiteRT-LM server on Efficiency cores: %s serve --port 9379", binPath)
	var cmd *exec.Cmd
	if runtime.GOOS == "darwin" {
		cmd = exec.CommandContext(ctx, "/usr/sbin/taskpolicy", "-b", "nice", "-n", "15", binPath, "serve", "--port", "9379")
	} else {
		cmd = exec.CommandContext(ctx, binPath, "serve", "--port", "9379")
	}
	if err := cmd.Start(); err != nil {
		log.Printf("[local] Failed to start litert-lm serve: %v", err)
		return
	}

	for i := 0; i < 15; i++ {
		time.Sleep(300 * time.Millisecond)
		if c, err := net.DialTimeout("tcp", "127.0.0.1:9379", 300*time.Millisecond); err == nil {
			c.Close()
			throttleLiteRTProcesses(ctx)
			log.Printf("[local] LiteRT-LM server is now listening on 127.0.0.1:9379 (PID %d, Efficiency cores)", cmd.Process.Pid)
			return
		}
	}
}

func clearPoisonedSummaries(ctx context.Context, store storage.DB) error {
	return store.ClearPoisonedSummaries(ctx)
}

func main() {
	// Cap Go backend to 1 CPU thread so background work stays ultra-cool
	runtime.GOMAXPROCS(1)

	dbPath := flag.String("db", defaultDBPath(), "Path to SQLite database file")
	port := flag.String("port", "58090", "HTTP port (0 = OS picks a free port in interactive mode)")
	ollamaURL := flag.String("ollama", "http://localhost:9379", "LiteRT-LM / Local AI base URL")
	interval := flag.Duration("interval", 10*time.Minute, "Ingestion interval")
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
	ensureLiteRTServer(ctx)

	store, err := storage.NewSQLite(dbPath)
	if err != nil {
		return fmt.Errorf("storage: %v", err)
	}

	hnClient := hn.NewClient()
	ollamaClient := ai.NewOllamaClient()

	authCfg := auth.NewLocalConfig()
	status := &api.IngestStatus{AIStatus: "Ready"}
	summaryManager := NewSummaryManager(status)
	srv := api.NewServer(store, authCfg, ollamaClient, true, summaryManager, status)

	if err := clearPoisonedSummaries(ctx, store); err != nil {
		log.Printf("[ingest] Failed to clear poisoned summaries: %v", err)
	}

	// Ensure auto-summarization on ingestion is enabled by default for local AI
	_ = store.SetSetting(ctx, "ai_summaries_enabled", "true")
	_ = store.SetSetting(ctx, "auto_summarize_enabled", "true")

	// Immediately enqueue any existing top stories in SQLite that lack summaries
	enqueueExistingUnsummarized(ctx, store, summaryManager)
    
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

	for i := 0; i < workerCount; i++ {
		go runSummaryWorker(i, ctx, store, ollamaClient, ollamaURL, summaryManager)
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
	if sm.heap.Len() == 0 { return summaryJob{}, false }
	job := heap.Pop(&sm.heap).(summaryJob)
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

func enqueueExistingUnsummarized(ctx context.Context, store storage.DB, summaryManager *SummaryManager) {
	stories, _, err := store.GetStories(ctx, maxAutoSummariesPerCycle, 0, "default", nil, "any", "", "", false)
	if err != nil {
		log.Printf("[ingest] Failed to query existing stories for startup auto-summary: %v", err)
		return
	}
	enqueued := 0
	for i, s := range stories {
		if enqueued >= maxAutoSummariesPerCycle {
			break
		}
		needsSummary := s.Summary == nil || strings.TrimSpace(*s.Summary) == "" || len(s.Topics) == 0
		if needsSummary {
			rank := i + 1
			if s.HNRank != nil && *s.HNRank > 0 {
				rank = *s.HNRank
			}
			summaryManager.Push(summaryJob{
				ID:    int(s.ID),
				URL:   s.URL,
				Title: s.Title,
				Rank:  rank,
			})
			enqueued++
		}
	}
	if enqueued > 0 {
		log.Printf("[ingest] Enqueued top %d unsummarized stories on startup (throttled)", enqueued)
	}
}

func runSummaryWorker(id int, ctx context.Context, store storage.DB, aiClient *ai.OllamaClient, ollamaURL string, manager *SummaryManager) {
	log.Printf("[worker %d] Started successfully (thermal-throttled mode: %v cooldown)", id, autoSummaryCooldown)
	for {
		job, ok := manager.Pop()
		if !ok { return }

		func() {
			defer manager.MarkDone(job.ID)

			aiEnabled, _ := store.GetSetting(ctx, "ai_summaries_enabled")
			autoEnabled, _ := store.GetSetting(ctx, "auto_summarize_enabled")
			if aiEnabled == "false" || autoEnabled == "false" {
				return
			}

			// Re-verify litert-lm is pinned to Efficiency cores and macOS has zero thermal pressure
			throttleLiteRTProcesses(ctx)
			for !isMacThermalSafe(ctx) {
				manager.status.AIStatus = "Thermal Cooldown"
				manager.status.CurrentTask = "Waiting for Mac to cool..."
				log.Printf("[worker %d] macOS thermal pressure detected; pausing background AI for 2m", id)
				select {
				case <-ctx.Done():
					return
				case <-time.After(2 * time.Minute):
				}
			}

			manager.status.AIStatus = "Busy"
			manager.status.CurrentTask = fmt.Sprintf("Article #%d: %s", job.Rank, job.Title)
			jobCtx, jobCancel := context.WithCancel(ctx)
			manager.RegisterCancel(jobCancel)

			err := processSummary(jobCtx, store, aiClient, ollamaURL, job)
			jobCancel()
			manager.RegisterCancel(nil)

			if err != nil {
				log.Printf("[ingest] Summary failed for story %d: %v", job.ID, err)
			}
			manager.status.AIStatus = "Ready"
			manager.status.CurrentTask = ""

			// Mandatory 35-second post-inference cooldown so duty cycle stays < 8% and Mac never heats up
			select {
			case <-ctx.Done():
				return
			case <-time.After(autoSummaryCooldown):
			}
		}()
	}
}

func processSummary(ctx context.Context, store storage.DB, aiClient *ai.OllamaClient, ollamaURL string, job summaryJob) error {
	// FINAL DEDUPLICATION: Check if already summarized in DB
	existing, err := store.GetStory(ctx, job.ID)
	if err == nil && existing.Summary != nil && *existing.Summary != "" && len(existing.Topics) > 0 {
		log.Printf("[ingest] Story %d already summarized, skipping.", job.ID)
		return nil
	}

	log.Printf("[ingest] processSummary starting for story %d. Provider: local-only", job.ID)

	workCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()

	var text string
	if job.URL != "" {
		if fetchRes, err := content.FetchArticle(job.URL); err == nil && len(fetchRes.Content) >= 100 {
			text = fetchRes.Content
		}
	}
	if text == "" {
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("Title: %s\nURL: %s\n\n", job.Title, job.URL))
		if comments, err := store.GetComments(workCtx, job.ID); err == nil && len(comments) > 0 {
			sb.WriteString("Key Hacker News Community Discussion:\n")
			for i, c := range comments {
				if i >= 20 {
					break
				}
				sb.WriteString(fmt.Sprintf("- %s: %s\n", c.By, c.Text))
			}
			text = sb.String()
		}
	}
	if len(text) < 50 {
		return nil
	}

	if len(text) > 12000 {
		text = text[:12000] + "..."
	}

	var responseStr string
	if aiClient.CheckAvailability(workCtx, ollamaURL) {
		model, _ := store.GetSetting(workCtx, "ollama_model")
		var sumErr error
		responseStr, sumErr = aiClient.GenerateSummary(workCtx, ollamaURL, model, job.Title, text)
		if sumErr != nil {
			log.Printf("[ingest] LiteRT-LM GenerateSummary error for story %d: %v", job.ID, sumErr)
		}
	} else {
		log.Printf("[ingest] Local AI server not reachable at %s (is 'litert-lm serve' running?)", ollamaURL)
	}

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

func maybeEnqueueStorySummary(ctx context.Context, store storage.DB, id int, url, title string, rank int, summaryManager *SummaryManager) {
	if rank > maxAutoSummariesPerCycle {
		return
	}
	aiEnabled, _ := store.GetSetting(ctx, "ai_summaries_enabled")
	autoEnabled, _ := store.GetSetting(ctx, "auto_summarize_enabled")
	if aiEnabled == "false" || autoEnabled == "false" {
		return
	}
	existing, err := store.GetStory(ctx, id)
	needsSummary := err != nil || existing.Summary == nil || strings.TrimSpace(*existing.Summary) == ""
	if !needsSummary && len(existing.Topics) == 0 && time.Since(existing.CreatedAt) < 24*time.Hour {
		needsSummary = true
	}
	if needsSummary {
		summaryManager.Push(summaryJob{ID: id, URL: url, Title: title, Rank: rank})
	}
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

	// Immediately enqueue external articles for background summarization BEFORE fetching comments,
	// so the AI worker starts summarizing right away as stories are ingested!
	if item.URL != "" {
		maybeEnqueueStorySummary(ctx, store, id, item.URL, item.Title, *rank, summaryManager)
	}

	// Fetch top-level + shallow comments during ingestion (bounded so ingestion never stalls)
	if len(item.Kids) > 0 {
		rootKids := item.Kids
		if len(rootKids) > 15 {
			rootKids = rootKids[:15]
		}
		processComments(ctx, client, store, rootKids, int64(item.ID), nil, 0)
	}

	// For Ask HN / text stories without an external URL, enqueue after top comments are stored
	if item.URL == "" {
		maybeEnqueueStorySummary(ctx, store, id, item.URL, item.Title, *rank, summaryManager)
	}
	return nil
}

func processComments(ctx context.Context, client *hn.Client, store storage.DB, kids []int, storyID int64, parentID *int64, depth int) {
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

		if depth < 1 && len(item.Kids) > 0 {
			subKids := item.Kids
			if len(subKids) > 3 {
				subKids = subKids[:3]
			}
			pID := int64(item.ID)
			processComments(ctx, client, store, subKids, storyID, &pID, depth+1)
		}
	}
}
