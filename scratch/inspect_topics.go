package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

func main() {
	dbPath := "hn_station.db"
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	var topics string
	err = db.QueryRow("SELECT value FROM settings WHERE key = 'active_topics'").Scan(&topics)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Active Topics in DB: %s\n", topics)
}
