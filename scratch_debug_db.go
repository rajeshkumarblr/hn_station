package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func main() {
	appData := os.Getenv("APPDATA")
	dbPath := filepath.Join(appData, "HN Station", "hn.db")
	
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	rows, err := db.Query("SELECT id, title, summary, topics FROM stories WHERE summary IS NOT NULL ORDER BY created_at DESC LIMIT 5")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	fmt.Println("--- RECENT SUMMARIZED STORIES ---")
	for rows.Next() {
		var id int
		var title, summary, topics string
		if err := rows.Scan(&id, &title, &summary, &topics); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("ID: %d\nTitle: %s\nTopics: %s\nSummary: %s\n\n", id, title, topics, summary[:100]+"...")
	}
}
