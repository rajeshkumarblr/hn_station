package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/rajeshkumarblr/hn_station/internal/ai"
	"github.com/rajeshkumarblr/hn_station/internal/api"
	"github.com/rajeshkumarblr/hn_station/internal/auth"
	"github.com/rajeshkumarblr/hn_station/internal/storage"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on environment variables")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize storage
	store, err := storage.NewStore(ctx, dbURL)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v\n", err)
	}

	// Initialize auth
	authCfg := auth.NewConfig()
	log.Printf("OAuth2 callback URL: %s", authCfg.OAuth2Config.RedirectURL)

	// Initialize AI clients
	aiClient := ai.NewOllamaClient()
	geminiClient := ai.NewGeminiClient()
	log.Println("AI clients initialized")

	server := api.NewServer(store, authCfg, aiClient, geminiClient, false /* cloud mode */)

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: server,
	}

	// Handle graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Received shutdown signal")

		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Fatalf("HTTP shutdown error: %v", err)
		}
		cancel()
	}()

	log.Printf("Starting server on port %s", port)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("HTTP server error: %v", err)
	}
	log.Println("Server stopped")
}
