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
	"github.com/rajeshkumarblr/hn_station/internal/hn"
	"github.com/rajeshkumarblr/hn_station/internal/storage"
	"golang.org/x/oauth2"
)

type Server struct {
	store        storage.DB
	router       *chi.Mux
	auth         *auth.Config
	aiClient     *ai.OllamaClient
	geminiClient *ai.GeminiClient
	hnClient     *hn.Client
	localMode    bool // true = SQLite local mode, auth disabled
	pendingAuthToken string
}

func NewServer(store storage.DB, authCfg *auth.Config, aiClient *ai.OllamaClient, geminiClient *ai.GeminiClient, localMode bool) *Server {
	s := &Server{
		store:        store,
		router:       chi.NewRouter(),
		auth:         authCfg,
		aiClient:     aiClient,
		geminiClient: geminiClient,
		hnClient:     hn.NewClient(),
		localMode:    localMode,
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
	s.router.Use(middleware.Timeout(10 * time.Minute))

	allowedOrigins := []string{"http://localhost:5173", "http://localhost:5174", "https://hnstation.dev", "http://hnstation.dev"}
	if s.localMode {
		allowedOrigins = append(allowedOrigins, "http://127.0.0.1")
	}
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
	s.router.Get("/api/stories/{id}/content", s.handleGetArticleContent)
	s.router.Get("/api/stories/{id}/check-iframe", s.handleCheckIframe)
	s.router.Get("/api/me", s.handleGetMe)
	s.router.Post("/api/user/topics", s.handleUpdateUserTopics)
	s.router.Post("/api/settings", s.handleUpdateSettings)
	s.router.Get("/api/stats", s.handleGetStats)
	s.router.Get("/api/download/latest", s.handleDownloadLatest)
	s.router.Patch("/api/stories/{id}/gemini_url", s.handleUpdateStoryGeminiURL)

	// Auth routes
	s.router.Get("/auth/google", s.handleGoogleLogin)
	s.router.Get("/auth/google/callback", s.handleGoogleCallback)
	s.router.Get("/auth/logout", s.handleLogout)
	s.router.Get("/auth/callback", s.handleDesktopCallback)

	// AI routes
	s.router.Get("/api/models/ollama", s.handleListOllamaModels)
	s.router.Post("/api/stories/{id}/summarize", s.handleSummarizeStory)
	s.router.Post("/api/stories/{id}/summarize_article", s.handleSummarizeArticle)
	s.router.Post("/api/stories/{id}/chat", s.handleChat)
	s.router.Get("/api/stories/{id}/chat", s.handleGetChatHistory)

	// Admin routes
	s.router.Group(func(r chi.Router) {
		r.Use(s.adminMiddleware)
		r.Get("/api/admin/stats", s.handleGetAdminStats)
		r.Get("/api/admin/users", s.handleGetAdminUsers)
	})

	// SPA catch-all
	// Serve index.html for any other route that doesn't match API or static files
	// This assumes the frontend build output is served from "web/dist" or similar
	// But actually, in production, usually Nginx handles this.
	// Serve static files with SPA fallback
	staticDir := os.Getenv("STATIC_FILES_DIR")
	if staticDir == "" {
		staticDir = "./web/dist"
	}
	s.FileServer("/", http.Dir(staticDir))
}

// FileServer sets up a handler that serves static files from a http.FileSystem.
// If a file is not found and the path doesn't start with /api or /auth, it falls back to serving index.html (SPA behavior).
func (s *Server) FileServer(path string, root http.FileSystem) {
	if strings.Contains(path, "{}") {
		panic("FileServer does not permit any URL parameters.")
	}

	if path != "/" && path[len(path)-1] != '/' {
		s.router.Get(path, http.RedirectHandler(path+"/", 301).ServeHTTP)
		path += "/"
	}
	path += "*"

	s.router.Get(path, func(w http.ResponseWriter, r *http.Request) {
		rctx := chi.RouteContext(r.Context())
		pathPrefix := strings.TrimSuffix(rctx.RoutePattern(), "/*")
		fs := http.StripPrefix(pathPrefix, http.FileServer(root))

		// Check if file exists
		fsPath := strings.TrimPrefix(r.URL.Path, pathPrefix)
		if fsPath == "" {
			fsPath = "/"
		}

		f, err := root.Open(fsPath)
		if err != nil {
			// If it's an API or Auth route, don't serve index.html, let Chi 404
			if strings.HasPrefix(r.URL.Path, "/api") || strings.HasPrefix(r.URL.Path, "/auth") {
				http.NotFound(w, r)
				return
			}

			// File not found, serve index.html for SPA fallback
			index, err := root.Open("index.html")
			if err != nil {
				http.NotFound(w, r)
				return
			}
			defer index.Close()
			http.ServeContent(w, r, "index.html", time.Time{}, index)
			return
		}
		f.Close()

		// Serve the file
		fs.ServeHTTP(w, r)
	})
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Server) handleGetStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.store.GetAppStats(r.Context())
	if err != nil {
		http.Error(w, "Failed to fetch stats", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
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
	proto := r.Header.Get("X-Forwarded-Proto")
	return proto == "https" || proto == "HTTPS"
}

// ─── Auth Handlers ───

func (s *Server) handleGoogleLogin(w http.ResponseWriter, r *http.Request) {
	state := auth.GenerateStateToken()

	desktopPort := r.URL.Query().Get("desktop_port")
	if desktopPort != "" {
		// Basic numeric validation to prevent malicious redirects
		if _, err := strconv.Atoi(desktopPort); err == nil {
			secure := isSecureRequest(r)
			sameSite := http.SameSiteLaxMode
			if secure {
				sameSite = http.SameSiteNoneMode
			}

			// Store desktop port in a cookie for callback
			http.SetCookie(w, &http.Cookie{
				Name:     "oauth_desktop_port",
				Value:    desktopPort,
				Path:     "/",
				MaxAge:   300,
				HttpOnly: true,
				Secure:   secure,
				SameSite: sameSite,
			})
		}
	}

	// Store state in a short-lived cookie for verification on callback
	secure := isSecureRequest(r)
	sameSite := http.SameSiteLaxMode
	if secure {
		sameSite = http.SameSiteNoneMode
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		Path:     "/",
		MaxAge:   300, // 5 minutes
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	})

	url := s.auth.OAuth2Config.AuthCodeURL(state, oauth2.AccessTypeOffline)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

func (s *Server) handleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	// Verify state for CSRF protection
	stateCookie, err := r.Cookie("oauth_state")
	receivedState := r.URL.Query().Get("state")
	if err != nil || stateCookie.Value != receivedState {
		cookieVal := "NONE"
		if err == nil {
			cookieVal = stateCookie.Value
		}
		log.Printf("Auth State Mismatch: cookie=%s, received=%s, err=%v", cookieVal, receivedState, err)
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

	// Check for desktop redirect
	desktopPort := ""
	if portCookie, err := r.Cookie("oauth_desktop_port"); err == nil {
		desktopPort = portCookie.Value
		// Clear desktop port cookie
		http.SetCookie(w, &http.Cookie{
			Name:   "oauth_desktop_port",
			Value:  "",
			Path:   "/",
			MaxAge: -1,
		})
	}

	if desktopPort != "" {
		// Redirect back to local desktop app with token and user info
		// We pass user info so the local app can update its SQLite cache immediately
		// The local app MUST have a handler for this callback.
		localCallbackURL := fmt.Sprintf("http://127.0.0.1:%s/auth/callback?token=%s&id=%s&email=%s&name=%s&avatar=%s",
			desktopPort, jwtToken, user.ID, user.Email, user.Name, user.AvatarURL)
		http.Redirect(w, r, localCallbackURL, http.StatusTemporaryRedirect)
		return
	}

	// Redirect to frontend (standard web flow)
	if s.localMode {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `
			<html>
			<head><title>Login Successful</title></head>
			<body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: #f8fafc; margin: 0;">
				<div style="text-align: center; max-width: 400px; padding: 40px; border-radius: 20px; background: #1e293b; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
					<h1 style="color: #60a5fa; margin-bottom: 10px;">Login Successful!</h1>
					<p style="color: #94a3b8; margin-bottom: 25px;">You have successfully signed in. You can now close this browser tab and return to the HN Station app.</p>
					<button onclick="window.close()" style="padding: 12px 24px; background: #3b82f6; border: none; color: white; border-radius: 10px; cursor: pointer; font-weight: bold; transition: background 0.2s;">Close Tab</button>
				</div>
			</body>
			</html>
		`)
		return
	}

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
		if s.localMode {
			w.Header().Set("Content-Type", "text/html")
			fmt.Fprint(w, `
				<html>
				<head><title>Logged Out</title></head>
				<body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: #f8fafc; margin: 0;">
					<div style="text-align: center; max-width: 400px; padding: 40px; border-radius: 20px; background: #1e293b; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
						<h1 style="color: #ef4444; margin-bottom: 10px;">Logged Out</h1>
						<p style="color: #94a3b8; margin-bottom: 25px;">You have been successfully logged out of HN Station. You can now close this browser tab.</p>
						<button onclick="window.close()" style="padding: 12px 24px; background: #475569; border: none; color: white; border-radius: 10px; cursor: pointer; font-weight: bold;">Close Tab</button>
					</div>
				</body>
				</html>
			`)
			return
		}
		redirectURL = "/"
	}
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}

