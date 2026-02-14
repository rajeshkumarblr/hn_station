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
	"github.com/rajeshkumarblr/my_hn/internal/ai"
	"github.com/rajeshkumarblr/my_hn/internal/auth"
	"github.com/rajeshkumarblr/my_hn/internal/storage"
	"golang.org/x/oauth2"
)

type Server struct {
	store    *storage.Store
	router   *chi.Mux
	auth     *auth.Config
	aiClient *ai.OllamaClient
}

func NewServer(store *storage.Store, authCfg *auth.Config, aiClient *ai.OllamaClient) *Server {
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

	// Auth routes
	s.router.Get("/auth/google", s.handleGoogleLogin)
	s.router.Get("/auth/google/callback", s.handleGoogleCallback)
	s.router.Get("/auth/logout", s.handleLogout)

	// AI routes
	s.router.Post("/api/stories/{id}/summarize", s.handleSummarizeStory)
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

	// Semantic search path
	searchType := r.URL.Query().Get("type")
	if searchType == "semantic" {
		query := r.URL.Query().Get("q")
		if query == "" {
			http.Error(w, "query parameter 'q' is required for semantic search", http.StatusBadRequest)
			return
		}
		if s.aiClient == nil {
			http.Error(w, "semantic search is not configured", http.StatusServiceUnavailable)
			return
		}

		embedding, err := s.aiClient.GetEmbedding(r.Context(), query)
		if err != nil {
			log.Printf("Failed to get query embedding: %v", err)
			http.Error(w, "Failed to process search query", http.StatusInternalServerError)
			return
		}

		stories, err := s.store.SearchStories(r.Context(), embedding, limit)
		if err != nil {
			log.Printf("Semantic search failed: %v", err)
			http.Error(w, "Search failed", http.StatusInternalServerError)
			return
		}
		if stories == nil {
			stories = []storage.Story{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(stories)
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

	stories, err := s.store.GetStories(r.Context(), limit, offset, sortParam, topics, userID)
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
		Read  *bool `json:"read"`
		Saved *bool `json:"saved"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := s.store.UpsertInteraction(r.Context(), userID, storyID, body.Read, body.Saved); err != nil {
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

	summary, err := s.aiClient.Summarize(r.Context(), sb.String())
	if err != nil {
		log.Printf("Summarization failed: %v", err)
		http.Error(w, "Failed to generate summary", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"summary": summary})
}
