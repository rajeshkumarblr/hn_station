package main

import (
	"database/sql"
	"fmt"
	"log"
	"path/filepath"
	"os"

	_ "modernc.org/sqlite"
)

func main() {
	configDir, _ := os.UserConfigDir()
	dbPath := filepath.Join(configDir, "HN Station", "hn.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	storyID := 47886517
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM comments WHERE story_id = ?", storyID).Scan(&count)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Story %d has %d comments in DB\n", storyID, count)

	rows, err := db.Query("SELECT id, text FROM comments WHERE story_id = ? LIMIT 5", storyID)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var text string
		if err := rows.Scan(&id, &text); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Comment %d: %s\n", id, text)
	}
}
