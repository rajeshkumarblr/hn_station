package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/rajeshkumarblr/hn_station/internal/storage"
)

func main() {
	appData, _ := os.UserConfigDir()
	dbPath := filepath.Join(appData, "HN Station", "hn.db")
	
	store, err := storage.NewSQLite(dbPath)
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}
	
	ctx := context.Background()
	
	settings := []string{"ai_summaries_enabled", "ai_provider", "gemini_api_key", "ollama_model"}
	fmt.Println("--- CURRENT SETTINGS ---")
	for _, k := range settings {
		val, err := store.GetSetting(ctx, k)
		if err != nil {
			fmt.Printf("%s: ERROR %v\n", k, err)
		} else {
			if k == "gemini_api_key" && val != "" {
				fmt.Printf("%s: [SET (length %d)]\n", k, len(val))
			} else {
				fmt.Printf("%s: %q\n", k, val)
			}
		}
	}
}
