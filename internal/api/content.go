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
	"github.com/rajeshkumarblr/hn_station/internal/content"
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

// fetchArticleContent uses the shared internal/content package to fetch and parse the article.
func (s *Server) fetchArticleContent(urlStr string) (string, string, bool, error) {
	result, err := content.FetchArticle(urlStr)
	if err != nil {
		return "", "", false, err
	}
	return result.Content, result.Title, result.CanIframe, nil
}
