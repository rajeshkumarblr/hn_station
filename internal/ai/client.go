package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	pgvector "github.com/pgvector/pgvector-go"
)

// OllamaClient communicates with a self-hosted Ollama instance for embeddings.
type OllamaClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewOllamaClient creates a new client for the Ollama API.
func NewOllamaClient(baseURL string) *OllamaClient {
	return &OllamaClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			// Increased timeout for generation tasks
			Timeout: 120 * time.Second,
		},
	}
}

type embeddingRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

type embeddingResponse struct {
	Embedding []float32 `json:"embedding"`
}

type generateRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
}

type generateResponse struct {
	Response string `json:"response"`
	Done     bool   `json:"done"`
}

// GetEmbedding generates an embedding vector for the given text using nomic-embed-text.
func (c *OllamaClient) GetEmbedding(ctx context.Context, text string) (pgvector.Vector, error) {
	reqBody := embeddingRequest{
		Model:  "nomic-embed-text",
		Prompt: text,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return pgvector.Vector{}, fmt.Errorf("marshal embedding request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("%s/api/embeddings", c.baseURL), bytes.NewReader(body))
	if err != nil {
		return pgvector.Vector{}, fmt.Errorf("create embedding request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return pgvector.Vector{}, fmt.Errorf("ollama embedding request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return pgvector.Vector{}, fmt.Errorf("ollama returned status %d", resp.StatusCode)
	}

	var result embeddingResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return pgvector.Vector{}, fmt.Errorf("decode embedding response: %w", err)
	}

	if len(result.Embedding) == 0 {
		return pgvector.Vector{}, fmt.Errorf("ollama returned empty embedding")
	}

	return pgvector.NewVector(result.Embedding), nil
}

// Summarize generates a summary of the provided text using llama3.2:1b.
func (c *OllamaClient) Summarize(ctx context.Context, text string) (string, error) {
	prompt := fmt.Sprintf("Summarize the key points from this Hacker News discussion in concise bullet points:\n\n%s", text)

	reqBody := generateRequest{
		Model:  "llama3.2:1b",
		Prompt: prompt,
		Stream: false,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal summaries request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("%s/api/generate", c.baseURL), bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create generation request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("ollama generation request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("ollama returned status %d", resp.StatusCode)
	}

	var result generateResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode generation response: %w", err)
	}

	return result.Response, nil
}
