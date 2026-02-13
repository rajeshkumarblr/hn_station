package api

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
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
