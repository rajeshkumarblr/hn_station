package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/rajeshkumarblr/hn_station/internal/ai"
	"github.com/rajeshkumarblr/hn_station/internal/auth"
	"github.com/rajeshkumarblr/hn_station/internal/storage"
	"golang.org/x/oauth2"
)

type Server struct {
	store    *storage.Store
	router   *chi.Mux
	auth     *auth.Config
	aiClient *ai.GeminiClient
}

func NewServer(store *storage.Store, authCfg *auth.Config, aiClient *ai.GeminiClient) *Server {
	s := &Server{
		store:    store,
		router:   chi.NewRouter(),
		auth:     authCfg,
		aiClient: aiClient,
	}

	s.middlewares()
	s.routes()

	return s
}

func (s *Server) middlewares() {
	s.router.Use(middleware.RequestID)
	s.router.Use(middleware.RealIP)
	s.router.Use(middleware.Logger)
	s.router.Use(middleware.Recoverer)
	s.router.Use(middleware.Timeout(60 * time.Second))

	allowedOrigins := []string{"http://localhost:5173", "https://hnstation.dev"}
	s.router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))
}

func (s *Server) routes() {
	// Health check
	s.router.Get("/healthc", s.handleHealthCheck)

	// API routes
	s.router.Get("/api/stories", s.handleGetStories)
	s.router.Get("/api/stories/saved", s.handleGetSavedStories)
	s.router.Get("/api/stories/{id}", s.handleGetStoryDetails)
	s.router.Post("/api/stories/{id}/interact", s.handleInteract)
	s.router.Get("/api/content/readme", s.handleGetReadme)
	s.router.Get("/api/me", s.handleGetMe)
	s.router.Post("/api/settings", s.handleUpdateSettings)

	// Auth routes
	s.router.Get("/auth/google", s.handleGoogleLogin)
	s.router.Get("/auth/google/callback", s.handleGoogleCallback)
	s.router.Get("/auth/logout", s.handleLogout)

	// AI routes
	s.router.Post("/api/stories/{id}/summarize", s.handleSummarizeStory)
	s.router.Post("/api/stories/{id}/summarize_article", s.handleSummarizeArticle)
	s.router.Get("/api/chat/{id}", s.handleGetChatHistory)
	s.router.Post("/api/chat", s.handleChat)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Server) handleHealthCheck(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// isSecureRequest determines if the request came over HTTPS.
func isSecureRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	// Behind a proxy (K8s ingress)
	return r.Header.Get("X-Forwarded-Proto") == "https"
}

// ─── Auth Handlers ───

func (s *Server) handleGoogleLogin(w http.ResponseWriter, r *http.Request) {
	state := auth.GenerateStateToken()

	// Store state in a short-lived cookie for verification on callback
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		Path:     "/",
		MaxAge:   300, // 5 minutes
		HttpOnly: true,
		Secure:   isSecureRequest(r),
		SameSite: http.SameSiteLaxMode,
	})

	url := s.auth.OAuth2Config.AuthCodeURL(state, oauth2.AccessTypeOffline)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

