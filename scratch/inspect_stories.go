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

	rows, err := db.Query("SELECT id, title, descendants FROM stories ORDER BY created_at DESC LIMIT 10")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	fmt.Println("Recent Stories in DB:")
	for rows.Next() {
		var id int
		var title string
		var descendants int
		if err := rows.Scan(&id, &title, &descendants); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("ID: %d | Title: %s | Descendants: %d\n", id, title, descendants)
	}
}
