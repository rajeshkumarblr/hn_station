package main

import (
	"context"
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

	ctx := context.Background()

	// Update the ollama_model setting
	_, err = db.ExecContext(ctx, `
		INSERT INTO settings (key, value) VALUES ('ollama_model', 'qwen2.5-coder:latest')
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Successfully updated ollama_model setting to qwen2.5-coder:latest")

	rows, err := db.Query("SELECT key, value FROM settings")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	fmt.Println("\n--- Current Database Settings ---")
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("%s: %s\n", key, value)
	}
}
