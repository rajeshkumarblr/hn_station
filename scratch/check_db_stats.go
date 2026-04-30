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

	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM stories").Scan(&count)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Total stories in DB: %d\n", count)

	var savedCount int
	err = db.QueryRow("SELECT COUNT(*) FROM stories WHERE is_saved = 1").Scan(&savedCount)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Saved stories: %d\n", savedCount)
}
