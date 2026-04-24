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

	summaryJSON := `{
  "summary": "- Saunas link to higher daily activity.\n- They also raise peak heart rate.\n- Sauna days show lower night HR.\n- Suggests physiological recovery beyond exercise.\n- Women's recovery strongest in luteal phase.",
  "topics": ["sauna", "recovery", "heartrate", "physiology", "luteal"]
}`

	err = store.UpdateStorySummary(context.Background(), 47834184, summaryJSON)
	if err != nil {
		log.Fatalf("Failed to save summary: %v", err)
	}
	
	log.Println("Successfully injected AI summary into the database for 47834184!")
}
