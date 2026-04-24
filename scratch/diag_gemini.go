package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/google/generative-ai-go/genai"
	_ "modernc.org/sqlite"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
)

func main() {
	newDir, _ := os.UserConfigDir()
	dbPath := filepath.Join(newDir, "HN Station", "hn.db")

	fmt.Printf("Opening database at %s...\n", dbPath)
	db, err := sql.Open("sqlite", dbPath) // modernc.org/sqlite uses "sqlite" driver name
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// 1. Check settings
	rows, err := db.Query("SELECT key, value FROM settings")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	var geminiKey string
	fmt.Println("\n--- SETTINGS ---")
	for rows.Next() {
		var k, v string
		rows.Scan(&k, &v)
		fmt.Printf("%s: %s\n", k, v)
		if k == "gemini_api_key" {
			geminiKey = v
		}
	}

	if geminiKey == "" {
		fmt.Println("No Gemini API key found in settings.")
		return
	}

	// 2. Test Gemini API
	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(geminiKey))
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	fmt.Println("\n--- GEMINI DIAGNOSTICS ---")
	fmt.Println("Listing available models...")
	iter := client.ListModels(ctx)
	for {
		m, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Printf("ListModels Error: %v", err)
			break
		}
		fmt.Printf("- %s\n", m.Name)
	}

	modelsToTest := []string{
		"gemini-1.5-flash",
		"gemini-1.5-flash-latest",
		"gemini-1.0-pro",
		"gemini-pro",
	}

	for _, m := range modelsToTest {
		fmt.Printf("\nTesting %s...\n", m)
		model := client.GenerativeModel(m)
		resp, err := model.GenerateContent(ctx, genai.Text("Say OK"))
		if err != nil {
			fmt.Printf("FAIL: %v\n", err)
		} else {
			fmt.Printf("SUCCESS: %+v\n", resp)
		}
	}
}