func (s *Server) handleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	// Verify state for CSRF protection
	stateCookie, err := r.Cookie("oauth_state")
	if err != nil || stateCookie.Value != r.URL.Query().Get("state") {
		http.Error(w, "Invalid state parameter", http.StatusBadRequest)
		return
	}

	// Clear state cookie
	http.SetCookie(w, &http.Cookie{
		Name:   "oauth_state",
		Value:  "",
		Path:   "/",
		MaxAge: -1,
	})

	// Exchange code for token
	code := r.URL.Query().Get("code")
	token, err := s.auth.OAuth2Config.Exchange(context.Background(), code)
	if err != nil {
		log.Printf("Error exchanging code for token: %v", err)
		http.Error(w, "Failed to exchange token", http.StatusInternalServerError)
		return
	}

	// Get user info from Google
	client := s.auth.OAuth2Config.Client(context.Background(), token)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		log.Printf("Error fetching user info: %v", err)
		http.Error(w, "Failed to get user info", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	var googleUser struct {
		ID      string `json:"id"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&googleUser); err != nil {
		log.Printf("Error decoding user info: %v", err)
		http.Error(w, "Failed to parse user info", http.StatusInternalServerError)
		return
	}

	// Upsert user in database
	user, err := s.store.UpsertAuthUser(r.Context(), googleUser.ID, googleUser.Email, googleUser.Name, googleUser.Picture)
	if err != nil {
		log.Printf("Error upserting user: %v", err)
		http.Error(w, "Failed to save user", http.StatusInternalServerError)
		return
	}

	// Generate JWT
	jwtToken, err := s.auth.GenerateToken(user.ID, user.Email)
	if err != nil {
		log.Printf("Error generating JWT: %v", err)
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	// Set session cookie
	auth.SetSessionCookie(w, jwtToken, isSecureRequest(r))

	// Redirect to frontend
	redirectURL := os.Getenv("FRONTEND_URL")
	if redirectURL == "" {
		redirectURL = "/"
	}
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	auth.ClearSessionCookie(w, isSecureRequest(r))

	redirectURL := os.Getenv("FRONTEND_URL")
	if redirectURL == "" {
		redirectURL = "/"
	}
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}

func (s *Server) handleGetMe(w http.ResponseWriter, r *http.Request) {
	userID := s.auth.GetUserIDFromRequest(r)
	if userID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "not authenticated"})
		return
	}

	user, err := s.store.GetAuthUser(r.Context(), userID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "user not found"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// ─── Story Handlers ───

func (s *Server) handleGetStories(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 20
	offset := 0

	if limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}
	if offsetStr != "" {
		if val, err := strconv.Atoi(offsetStr); err == nil && val >= 0 {
			offset = val
		}
	}

	// Semantic search path - DISABLED for Gemini BYOK MVP
	searchType := r.URL.Query().Get("type")
	if searchType == "semantic" {
		http.Error(w, "Semantic search is currently disabled in BYOK mode", http.StatusServiceUnavailable)
		return
	}

	sortParam := r.URL.Query().Get("sort")
	if sortParam == "new" {
		sortParam = "latest"
	}

	if sortParam != "latest" && sortParam != "votes" && sortParam != "default" && sortParam != "show" {
		sortParam = "default"
	}

	topicParams := r.URL.Query()["topic"]
	var topics []string
	for _, t := range topicParams {
		if strings.TrimSpace(t) != "" {
			topics = append(topics, t)
		}
	}

	// Pass user ID for interaction flags (empty string = anonymous)
	userID := s.auth.GetUserIDFromRequest(r)
	showHidden := r.URL.Query().Get("show_hidden") == "true"

	stories, err := s.store.GetStories(r.Context(), limit, offset, sortParam, topics, userID, showHidden)
	if err != nil {
		http.Error(w, "Failed to fetch stories", http.StatusInternalServerError)
		return
	}

	if stories == nil {
		stories = []storage.Story{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stories)
}

func (s *Server) handleGetStoryDetails(w http.ResponseWriter, r *http.Request) {
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

	comments, err := s.store.GetComments(r.Context(), id)
	if err != nil {
		http.Error(w, "Failed to fetch comments", http.StatusInternalServerError)
		return
	}

	if comments == nil {
		comments = []storage.Comment{}
	}

	response := struct {
		Story    *storage.Story    `json:"story"`
		Comments []storage.Comment `json:"comments"`
	}{
		Story:    story,
		Comments: comments,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ─── Interaction Handlers ───

func (s *Server) handleInteract(w http.ResponseWriter, r *http.Request) {
	userID := s.auth.GetUserIDFromRequest(r)
	if userID == "" {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	idStr := chi.URLParam(r, "id")
	storyID, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid story ID", http.StatusBadRequest)
		return
	}

	var body struct {
		Read   *bool `json:"read"`
		Saved  *bool `json:"saved"`
		Hidden *bool `json:"hidden"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := s.store.UpsertInteraction(r.Context(), userID, storyID, body.Read, body.Saved, body.Hidden); err != nil {
		log.Printf("Error upserting interaction: %v", err)
		http.Error(w, "Failed to update interaction", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleGetSavedStories(w http.ResponseWriter, r *http.Request) {
	userID := s.auth.GetUserIDFromRequest(r)
	if userID == "" {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 20
	offset := 0
	if limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}
	if offsetStr != "" {
		if val, err := strconv.Atoi(offsetStr); err == nil && val >= 0 {
			offset = val
		}
	}

	stories, err := s.store.GetSavedStories(r.Context(), userID, limit, offset)
	if err != nil {
		http.Error(w, "Failed to fetch saved stories", http.StatusInternalServerError)
		return
	}

	if stories == nil {
		stories = []storage.Story{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stories)
}

func (s *Server) handleSummarizeStory(w http.ResponseWriter, r *http.Request) {
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

	comments, err := s.store.GetComments(r.Context(), id)
	if err != nil {
		http.Error(w, "Failed to fetch comments", http.StatusInternalServerError)
		return
	}

	if len(comments) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"summary": "No discussion to summarize."})
		return
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Title: %s\n\nDiscussion:\n", story.Title))

	// Limit to reasonable amount of text to avoid excessive processing time
	// A naive truncation strategy
	totalChars := 0
	maxChars := 12000 // roughly 3-4k tokens

	for _, c := range comments {
		text := fmt.Sprintf("- %s: %s\n", c.By, c.Text)
		if totalChars+len(text) > maxChars {
			break
		}
		sb.WriteString(text)
		totalChars += len(text)
	}

	// Pass user's API key
	summary, err := s.aiClient.GenerateSummary(r.Context(), user.GeminiAPIKey, sb.String())
	if err != nil {
		log.Printf("Summarization failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to generate summary: " + err.Error()})
		return
	}

	// Save summary to chat history
	if err := s.store.SaveChatMessage(r.Context(), userID, id, "model", fmt.Sprintf("**Summary of \"%s\":**\n\n%s", story.Title, summary)); err != nil {
		log.Printf("Failed to save summary to history: %v", err)
		// Don't fail the request, just log
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"summary": summary})
}

func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	userID := s.auth.GetUserIDFromRequest(r)
	if userID == "" {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	var body struct {
		GeminiAPIKey string `json:"gemini_api_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := s.store.UpdateUserGeminiKey(r.Context(), userID, body.GeminiAPIKey); err != nil {
		log.Printf("Failed to update gemini key: %v", err)
		http.Error(w, "Failed to update settings", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleChat(w http.ResponseWriter, r *http.Request) {
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

	var body struct {
		StoryID int    `json:"story_id"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if body.Message == "" {
		http.Error(w, "Message is required", http.StatusBadRequest)
		return
	}

	// Save user message
	if err := s.store.SaveChatMessage(r.Context(), userID, body.StoryID, "user", body.Message); err != nil {
		log.Printf("Failed to save user message: %v", err)
		http.Error(w, "Failed to save message", http.StatusInternalServerError)
		return
	}

	// Fetch story context
	story, err := s.store.GetStory(r.Context(), body.StoryID)
	if err != nil {
		http.Error(w, "Story not found", http.StatusNotFound)
		return
	}

	comments, err := s.store.GetComments(r.Context(), body.StoryID)
	if err != nil {
		http.Error(w, "Failed to fetch comments", http.StatusInternalServerError)
		return
	}

	// Fetch chat history from DB
	dbHistory, err := s.store.GetChatHistory(r.Context(), userID, body.StoryID)
	if err != nil {
		log.Printf("Failed to fetch chat history: %v", err)
		http.Error(w, "Failed to fetch history", http.StatusInternalServerError)
		return
	}

	// Convert DB history to AI client history
	var aiHistory []ai.ChatMessage
	for _, msg := range dbHistory {
		aiHistory = append(aiHistory, ai.ChatMessage{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}
	// Note: aiHistory now includes the message we just saved.
	// GenerateChatResponse expects history EXCLUDING the new message, and the new message as separate arg?
	// Actually, looking at client.go: GenerateChatResponse(ctx, apiKey, context, history, newMessage)
	// So we should exclude the very last user message from 'history' passed to AI,
	// OR just pass it as 'newMessage' and existing history.

	// Let's filter aiHistory to exclude the last message we just added?
	// No, better to just use the `body.Message` as new message.
	// But `aiHistory` contains it now.
	// We need to pass `aiHistory` WITHOUT the last message to the client, if we want to follow that pattern.
	// OR, we can just pass `aiHistory` excluding the last item.

	effectiveHistory := aiHistory[:len(aiHistory)-1]

	// Prepare context text
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Title: %s\nURL: %s\n\nDiscussion:\n", story.Title, story.URL))

	totalChars := 0
	maxChars := 15000
	for _, c := range comments {
		text := fmt.Sprintf("- %s: %s\n", c.By, c.Text)
		if totalChars+len(text) > maxChars {
			break
		}
		sb.WriteString(text)
		totalChars += len(text)
	}

	response, err := s.aiClient.GenerateChatResponse(r.Context(), user.GeminiAPIKey, sb.String(), effectiveHistory, body.Message)
	if err != nil {
		log.Printf("Chat generation failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to generate response: " + err.Error()})
		return
	}

	// Save model response
	if err := s.store.SaveChatMessage(r.Context(), userID, body.StoryID, "model", response); err != nil {
		log.Printf("Failed to save model response: %v", err)
		// Don't fail, return response
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"response": response})
}

func (s *Server) handleGetChatHistory(w http.ResponseWriter, r *http.Request) {
	userID := s.auth.GetUserIDFromRequest(r)
	if userID == "" {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	storyIDStr := chi.URLParam(r, "id")
	storyID, err := strconv.Atoi(storyIDStr)
	if err != nil {
		http.Error(w, "Invalid story ID", http.StatusBadRequest)
		return
	}

	history, err := s.store.GetChatHistory(r.Context(), userID, storyID)
	if err != nil {
		log.Printf("Failed to fetch chat history: %v", err)
		http.Error(w, "Failed to fetch history", http.StatusInternalServerError)
		return
	}

	if history == nil {
		history = []storage.ChatMessage{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(history)
}
