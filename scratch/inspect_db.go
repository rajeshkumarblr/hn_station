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

	fmt.Println("Searching for 'Utilyze'...")
	rows, _ := db.Query("SELECT id, title, topics FROM stories WHERE title LIKE '%Utilyze%'")
	for rows.Next() {
		var id int
		var title, topics string
		rows.Scan(&id, &title, &topics)
		fmt.Printf("ID: %d | Title: %s | Topics: %s\n", id, title, topics)
	}
}
