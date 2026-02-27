package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
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
	var errFetch error

	if story.URL != "" {
		content, _, _, err := s.fetchArticleContent(story.URL)
		if err == nil {
			// For summarization, we'd prefer text content, but Go-Readability's Content is HTML.
			// Ideally we should strip tags for Gemini to save tokens, but Gemini handles HTML fine.
			// Let's use the content we got.
			textContent = content
		} else {
			errFetch = err
		}
	} else {
		// Text-only post
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"summary": "This is a text-only post (Ask HN / Show HN) with no external link. Please use 'Summarize Discussion' to summarize the comments."})
		return
	}

	if errFetch != nil || len(textContent) < 100 {
		http.Error(w, "Failed to fetch article content. It might be behind a paywall or inaccessible.", http.StatusBadGateway)
		return
	}

	// 3. Summarize with Gemini (now Ollama)
	// Truncate content for CPU inference speed (6000 chars ~ 1500 words)
	finalContent := textContent
	if len(finalContent) > 20000 {
		finalContent = finalContent[:20000] + "..."
	}
	// If it's raw HTML, we might want to strip script/style tags if possible, but Gemini handles it okay.
	// For now, raw HTML is better than nothing.

	// Use unified GenerateSummary which takes title and text
	// For now we still use ollamaURL. If this was intended to stay Gemini, we would need a separate method.
	// But the signature changed, so we must update.
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://ollama:11434"
	}

	responseStr, err := s.aiClient.GenerateSummary(r.Context(), ollamaURL, story.Title, finalContent)
	if err != nil {
		log.Printf("Summarization failed: %v", err)
		http.Error(w, "Failed to generate summary: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Try to parse the JSON
	cleanJSON := strings.TrimSpace(responseStr)
	cleanJSON = strings.TrimPrefix(cleanJSON, "```json")
	cleanJSON = strings.TrimPrefix(cleanJSON, "```")
	cleanJSON = strings.TrimSuffix(cleanJSON, "```")
	cleanJSON = strings.TrimSpace(cleanJSON)

	var intermediate struct {
		Summary interface{} `json:"summary"`
		Topics  []string    `json:"topics"`
	}

	var result struct {
		Summary string
		Topics  []string
	}

	if err := json.Unmarshal([]byte(cleanJSON), &intermediate); err != nil {
		log.Printf("Failed to parse JSON in article summary. Error: %v. Raw: %s", err, responseStr)
		result.Summary = responseStr // Fallback
		result.Topics = []string{}
	} else {
		// Handle Summary being either a string or an array of strings
		switch v := intermediate.Summary.(type) {
		case string:
			result.Summary = v
		case []interface{}:
			var parts []string
			for _, part := range v {
				if s, ok := part.(string); ok {
					parts = append(parts, s)
				}
			}
			result.Summary = strings.Join(parts, " ")
		default:
			result.Summary = fmt.Sprintf("%v", v)
		}
		result.Topics = intermediate.Topics
	}

	// 4. Save to Global Cache
	if err := s.store.UpdateStorySummaryAndTopics(r.Context(), id, result.Summary, result.Topics); err != nil {
		log.Printf("Failed to update story summary/topics cache: %v", err)
	}

	// 5. Save to Chat History
	if err := s.store.SaveChatMessage(r.Context(), userID, id, "model", fmt.Sprintf("**Article Summary of \"%s\":**\n\n%s", story.Title, result.Summary)); err != nil {
		log.Printf("Failed to save summary to history: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"summary": result.Summary,
		"topics":  result.Topics,
	})
}