func (s *Server) handleDesktopCallback(w http.ResponseWriter, r *http.Request) {
	// Only allow in local mode (security)
	if !s.localMode {
		http.Error(w, "Endpoint only available in local mode", http.StatusForbidden)
		return
	}

	id := r.URL.Query().Get("id")
	email := r.URL.Query().Get("email")
	name := r.URL.Query().Get("name")
	avatar := r.URL.Query().Get("avatar")

	if id != "" {
		// Use Background context to ensure write completes even if browser tab closes fast
		if _, err := s.store.UpsertAuthUser(context.Background(), id, email, name, avatar); err != nil {
			log.Printf("Failed to cache proxy user in local DB: %v", err)
		}
	}

	// We trust the proxy redirect to 127.0.0.1:58090.
	// Since the local agent has a different JWT_SECRET than the cloud,
	// we generate a NEW local token for this user so handleGetMe can validate it.
	localToken, err := s.auth.GenerateToken(id, email)
	if err != nil {
		log.Printf("[AUTH] Failed to generate local token for %s: %v", id, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Save token for Electron app to claim via handleGetMe poll
	s.pendingAuthToken = localToken

	// Show success page
	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, `
		<html>
		<head><title>Cloud Sync Enabled</title></head>
		<body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: #f8fafc; margin: 0;">
			<div style="text-align: center; max-width: 400px; padding: 40px; border-radius: 20px; background: #1e293b; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
				<h1 style="color: #60a5fa; margin-bottom: 10px;">Cloud Sync Enabled!</h1>
				<p style="color: #94a3b8; margin-bottom: 25px;">You have successfully linked your account. Your bookmarks and filters will now sync with the cloud.</p>
				<button onclick="window.close()" style="padding: 12px 24px; background: #3b82f6; border: none; color: white; border-radius: 10px; cursor: pointer; font-weight: bold;">Close Tab</button>
				<script>setTimeout(() => window.close(), 5000);</script>
			</div>
		</body>
		</html>
	`)
}

func (s *Server) handleGetMe(w http.ResponseWriter, r *http.Request) {
	userID := s.auth.GetUserIDFromRequest(r)

	var claimedToken string
	// In local mode, if we're not logged in but have a pending token from the auth proxy, claim it!
	if userID == "" && s.localMode && s.pendingAuthToken != "" {
		claims, err := s.auth.ValidateToken(s.pendingAuthToken)
		if err == nil && claims != nil {
			userID = claims.UserID
			auth.SetSessionCookie(w, s.pendingAuthToken, isSecureRequest(r))
			claimedToken = s.pendingAuthToken
			s.pendingAuthToken = ""
		}
	}

	// Determine Ollama availability
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://localhost:11434"
	}
	ollamaAvailable := s.aiClient.CheckAvailability(r.Context(), ollamaURL)

	// Get AI enabled setting
	aiEnabled := false
	if val, err := s.store.GetSetting(r.Context(), "ai_summaries_enabled"); err == nil && val == "true" {
		aiEnabled = true
	}

	ollamaModel, _ := s.store.GetSetting(r.Context(), "ollama_model")
	aiProvider, _ := s.store.GetSetting(r.Context(), "ai_provider")
	if aiProvider == "" {
		aiProvider = "local" // Default to local
	}

	// Get available models if Ollama is available
	var ollamaModels []string
	if ollamaAvailable {
		ollamaModels, _ = s.aiClient.ListModels(r.Context(), ollamaURL)
	}

	// In local mode, if not authenticated, return a default mock user with authenticated: true
	if userID == "" && s.localMode {
		topics, _ := s.store.GetActiveTopics(r.Context())
		if topics == nil {
			topics = []string{}
		}

		geminiKey, _ := s.store.GetSetting(r.Context(), "gemini_api_key")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":                   "local-user",
			"email":                "local@hnstation.app",
			"name":                 "Local User",
			"avatar_url":           "",
			"is_admin":             true,
			"authenticated":        true, // Local-first: always authenticated
			"topics":               topics,
			"ai_summaries_enabled": aiEnabled,
			"ai_provider":          aiProvider,
			"gemini_api_key":       geminiKey,
			"ollama_available":     ollamaAvailable,
			"ollama_model":         ollamaModel,
			"ollama_models":        ollamaModels,
			"jwt_token":            claimedToken,
		})
		return
	}

	if userID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "not authenticated"})
		return
	}

	user, err := s.store.GetAuthUser(r.Context(), userID)
	if err != nil || user == nil {
		if err != nil {
			log.Printf("Error fetching claimed user %s: %v", userID, err)
		} else {
			log.Printf("Claimed user %s not found in database", userID)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "user not found"})
		return
	}

	// Map to response struct that includes the extra fields
	resp := struct {
		*storage.AuthUser
		Authenticated      bool     `json:"authenticated"`
		AISummariesEnabled bool     `json:"ai_summaries_enabled"`
		OllamaAvailable    bool     `json:"ollama_available"`
		OllamaModel        string   `json:"ollama_model"`
		OllamaModels       []string `json:"ollama_models"`
		AIProvider         string   `json:"ai_provider"`
		JWTToken           string   `json:"jwt_token,omitempty"`
	}{
		AuthUser:           user,
		Authenticated:      true, // Real session
		AISummariesEnabled: aiEnabled,
		OllamaAvailable:    ollamaAvailable,
		OllamaModel:        ollamaModel,
		OllamaModels:       ollamaModels,
		AIProvider:         aiProvider,
		JWTToken:           claimedToken,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ─── Story Handlers ───

func (s *Server) handleGetStories(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 10
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

	stories, total, err := s.store.GetStories(r.Context(), limit, offset, sortParam, topics, userID, showHidden)
	if err != nil {
		http.Error(w, "Failed to fetch stories", http.StatusInternalServerError)
		return
	}

	if stories == nil {
		stories = []storage.Story{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"stories": stories,
		"total":   total,
	})
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
		if s.localMode {
			userID = "local-user"
		} else {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}
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

	log.Printf("[interact] Story %d: saved=%v, read=%v, hidden=%v", storyID, body.Saved, body.Read, body.Hidden)

	if err := s.store.UpsertInteraction(r.Context(), userID, storyID, body.Read, body.Saved, body.Hidden); err != nil {
		// If story not found and we are in local mode, try to fetch it from HN and save it first
		if s.localMode && strings.Contains(err.Error(), "not found in database") {
			item, fetchErr := s.hnClient.GetItem(r.Context(), storyID)
			if fetchErr == nil && item != nil {
				// Convert HN item to storage.Story
				story := storage.Story{
					ID:          int64(item.ID),
					Title:       item.Title,
					URL:         item.URL,
					Score:       item.Score,
					By:          item.By,
					Descendants: item.Descendants,
					PostedAt:    time.Unix(item.Time, 0),
					CreatedAt:   time.Now(),
				}
				// Save story to DB
				if upsertErr := s.store.UpsertStory(r.Context(), story); upsertErr == nil {
					// Retry interaction
					if retryErr := s.store.UpsertInteraction(r.Context(), userID, storyID, body.Read, body.Saved, body.Hidden); retryErr == nil {
						w.Header().Set("Content-Type", "application/json")
						json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
						return
					}
				}
			}
		}

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
		if s.localMode {
			userID = "local-user"
		} else {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}
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

	stories, total, err := s.store.GetSavedStories(r.Context(), userID, limit, offset)
	if err != nil {
		http.Error(w, "Failed to fetch saved stories", http.StatusInternalServerError)
		return
	}

	if stories == nil {
		stories = []storage.Story{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"stories": stories,
		"total":   total,
	})
}

func (s *Server) handleUpdateStoryGeminiURL(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, _ := strconv.ParseInt(idStr, 10, 64)

	var payload struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := s.store.UpdateStoryGeminiURL(r.Context(), id, payload.URL); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
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

	// 1. Check Global Cache (Short-circuit if already summarized)
	// This part is allowed for anonymous users.
	if story.Summary != nil && *story.Summary != "" {
		userID := s.auth.GetUserIDFromRequest(r)
		if userID != "" {
			if err := s.store.SaveChatMessage(r.Context(), userID, id, "model", fmt.Sprintf("**Summary of \"%s\":**\n\n%s", story.Title, *story.Summary)); err != nil {
				log.Printf("Failed to save cached summary to history: %v", err)
			}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"summary": *story.Summary})
		return
	}

	// In local mode any request can generate summaries (no auth wall)
	userID := s.auth.GetUserIDFromRequest(r)
	if userID == "" && !s.localMode {
		http.Error(w, "Authentication required to generate new summary", http.StatusUnauthorized)
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

	totalChars := 0
	maxChars := 20000 // Increased for local GPU
	for _, c := range comments {
		text := fmt.Sprintf("- %s: %s\n", c.By, c.Text)
		if totalChars+len(text) > maxChars {
			break
		}
		sb.WriteString(text)
		totalChars += len(text)
	}

	// Determine provider preference
	provider, _ := s.store.GetSetting(r.Context(), "ai_provider")
	if provider == "" {
		provider = "local"
	}

	var summary string
	var topics []string
	var summarizeErr error

	// 1. Try Local Ollama if provider is "local" or "both"
	if provider == "local" || provider == "both" {
		ollamaURL := os.Getenv("OLLAMA_URL")
		if ollamaURL == "" {
			ollamaURL = "http://localhost:11434"
		}
		model, _ := s.store.GetSetting(r.Context(), "ollama_model")
		responseStr, err := s.aiClient.GenerateSummary(r.Context(), ollamaURL, model, story.Title, sb.String())
		if err == nil {
			// Success with local
			summary, topics = parseOllamaResponse(responseStr)
		} else {
			summarizeErr = err
			log.Printf("Ollama summarization failed: %v", err)
		}
	}

	// 2. Fallback to Gemini if:
	// - Local failed OR provider is "gemini"
	// - AND provider is "gemini" or "both"
	// - AND user has gemini key
	if summary == "" && (provider == "gemini" || provider == "both") {
		// Get Gemini API Key
		var geminiKey string
		if s.localMode {
			geminiKey = os.Getenv("GEMINI_API_KEY") // System key fallback
		}
		if u, err := s.store.GetAuthUser(r.Context(), userID); err == nil && u.GeminiAPIKey != "" {
			geminiKey = u.GeminiAPIKey
		}

		if geminiKey != "" {
			log.Printf("Attempting fallback/primary Gemini summarization for story %d", id)
			resp, err := s.geminiClient.GenerateSummary(r.Context(), geminiKey, sb.String())
			if err == nil {
				summary = resp
				// topics? Gemini client doesn't explicitly return topics yet, but we can extract them if they are in bullet points
				// or just leave them empty for now.
			} else {
				summarizeErr = err
				log.Printf("Gemini summarization failed: %v", err)
			}
		}
	}

	if summary == "" {
		log.Printf("All summarization attempts failed for story %d", id)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		errMsg := "Failed to generate summary"
		if summarizeErr != nil {
			errMsg += ": " + summarizeErr.Error()
		}
		json.NewEncoder(w).Encode(map[string]string{"error": errMsg})
		return
	}

	result := struct {
		Summary string
		Topics  []string
	}{
		Summary: summary,
		Topics:  topics,
	}

	// 2. Save both Summary and Topics to Global Cache
	if err := s.store.UpdateStorySummaryAndTopics(r.Context(), id, result.Summary, result.Topics); err != nil {
		log.Printf("Failed to update story summary/topics cache: %v", err)
	}

	// Save summary to chat history
	if err := s.store.SaveChatMessage(r.Context(), userID, id, "model", fmt.Sprintf("**Summary of \"%s\":**\n\n%s", story.Title, result.Summary)); err != nil {
		log.Printf("Failed to save summary to history: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"summary": result.Summary,
		"topics":  result.Topics,
	})
}

func (s *Server) handleChat(w http.ResponseWriter, r *http.Request) {
	storyIDStr := chi.URLParam(r, "id")
	storyID, err := strconv.Atoi(storyIDStr)
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

	var req struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// 1. Get Story Context
	story, err := s.store.GetStory(r.Context(), storyID)
	if err != nil {
		http.Error(w, "Story not found", http.StatusNotFound)
		return
	}

	comments, _ := s.store.GetComments(r.Context(), storyID)
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Title: %s\nURL: %s\n\nDiscussion:\n", story.Title, story.URL))
	for i, c := range comments {
		if i > 50 { // Limit to top 50 comments for context
			break
		}
		sb.WriteString(fmt.Sprintf("- %s: %s\n", c.By, c.Text))
	}
	if story.Summary != nil {
		sb.WriteString(fmt.Sprintf("\nSummary: %s\n", *story.Summary))
	}

	// 2. Get History
	history, _ := s.store.GetChatHistory(r.Context(), userID, storyID)
	aiHistory := make([]ai.ChatMessage, len(history))
	for i, m := range history {
		aiHistory[i] = ai.ChatMessage{Role: m.Role, Content: m.Content}
	}

	// 3. Generate AI Response
	provider, _ := s.store.GetSetting(r.Context(), "ai_provider")
	if provider == "" {
		provider = "local"
	}

	var response string
	var chatErr error

	if provider == "local" || provider == "both" {
		ollamaURL := os.Getenv("OLLAMA_URL")
		if ollamaURL == "" {
			ollamaURL = "http://localhost:11434"
		}
		model, _ := s.store.GetSetting(r.Context(), "ollama_model")
		response, chatErr = s.aiClient.GenerateChatResponse(r.Context(), ollamaURL, model, sb.String(), aiHistory, req.Message)
	}

	if response == "" && (provider == "gemini" || provider == "both") {
		var geminiKey string
		if s.localMode {
			geminiKey = os.Getenv("GEMINI_API_KEY")
		}
		if u, err := s.store.GetAuthUser(r.Context(), userID); err == nil && u.GeminiAPIKey != "" {
			geminiKey = u.GeminiAPIKey
		}

		if geminiKey != "" {
			response, chatErr = s.geminiClient.GenerateChatResponse(r.Context(), geminiKey, sb.String(), aiHistory, req.Message)
		}
	}

	if chatErr != nil {
		log.Printf("Chat generation failed: %v", chatErr)
		http.Error(w, "Failed to generate AI response", http.StatusInternalServerError)
		return
	}

	// 4. Save to History
	if err := s.store.SaveChatMessage(r.Context(), userID, storyID, "user", req.Message); err != nil {
		log.Printf("Failed to save user message: %v", err)
	}
	if err := s.store.SaveChatMessage(r.Context(), userID, storyID, "model", response); err != nil {
		log.Printf("Failed to save AI response: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"response": response})
}

func (s *Server) handleGetChatHistory(w http.ResponseWriter, r *http.Request) {
	storyIDStr := chi.URLParam(r, "id")
	storyID, err := strconv.Atoi(storyIDStr)
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

	history, err := s.store.GetChatHistory(r.Context(), userID, storyID)
	if err != nil {
		http.Error(w, "Failed to fetch chat history", http.StatusInternalServerError)
		return
	}

	if history == nil {
		history = []storage.ChatMessage{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(history)
}

func (s *Server) handleUpdateUserTopics(w http.ResponseWriter, r *http.Request) {
	userID := s.auth.GetUserIDFromRequest(r)
	if userID == "" {
		if s.localMode {
			userID = "local-user"
		} else {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}
	}

	var req struct {
		Topics []string `json:"topics"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if err := s.store.UpdateUserTopics(r.Context(), userID, req.Topics); err != nil {
		http.Error(w, "Failed to update topics", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	userID := s.auth.GetUserIDFromRequest(r)
	if userID == "" {
		if s.localMode {
			userID = "local-user"
		} else {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}
	}

	var body struct {
		GeminiAPIKey       string `json:"gemini_api_key"`
		AISummariesEnabled *bool  `json:"ai_summaries_enabled"`
		OllamaModel        string `json:"ollama_model"`
		AIProvider         string `json:"ai_provider"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if body.GeminiAPIKey != "" {
		if err := s.store.UpdateUserGeminiKey(r.Context(), userID, body.GeminiAPIKey); err != nil {
			log.Printf("Failed to update gemini key: %v", err)
			http.Error(w, "Failed to update settings", http.StatusInternalServerError)
			return
		}
	}

	if body.AISummariesEnabled != nil {
		val := "false"
		if *body.AISummariesEnabled {
			val = "true"
		}
		if err := s.store.SetSetting(r.Context(), "ai_summaries_enabled", val); err != nil {
			log.Printf("Failed to update AI enabled setting: %v", err)
			http.Error(w, "Failed to update settings", http.StatusInternalServerError)
			return
		}
	}

	if body.AIProvider != "" {
		if err := s.store.SetSetting(r.Context(), "ai_provider", body.AIProvider); err != nil {
			log.Printf("Failed to update AI provider setting: %v", err)
			http.Error(w, "Failed to update settings", http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleDownloadLatest(w http.ResponseWriter, r *http.Request) {
	// For now, redirect to a placeholder or a real static link if we have one.
	// In the future, this can serve the actual EXE/DMG from a blob storage.
	http.Redirect(w, r, "https://github.com/rajeshkumarblr/hn_station", http.StatusTemporaryRedirect)
}

// parseOllamaResponse handles the logic moved out of handleSummarizeStory for reuse
func parseOllamaResponse(responseStr string) (string, []string) {
	cleanJSON := strings.TrimSpace(responseStr)
	cleanJSON = strings.TrimPrefix(cleanJSON, "```json")
	cleanJSON = strings.TrimPrefix(cleanJSON, "```")
	cleanJSON = strings.TrimSuffix(cleanJSON, "```")
	cleanJSON = strings.TrimSpace(cleanJSON)

	var intermediate struct {
		Summary interface{} `json:"summary"`
		Topics  []string    `json:"topics"`
	}

	var summary string
	var topics []string

	if err := json.Unmarshal([]byte(cleanJSON), &intermediate); err != nil {
		log.Printf("Failed to parse Ollama JSON. Error: %v. Raw: %s", err, responseStr)
		summary = responseStr // Fallback
	} else {
		switch v := intermediate.Summary.(type) {
		case string:
			summary = v
		case []interface{}:
			var parts []string
			for _, part := range v {
				if s, ok := part.(string); ok {
					parts = append(parts, s)
				}
			}
			summary = strings.Join(parts, "\n")
		default:
			summary = fmt.Sprintf("%v", v)
		}
		topics = intermediate.Topics
	}
	return summary, topics
}

// ─── Admin Handlers ───

func (s *Server) adminMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := s.auth.GetUserIDFromRequest(r)
		if userID == "" {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}

		user, err := s.store.GetAuthUser(r.Context(), userID)
		if err != nil {
			http.Error(w, "User not found", http.StatusUnauthorized)
			return
		}

		if !user.IsAdmin {
			http.Error(w, "Access denied", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleGetAdminStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.store.GetAppStats(r.Context())
	if err != nil {
		log.Printf("Failed to fetch admin stats: %v", err)
		http.Error(w, "Failed to fetch stats", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func (s *Server) handleGetAdminUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.store.GetAllUsers(r.Context())
	if err != nil {
		log.Printf("Failed to fetch admin users: %v", err)
		http.Error(w, "Failed to fetch users", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

func (s *Server) handleListOllamaModels(w http.ResponseWriter, r *http.Request) {
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://localhost:11434"
	}

	models, err := s.aiClient.ListModels(r.Context(), ollamaURL)
	if err != nil {
		http.Error(w, "Failed to list models: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string][]string{"models": models})
}

func (s *Server) handleCheckIframe(w http.ResponseWriter, r *http.Request) {
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
		json.NewEncoder(w).Encode(map[string]bool{"iframe_blocked": true})
		return
	}

	// If we already know, return it
	if story.IframeBlocked != nil {
		json.NewEncoder(w).Encode(map[string]bool{"iframe_blocked": *story.IframeBlocked})
		return
	}

	// Perform HEAD request to check headers
	client := &http.Client{
		Timeout: 5 * time.Second,
		// Don't follow redirects too far, or at all for HEAD
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	req, err := http.NewRequestWithContext(r.Context(), "GET", story.URL, nil)
	if err != nil {
		http.Error(w, "Failed to create check request", http.StatusInternalServerError)
		return
	}
	// Add a common User-Agent to avoid some basic bot blocks
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Iframe check failed for %s: %v", story.URL, err)
		// If we can't reach it, assume it might be blocked or just return unknown
		// For UX, it's safer to assume blocked if we can't even HEAD it?
		// Actually let's just return false and let the iframe fail if it must.
		json.NewEncoder(w).Encode(map[string]bool{"iframe_blocked": false})
		return
	}
	defer resp.Body.Close()

	blocked := false
	xfo := strings.ToUpper(resp.Header.Get("X-Frame-Options"))
	if xfo == "DENY" || xfo == "SAMEORIGIN" {
		blocked = true
	}

	csp := strings.ToLower(resp.Header.Get("Content-Security-Policy"))
	if strings.Contains(csp, "frame-ancestors 'none'") || strings.Contains(csp, "frame-ancestors 'self'") {
		blocked = true
	}

	// Update DB
	if err := s.store.UpdateStoryIframeStatus(r.Context(), id, blocked); err != nil {
		log.Printf("Failed to update iframe status in DB: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"iframe_blocked": blocked})
}
