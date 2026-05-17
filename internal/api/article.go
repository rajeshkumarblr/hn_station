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
	"github.com/rajeshkumarblr/hn_station/internal/ai"
	"github.com/rajeshkumarblr/hn_station/internal/storage"
)

func (s *Server) handlePatchStorySummary(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid story ID", http.StatusBadRequest)
		return
	}

	var reqBody struct {
		Summary           string   `json:"summary"`
		DiscussionSummary string   `json:"discussion_summary"`
		Topics            []string `json:"topics"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if reqBody.Summary != "" {
		var err error
		if len(reqBody.Topics) > 0 {
			err = s.store.UpdateStorySummaryAndTopics(r.Context(), id, reqBody.Summary, reqBody.Topics)
		} else {
			err = s.store.UpdateStorySummary(r.Context(), id, reqBody.Summary)
		}
		if err != nil {
			http.Error(w, "Failed to update summary", http.StatusInternalServerError)
			return
		}
	}

	if reqBody.DiscussionSummary != "" {
		if err := s.store.UpdateStoryDiscussionSummary(r.Context(), id, reqBody.DiscussionSummary); err != nil {
			http.Error(w, "Failed to update discussion summary", http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}


func (s *Server) handleSummarizeArticle(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid story ID", http.StatusBadRequest)
		return
	}

	userID := s.auth.GetUserIDFromRequest(r)
	if userID == "" {
		if s.localMode {
			userID = "local-user"
		} else {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}
	}

	user, err := s.store.GetAuthUser(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusInternalServerError)
		return
	}
	if user == nil {
		// In local mode, we might not have a user in auth_users yet
		user = &storage.AuthUser{ID: userID}
	}

	// Note: Gemini Key check moved below, only if needed.

	story, err := s.store.GetStory(r.Context(), id)
	if err != nil {
		http.Error(w, "Story not found", http.StatusNotFound)
		return
	}

	// 1. Check Global Cache (Short-circuit if already summarized)
	force := r.URL.Query().Get("force") == "true"
	priority := r.URL.Query().Get("priority") == "true"
	log.Printf("[summarize] Handling request for story %d (force=%v, priority=%v)", id, force, priority)
	
	if priority && s.Prioritizer != nil {
		s.Prioritizer.CancelOngoing()
	}

	if !force && story.Summary != nil && *story.Summary != "" {
		log.Printf("[summarize] Returning cached summary for story %d", id)
		// Save to chat history so user sees it in their thread too
		if err := s.store.SaveChatMessage(r.Context(), userID, id, "model", fmt.Sprintf("**Article Summary of \"%s\":**\n\n%s", story.Title, *story.Summary)); err != nil {
			log.Printf("Failed to save cached summary to history: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"summary": *story.Summary})
		return
	}
	
	if force {
		log.Printf("[summarize] Cache bypass triggered for story %d. Initiating fresh fetch/AI call...", id)
	}

	// 2. Fetch and Parse Article
	var textContent string
	var errFetch error

	if story.URL != "" {
		content, _, _, _, err := s.fetchArticleContent(story.URL)
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

	// 3. Summarize with Ollama
	// Truncate content for CPU inference speed (20000 chars)
	finalContent := textContent
	if len(finalContent) > 20000 {
		finalContent = finalContent[:20000] + "..."
	}

	var responseStr string
	var summarizeErr error

	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://localhost:11434"
	}
	model, _ := s.store.GetSetting(r.Context(), "ollama_model")
	responseStr, err = s.aiClient.GenerateSummary(r.Context(), ollamaURL, model, story.Title, finalContent)
	if err != nil {
		summarizeErr = err
		log.Printf("Ollama article summarization failed: %v", err)
	}
	if responseStr == "" {
		var errMsg string
		if summarizeErr != nil {
			errMsg = summarizeErr.Error()
		} else {
			errMsg = "AI provider (Ollama) failed to generate response."
		}
		
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to generate summary: " + errMsg,
		})
		return
	}

	result := ai.ParseGreedyJSON(responseStr, int64(id))
	finalSummary := strings.Join(result.Summary, "\n")
	finalTopics := result.Topics


	// 4. Save to Global Cache
	if err := s.store.UpdateStorySummaryAndTopics(r.Context(), id, finalSummary, finalTopics); err != nil {
		log.Printf("[summarize] Failed to save to global cache for story %d: %v", id, err)
	}

	// 5. Save to Chat History
	if err := s.store.SaveChatMessage(r.Context(), userID, id, "model", fmt.Sprintf("**Article Summary of \"%s\":**\n\n%s", story.Title, finalSummary)); err != nil {
		log.Printf("Failed to save summary to history: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"summary": finalSummary,
		"topics":  finalTopics,
	})
}
