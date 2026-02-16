package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	readability "github.com/go-shiori/go-readability"
)

func main() {
	url := "https://mastodon.world/@knowmadd/116072773118828295"
	// url := "https://steipete.me/posts/2026/openclaw"
	fmt.Printf("Testing URL: %s\n", url)

	article, err := readability.FromURL(url, 30*time.Second)
	if err != nil {
		log.Fatalf("Readability failed: %v", err)
	}

	fmt.Printf("Title: %s\n", article.Title)
	fmt.Printf("Text Length: %d\n", len(article.TextContent))
	if len(article.TextContent) < 500 {
		fmt.Println("Text content is very short!")
		fmt.Println("--- CONTENT START ---")
		fmt.Println(article.TextContent)
		fmt.Println("--- CONTENT END ---")
	} else {
		fmt.Println("Content extraction seems successful.")
	}

	// Fallback test: Fetch raw HTML
	fmt.Println("\n--- RAW HTML FALLBACK TEST ---")
	client := &http.Client{}
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("Failed to fetch raw HTML: %v", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	htmlContent := string(bodyBytes)
	fmt.Printf("Raw HTML Length: %d\n", len(htmlContent))

	// Simple strip of script/style (very basic)
	// In production we might send full HTML or use a library
	fmt.Println("Preview of HTML (first 500 chars):")
	if len(htmlContent) > 500 {
		fmt.Println(htmlContent[:500])
	} else {
		fmt.Println(htmlContent)
	}
}
