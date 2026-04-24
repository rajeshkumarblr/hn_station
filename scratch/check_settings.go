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
		log.Fatalf("failed to connect to db: %v", err)
	}

	keys := []string{"ai_provider", "gemini_model", "auto_summarize_enabled", "ai_summaries_enabled"}
	for _, k := range keys {
		val, _ := store.GetSetting(context.Background(), k)
		fmt.Printf("%s: %s\n", k, val)
	}
}
