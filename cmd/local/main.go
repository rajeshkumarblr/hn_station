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
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const (
	workerCount  = 3
	totalStories = 100 // Keep top 100 front-page stories

	svcName = "HNStationIngest"
	svcDisplayName = "HN Station Ingestion Service"
	svcDescription = "Background service for HN Station to fetch and index stories."
)

func main() {
	// 1. Immediate Service check (Must happen before flag parsing or slow IO)
	isSvc, err := svc.IsWindowsService()
	if err == nil && isSvc {
		// Minimum setup for service mode
		runService(svcName, defaultDBPath(), "58090", "http://localhost:11434", 5*time.Minute)
		return
	}

	// 2. Interactive/Install mode
	dbPath := flag.String("db", defaultDBPath(), "Path to SQLite database file")
	port := flag.String("port", "58090", "HTTP port (0 = OS picks a free port in interactive mode)")
	ollamaURL := flag.String("ollama", "http://localhost:11434", "Ollama base URL")
	interval := flag.Duration("interval", 5*time.Minute, "Ingestion interval")
	install := flag.Bool("install", false, "Install Windows service")
	remove := flag.Bool("remove", false, "Remove Windows service")
	flag.Parse()

	if *install {
		err := installService(svcName, svcDisplayName, svcDescription)
		if err != nil {
			log.Fatalf("failed to install %s: %v", svcName, err)
		}
		fmt.Printf("Service %s installed successfully\n", svcName)
		return
	}

	if *remove {
		err := removeService(svcName)
		if err != nil {
			log.Fatalf("failed to remove %s: %v", svcName, err)
		}
		fmt.Printf("Service %s removed successfully\n", svcName)
		return
	}

	// Interactive mode
	runInteractive(*dbPath, *port, *ollamaURL, *interval)
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

	log.Printf("Starting interactive mode on %s", listener.Addr())
	run(ctx, dbPath, ollamaURL, interval, listener)
}

func run(ctx context.Context, dbPath, ollamaURL string, interval time.Duration, listener net.Listener) {
	// ── DB ─────────────────────────────────────────────────────────────────────
	// Ensure absolute path, especially for service mode
	if !filepath.IsAbs(dbPath) {
		if exe, err := os.Executable(); err == nil {
			dbPath = filepath.Join(filepath.Dir(exe), dbPath)
		}
	}
	
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		log.Printf("[error] Failed to create db dir %s: %v", filepath.Dir(dbPath), err)
		// Fallback to a guaranteed writable path in user home if possible
		if home, err := os.UserHomeDir(); err == nil {
			dbPath = filepath.Join(home, ".hn-station", "hn.db")
			_ = os.MkdirAll(filepath.Dir(dbPath), 0755)
		}
	}
	store, err := storage.NewSQLite(dbPath)
	if err != nil {
		log.Fatalf("open sqlite: %v", err)
	}
	log.Printf("Database: %s", dbPath)

	// ── Components ─────────────────────────────────────────────────────────────
	hnClient := hn.NewClient()
	aiClient := ai.NewOllamaClient()
	geminiClient := ai.NewGeminiClient()
	summaryQueue := make(chan summaryJob, 100)
	limiter := time.NewTicker(500 * time.Millisecond)
	defer limiter.Stop()

	var workerWg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		workerWg.Add(1)
		go func(id int) {
			defer workerWg.Done()
			runSummaryWorker(id, ctx, store, aiClient, geminiClient, ollamaURL, summaryQueue, limiter)
		}(i)
	}

	// Initial ingestion
	go func() {
		log.Println("Running initial ingestion...")
		runIngestion(ctx, hnClient, store, summaryQueue)
	}()

	// Periodic ingestion
	go func() {
		ticker := time.NewTicker(interval)
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

	// ── Server ─────────────────────────────────────────────────────────────────
	authCfg := auth.NewLocalConfig()
	server := api.NewServer(store, authCfg, aiClient, geminiClient, true)
	srv := &http.Server{Handler: server}

	go func() {
		if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTP server error: %v", err)
		}
	}()

	<-ctx.Done()
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutCancel()
	srv.Shutdown(shutCtx)
	log.Println("Server stopped")
}

