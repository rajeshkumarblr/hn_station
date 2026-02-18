package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	readability "github.com/go-shiori/go-readability"
)

var httpClient = &http.Client{Timeout: 10 * time.Second}

// handleGetReadme fetches a GitHub repo's README.md and returns raw Markdown.
func (s *Server) handleGetReadme(w http.ResponseWriter, r *http.Request) {
	rawURL := r.URL.Query().Get("url")
	if rawURL == "" {
		http.Error(w, "url parameter required", http.StatusBadRequest)
		return
	}

	owner, repo, err := parseGitHubURL(rawURL)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Try main first, then master
	for _, branch := range []string{"main", "master"} {
		readmeURL := fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/README.md", owner, repo, branch)
		resp, err := httpClient.Get(readmeURL)
		if err != nil {
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			body, err := io.ReadAll(resp.Body)
			if err != nil {
				http.Error(w, "Failed to read README", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
			w.Header().Set("Cache-Control", "public, max-age=300")
			w.Write(body)
			return
		}
	}

	http.Error(w, "README not found", http.StatusNotFound)
}

// parseGitHubURL extracts owner and repo from a GitHub URL.
func parseGitHubURL(rawURL string) (string, string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", "", fmt.Errorf("invalid URL")
	}

	host := strings.ToLower(u.Hostname())
	if host != "github.com" && host != "www.github.com" {
		return "", "", fmt.Errorf("not a GitHub URL")
	}

	// Path: /owner/repo or /owner/repo/...
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) < 2 {
		return "", "", fmt.Errorf("cannot parse owner/repo from URL")
	}

	return parts[0], parts[1], nil
}

// handleGetArticleContent fetches the main content of a story's URL.
func (s *Server) handleGetArticleContent(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid story ID", http.StatusBadRequest)
		return
	}

	story, err := s.store.GetStory(r.Context(), id)
	if err != nil {
		http.Error(w, "Story not found", http.StatusNotFound)
		return
	}

	if story.URL == "" {
		http.Error(w, "Story has no URL", http.StatusBadRequest)
		return
	}

	content, title, canIframe, err := s.fetchArticleContent(story.URL)
	if err != nil {
		log.Printf("Failed to fetch article content for %s: %v", story.URL, err)
		http.Error(w, "Failed to fetch content", http.StatusBadGateway)
		return
	}

	// Return simple JSON struct
	response := struct {
		Content   string `json:"content"`
		Title     string `json:"title"`
		URL       string `json:"url"`
		CanIframe bool   `json:"can_iframe"`
	}{
		Content:   content,
		Title:     title,
		URL:       story.URL,
		CanIframe: canIframe,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// fetchArticleContent attempts to fetch and parse the article content.
// It returns the HTML content, title, canIframe status, and error.
func (s *Server) fetchArticleContent(urlStr string) (string, string, bool, error) {
	parsedURL, err := url.Parse(urlStr)
	if err != nil {
		return "", "", false, err
	}

	client := &http.Client{
		Timeout: 30 * time.Second,
	}
	req, _ := http.NewRequest("GET", urlStr, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return "", "", false, err
	}
	defer resp.Body.Close()

	// 1. Check Iframe Compatibility
	canIframe := true
	xFrame := strings.ToUpper(resp.Header.Get("X-Frame-Options"))
	if xFrame == "DENY" || xFrame == "SAMEORIGIN" {
		canIframe = false
	}

	csp := strings.ToLower(resp.Header.Get("Content-Security-Policy"))
	if strings.Contains(csp, "frame-ancestors") {
		// Simplified check: if frame-ancestors exists, it likely restricts us unless we are explicitly listed (unlikely)
		// strictly parsing CSP is complex, but assuming blocking if present is safer/easier fallback
		canIframe = false
	}

	// 2. Read Body
	// Limit to 2MB to prevent memory exhaustion
	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return "", "", canIframe, err
	}

	// 3. Attempt Parsing with go-readability
	// We need a reader for readability
	article, err := readability.FromReader(strings.NewReader(string(bodyBytes)), parsedURL)
	if err == nil && article.Content != "" {
		return article.Content, article.Title, canIframe, nil
	}

	// 4. Fallback to Raw HTML (sanitized by frontend usually, but we send raw here)
	// If readability failed, we just send the body.
	// Title extraction is rudimentary here.
	title := "Unknown Title"
	return string(bodyBytes), title, canIframe, nil
}
