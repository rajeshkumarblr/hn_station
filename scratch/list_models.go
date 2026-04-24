package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/google/generative-ai-go/genai"
	"github.com/rajeshkumarblr/hn_station/internal/storage"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
	"path/filepath"
)

func main() {
	ctx := context.Background()
	
	// Get API Key from DB
	appData, _ := os.UserConfigDir()
	dbPath := filepath.Join(appData, "HN Station", "hn.db")
	store, err := storage.NewSQLite(dbPath)
	if err != nil {
		log.Fatalf("failed to connect to db: %v", err)
	}
	apiKey, _ := store.GetSetting(ctx, "gemini_api_key")
	if apiKey == "" {
		log.Fatal("GEMINI_API_KEY not found in settings")
	}

	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		log.Fatalf("failed to create client: %v", err)
	}
	defer client.Close()

	iter := client.ListModels(ctx)
	fmt.Println("Available Models:")
	for {
		m, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Fatalf("failed to list models: %v", err)
		}
		fmt.Printf("- %s (Display: %s, Methods: %v)\n", m.Name, m.DisplayName, m.SupportedGenerationMethods)
	}
}
