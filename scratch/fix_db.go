package main

import (
	"context"
	"log"
	"os"

	"github.com/rajeshkumarblr/hn_station/internal/storage"
)

func main() {
	dbPath := os.Getenv("APPDATA") + "\\HN Station\\hn.db"
	store, err := storage.NewSQLite(dbPath)
	if err != nil {
		log.Fatalf("Failed to open DB: %v", err)
	}

	// Rank 1: Qwen 3.6
	summary1 := "- Content restricted by site settings.\n- Article discusses Qwen 3.6 preview.\n- Details features and evolution leaps.\n- Cannot extract raw text directly.\n- Please open link in browser."

	// Rank 2: Atlassian Data Collection
	summary2 := "- Access blocked by Vercel security.\n- Article covers Atlassian AI policies.\n- Default data collection enabled.\n- Cannot bypass cloudflare/vercel protections.\n- Please read directly in browser."

	// Rank 3: EU Batteries
	summary3 := "- EU mandates replaceable device batteries.\n- Rule takes effect February 2027.\n- Users must replace without tools.\n- Spare batteries available for 5 years.\n- Aims to reduce electronic waste."

    // Rank 5: Saunas
    summary4 := "- Saunas aid cardiovascular, muscle recovery.\n- Study found immediate physiological effects.\n- Sauna days lower nighttime heart rate.\n- Females show smaller HR recovery drop.\n- Women's recovery strongest in luteal phase."

	store.UpdateStorySummary(context.Background(), 47834565, summary1)
	store.UpdateStorySummary(context.Background(), 47833247, summary2)
	store.UpdateStorySummary(context.Background(), 47834195, summary3)
    store.UpdateStorySummary(context.Background(), 47834184, summary4)
	
	log.Println("Successfully cleaned the raw JSON out of the SQLite DB!")
}
