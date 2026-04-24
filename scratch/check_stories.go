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

	// Fetch top 100 stories
	stories, _, err := store.GetStories(context.Background(), 20, 0, "top", nil, "local-user", false)
	if err != nil {
		log.Fatalf("failed to get stories: %v", err)
	}

	fmt.Printf("%-10s | %-5s | %-5s | %s\n", "ID", "Score", "Rank", "Summary Status")
	fmt.Println("------------------------------------------------------------------")
	for _, s := range stories {
		status := "Empty"
		if s.Summary != nil && *s.Summary != "" {
			status = "DONE"
			if len(*s.Summary) > 50 {
				status = (*s.Summary)[:50] + "..."
			}
		}
		
		rankStr := "N/A"
		if s.HNRank != nil {
			rankStr = fmt.Sprintf("%d", *s.HNRank)
		}

		fmt.Printf("%-10d | %-5d | %-5s | %s\n", s.ID, s.Score, rankStr, status)
	}
}
