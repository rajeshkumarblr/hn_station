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
	newDir, _ := os.UserConfigDir()
	dbPath := filepath.Join(newDir, "HN Station", "hn.db")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	rows, err := db.Query("SELECT key, value FROM settings")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	fmt.Println("--- Database Settings ---")
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("%s: %s\n", key, value)
	}

	var count int
	db.QueryRow("SELECT COUNT(*) FROM stories WHERE summary IS NOT NULL AND summary != ''").Scan(&count)
	fmt.Printf("\nStories with summaries: %d\n", count)

	db.QueryRow("SELECT COUNT(*) FROM stories").Scan(&count)
	fmt.Printf("Total stories: %d\n", count)
}
