package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	readability "github.com/go-shiori/go-readability"
)

func (s *Server) handleSummarizeArticle(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid story ID", http.StatusBadRequest)
		return
	}

	userID := s.auth.GetUserIDFromRequest(r)
	if userID == "" {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	user, err := s.store.GetAuthUser(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusInternalServerError)
		return
	}

	if user.GeminiAPIKey == "" {
		http.Error(w, "Please set your Gemini API Key in Settings to use this feature.", http.StatusBadRequest)
		return
	}

	story, err := s.store.GetStory(r.Context(), id)
	if err != nil {
		http.Error(w, "Story not found", http.StatusNotFound)
		return
	}

	// 1. Check Global Cache (Short-circuit if already summarized)
	if story.Summary != nil && *story.Summary != "" {
		// Save to chat history so user sees it in their thread too
		if err := s.store.SaveChatMessage(r.Context(), userID, id, "model", fmt.Sprintf("**Article Summary of \"%s\":**\n\n%s", story.Title, *story.Summary)); err != nil {
			log.Printf("Failed to save cached summary to history: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"summary": *story.Summary})
		return
	}

	// 2. Fetch and Parse Article
	var textContent string
	var fetchErr error

	if story.URL != "" {
		// Attempt 1: go-readability
		article, err := readability.FromURL(story.URL, 30*time.Second)
		if err == nil {
			textContent = article.TextContent
		} else {
			log.Printf("Readability failed for %s: %v", story.URL, err)
			fetchErr = err
		}

		// Attempt 2: Raw HTML fallback if readability failed or returned very little text
		if len(textContent) < 500 {
			log.Printf("Readability returned empty/short text (%d chars). Falling back to raw HTML.", len(textContent))

			client := &http.Client{
				Timeout: 30 * time.Second,
			}
			req, _ := http.NewRequest("GET", story.URL, nil)
			req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

			resp, err := client.Do(req)
			if err == nil {
				defer resp.Body.Close()
				// Read up to 50k bytes to avoid memory issues with huge files
				// (Gemini Flash has 1M token context, so 50k chars is fine ~10-15k tokens)
				bodyBytes := make([]byte, 50000)
				n, _ := io.ReadFull(resp.Body, bodyBytes)
				if n > 0 {
					textContent = string(bodyBytes[:n])
					fetchErr = nil // Clear error since we got something
				}
			} else {
				log.Printf("Raw HTML fetch failed: %v", err)
			}
		}
	} else {
		// Text-only post
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"summary": "This is a text-only post (Ask HN / Show HN) with no external link. Please use 'Summarize Discussion' to summarize the comments."})
		return
	}

	if fetchErr != nil && len(textContent) < 100 {
		http.Error(w, "Failed to fetch article content. It might be behind a paywall or inaccessible.", http.StatusBadGateway)
		return
	}

	// 3. Summarize with Gemini
	// Initialize truncated content
	finalContent := textContent
	// If it's raw HTML, we might want to strip script/style tags if possible, but Gemini handles it okay.
	// For now, raw HTML is better than nothing.

	prompt := fmt.Sprintf("Title: %s\nURL: %s\n\nArticle Content:\n%s", story.Title, story.URL, finalContent)
	summary, err := s.aiClient.GenerateSummary(r.Context(), user.GeminiAPIKey, prompt)
	if err != nil {
		log.Printf("Summarization failed: %v", err)
		http.Error(w, "Failed to generate summary: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 4. Save to Global Cache
	if err := s.store.UpdateStorySummary(r.Context(), id, summary); err != nil {
		log.Printf("Failed to update story summary cache: %v", err)
	}

	// 5. Save to Chat History
	if err := s.store.SaveChatMessage(r.Context(), userID, id, "model", fmt.Sprintf("**Article Summary of \"%s\":**\n\n%s", story.Title, summary)); err != nil {
		log.Printf("Failed to save summary to history: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"summary": summary})
}
