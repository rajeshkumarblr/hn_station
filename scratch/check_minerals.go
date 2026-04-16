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

	var id int
	var summary sql.NullString
	err = db.QueryRow("SELECT id, summary FROM stories WHERE title LIKE '%God Sleeps in the Minerals%'").Scan(&id, &summary)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("ID: %d\n", id)
	if summary.Valid {
		fmt.Printf("Summary length: %d\n", len(summary.String))
	} else {
		fmt.Println("Summary: NULL")
	}
}
