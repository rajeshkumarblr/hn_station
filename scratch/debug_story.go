package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/rajeshkumarblr/hn_station/internal/ai"
	"github.com/rajeshkumarblr/hn_station/internal/content"
	"github.com/rajeshkumarblr/hn_station/internal/storage"
)

func main() {
	_ = godotenv.Load()
	
	outFile, err := os.Create("debug_summary_full.txt")
	if err != nil {
		log.Fatalf("Failed to create file: %v", err)
	}
	defer outFile.Close()

	// Connect to DB to get API key (like the real app)
	dbPath := os.Getenv("APPDATA") + "\\HN Station\\hn.db"
	store, err := storage.NewSQLite(dbPath)
	if err != nil {
		log.Fatalf("Failed to open DB: %v", err)
	}
	apiKey, _ := store.GetSetting(context.Background(), "gemini_api_key")
	if apiKey == "" {
		apiKey = os.Getenv("GEMINI_API_KEY")
	}

	// 1. Fetch story from HN
	storyID := 47834184
	fmt.Fprintf(outFile, "--- 1. Fetching Story Info for %d ---\n", storyID)
	
	resp, err := http.Get(fmt.Sprintf("https://hacker-news.firebaseio.com/v0/item/%d.json", storyID))
	if err != nil {
		log.Fatalf("Failed to fetch story: %v", err)
	}
	defer resp.Body.Close()

	var item struct {
		URL   string `json:"url"`
		Title string `json:"title"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&item); err != nil {
		log.Fatalf("Failed to decode story: %v", err)
	}

	fmt.Fprintf(outFile, "Title: %s\nURL: %s\n\n", item.Title, item.URL)
	log.Printf("Fetched URL: %s", item.URL)

	// 2. Fetch Content
	fmt.Fprintf(outFile, "--- 2. Fetching Content via Fetcher ---\n")
	fetchRes, err := content.FetchArticle(item.URL)
	if err != nil {
		fmt.Fprintf(outFile, "Fetch Error: %v\n", err)
		log.Fatalf("Fetch Error: %v", err)
	}

	fmt.Fprintf(outFile, "Content Length: %d\n", len(fetchRes.Content))
	fmt.Fprintf(outFile, "Content-Type: %s\n", fetchRes.ContentType)
	fmt.Fprintf(outFile, "\n--- EXACT CONTENT EXTRACTED ---\n")
	fmt.Fprintf(outFile, "%s\n", fetchRes.Content)

	if apiKey == "" {
		fmt.Fprintf(outFile, "\nERROR: No API key found in SQLite or ENV, cannot call summary API.\n")
		return
	}

	// 3. Summarize with Gemini (WITH RETRY LOOP)
	fmt.Fprintf(outFile, "\n--- 3. Gemini Summarization API CALL ---\n")
	geminiClient := ai.NewGeminiClient()
	model := "gemini-2.5-flash"
	fmt.Fprintf(outFile, "Calling Gemini explicitly with model API string: %s\n", model)
	
	ctx := context.Background()
	maxRetries := 3
	
	for i := 1; i <= maxRetries; i++ {
		log.Printf("Attempt %d of %d...", i, maxRetries)
		summary, err := geminiClient.GenerateSummary(ctx, apiKey, model, fetchRes.Content)
		
		if err != nil {
			log.Printf("Gemini Error: %v", err)
			fmt.Fprintf(outFile, "\nATTEMPT %d: GEMINI API ERROR:\n%v\n", i, err)
			
			if i < maxRetries {
				log.Println("Sleeping for 65 seconds to clear the 5 RPM rate limit...")
				fmt.Fprintf(outFile, "\nSleeping for 65 seconds...\n")
				time.Sleep(65 * time.Second)
			}
		} else {
			fmt.Fprintf(outFile, "\nATTEMPT %d: GEMINI SUCCESSFUL RESPONSE!\n%s\n", i, summary)
			log.Println("Gemini summarize successful.")
			break
		}
	}
}
