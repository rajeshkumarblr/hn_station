package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

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
