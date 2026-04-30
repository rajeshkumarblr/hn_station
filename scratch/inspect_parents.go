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

	storyID := 47655408
	rows, err := db.Query("SELECT id, parent_id FROM comments WHERE story_id = ? LIMIT 10", storyID)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	fmt.Printf("Top comments for Story %d:\n", storyID)
	for rows.Next() {
		var id int
		var parentID sql.NullInt64
		if err := rows.Scan(&id, &parentID); err != nil {
			log.Fatal(err)
		}
		if !parentID.Valid {
			fmt.Printf("Comment %d: parent_id=NULL (TOP LEVEL)\n", id)
		} else {
			fmt.Printf("Comment %d: parent_id=%d\n", id, parentID.Int64)
		}
	}
}
