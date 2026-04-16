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

	var summary sql.NullString
	var topics string
	var title string
	err = db.QueryRow("SELECT title, summary, topics FROM stories WHERE id = 47780712").Scan(&title, &summary, &topics)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Story: %s\n", title)
	if summary.Valid {
		fmt.Printf("Summary: %s\n", summary.String)
	} else {
		fmt.Println("Summary: NULL")
	}
	fmt.Printf("Topics: %s\n", topics)
}
