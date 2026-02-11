package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/rajeshkumarblr/my_hn/internal/storage"
)

type Server struct {
	store  *storage.Store
	router *chi.Mux
}

func NewServer(store *storage.Store) *Server {
	s := &Server{
		store:  store,
		router: chi.NewRouter(),
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

	s.router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"}, // Adjust for production
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))
}

func (s *Server) routes() {
	s.router.Get("/healthc", s.handleHealthCheck)
	s.router.Get("/api/stories", s.handleGetStories)
	s.router.Get("/api/stories/{id}", s.handleGetStoryDetails)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Server) handleHealthCheck(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

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

	sortParam := r.URL.Query().Get("sort")
	// Map "new" to "latest" for backward compatibility if needed, or just use "latest"
	if sortParam == "new" {
		sortParam = "latest"
	}

	// Default to "default" (HN Rank) if not specified or invalid
	if sortParam != "latest" && sortParam != "votes" && sortParam != "default" {
		sortParam = "default"
	}

	topicParam := r.URL.Query().Get("topic")

	stories, err := s.store.GetStories(r.Context(), limit, offset, sortParam, topicParam)
	if err != nil {
		http.Error(w, "Failed to fetch stories", http.StatusInternalServerError)
		return
	}

	// Return empty array instead of null
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
		// Log error but maybe return story without comments?
		// For now, fail.
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