// ── Service Logic ─────────────────────────────────────────────────────────────

type hnSvc struct {
	dbPath    string
	port      string
	ollamaURL string
	interval  time.Duration
}

func (m *hnSvc) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (ssec bool, errno uint32) {
	const cmdsAccepted = svc.AcceptStop | svc.AcceptShutdown
	changes <- svc.Status{State: svc.StartPending}

	// Setup log file for service
	logDir := filepath.Dir(m.dbPath)
	_ = os.MkdirAll(logDir, 0755)
	logFile, err := os.OpenFile(filepath.Join(logDir, "service.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err == nil {
		log.SetOutput(logFile)
		defer logFile.Close()
	}
	log.Printf("--- Service starting ---")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Bind specifically to 127.0.0.1 to avoid IPv6 issues or open firewall prompts
	bindAddr := "127.0.0.1:" + m.port
	if m.port == "0" || m.port == "" {
		bindAddr = "127.0.0.1:0"
	}

	listener, err := net.Listen("tcp", bindAddr)
	if err != nil {
		log.Printf("[service] Failed to listen on %s: %v", bindAddr, err)
		return false, 1
	}
	log.Printf("[service] Listening on %s", listener.Addr().String())

	log.Printf("[service] Starting backend with db=%s, port=%s", m.dbPath, m.port)
	go run(ctx, m.dbPath, m.ollamaURL, m.interval, listener)

	changes <- svc.Status{State: svc.Running, Accepts: cmdsAccepted}

loop:
	for {
		select {
		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				changes <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				cancel()
				break loop
			default:
				log.Printf("unexpected control request #%d", c)
			}
		}
	}

	changes <- svc.Status{State: svc.StopPending}
	return
}

func runService(name string, dbPath, port, ollamaURL string, interval time.Duration) {
	err := svc.Run(name, &hnSvc{
		dbPath:    dbPath,
		port:      port,
		ollamaURL: ollamaURL,
		interval:  interval,
	})
	if err != nil {
		log.Fatalf("service %s failed: %v", name, err)
	}
}

func installService(name, displayName, desc string) error {
	exepath, err := os.Executable()
	if err != nil {
		return err
	}
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService(name)
	if err == nil {
		s.Close()
		return fmt.Errorf("service %s already exists", name)
	}
	s, err = m.CreateService(name, exepath, mgr.Config{
		DisplayName: displayName,
		Description: desc,
		StartType:   mgr.StartAutomatic,
	})
	if err != nil {
		return err
	}
	defer s.Close()
	return nil
}

func removeService(name string) error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService(name)
	if err != nil {
		return fmt.Errorf("service %s is not installed", name)
	}
	defer s.Close()
	err = s.Delete()
	if err != nil {
		return err
	}
	return nil
}

// defaultDBPath returns C:\ProgramData\HNStation\hn.db on Windows or ~/.hn-station/hn.db otherwise
func defaultDBPath() string {
	// Priority 1: Windows ProgramData (for shared service access)
	// We use hardcoded path fallback because PROGRAMDATA env var might be missing in service context
	pd := os.Getenv("PROGRAMDATA")
	if pd == "" {
		pd = "C:\\ProgramData"
	}
	
	// Check if we can write to ProgramData
	targetDir := filepath.Join(pd, "HNStation")
	if err := os.MkdirAll(targetDir, 0755); err == nil {
		return filepath.Join(targetDir, "hn.db")
	}

	// Priority 2: User Home
	home, err := os.UserHomeDir()
	if err == nil {
		return filepath.Join(home, ".hn-station", "hn.db")
	}
	
	// Final fallback (executable dir)
	if exe, err := os.Executable(); err == nil {
		return filepath.Join(filepath.Dir(exe), "hn.db")
	}
	
	return "hn.db"
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
