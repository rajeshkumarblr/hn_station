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

	var id int
	var title string
	err = db.QueryRow("SELECT id, title FROM stories WHERE title LIKE '%How LLMs Work%'").Scan(&id, &title)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("ID: %d | Title: %s\n", id, title)
}
