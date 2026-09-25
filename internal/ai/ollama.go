package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/rajeshkumarblr/hn_station/internal/tags"
)

// OllamaClient handles interactions with a local Ollama server.
type OllamaClient struct{}

// NewOllamaClient creates a new instance of OllamaClient.
func NewOllamaClient() *OllamaClient {
	return &OllamaClient{}
}

// isLiteRT returns true if the target URL is a LiteRT-LM / OpenAI-compatible server (e.g. port 9379 or /v1).
func isLiteRT(apiURL string) bool {
	return strings.Contains(apiURL, ":9379") || strings.Contains(apiURL, "/v1") || !strings.Contains(apiURL, ":11434")
}

func trimBaseURL(apiURL string) string {
	u := strings.TrimRight(apiURL, "/")
	u = strings.TrimSuffix(u, "/v1")
	return u
}

// stripHTML removes script/style blocks and HTML tags to save local LLM context window tokens.
func stripHTML(input string) string {
	var out strings.Builder
	inTag := false
	lastSpace := false
	for i := 0; i < len(input); i++ {
		c := input[i]
		if c == '<' {
			inTag = true
			continue
		}
		if c == '>' {
			inTag = false
			if !lastSpace {
				out.WriteByte(' ')
				lastSpace = true
			}
			continue
		}
		if !inTag {
			if c == ' ' || c == '\t' || c == '\n' || c == '\r' {
				if !lastSpace {
					out.WriteByte(' ')
					lastSpace = true
				}
			} else {
				out.WriteByte(c)
				lastSpace = false
			}
		}
	}
	return strings.TrimSpace(out.String())
}

// listDiskLiteRTModels scans ~/.litert-lm/models/*/model.litertlm directly so we always discover
// the user's downloaded LiteRT-LM models even on litert-lm versions without GET /v1/models.
func listDiskLiteRTModels() []string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return nil
	}
	pattern := filepath.Join(home, ".litert-lm", "models", "*", "model.litertlm")
	matches, err := filepath.Glob(pattern)
	if err != nil || len(matches) == 0 {
		return nil
	}
	var models []string
	for _, m := range matches {
		dirName := filepath.Base(filepath.Dir(m))
		if dirName != "" && dirName != "." {
			models = append(models, dirName)
		}
	}
	return models
}

// resolveModel picks an available model from LiteRT-LM (~/.litert-lm/models or /v1/models) if model is empty or not found on the server.
func (c *OllamaClient) resolveModel(ctx context.Context, apiURL string, model string) string {
	models, err := c.ListModels(ctx, apiURL)
	if err == nil && len(models) > 0 {
		for _, m := range models {
			if m == model || strings.ReplaceAll(m, "--", "/") == model || strings.ReplaceAll(model, "/", "--") == m {
				return m
			}
		}
		return models[0]
	}
	if model != "" && model != "llama3.2:3b" {
		return model
	}
	if isLiteRT(apiURL) {
		return "gemma4-e2b-hw-int4-20260622"
	}
	return "llama3.2:3b"
}

// CheckAvailability verifies if the LiteRT-LM or Ollama server is reachable.
func (c *OllamaClient) CheckAvailability(ctx context.Context, apiURL string) bool {
	client := &http.Client{Timeout: 1500 * time.Millisecond}
	base := trimBaseURL(apiURL)

	// Check LiteRT-LM / OpenAI-compatible /v1/models first.
	// Note: older litert-lm serve versions only implement do_POST and return 501/404 for GET,
	// which still proves the LiteRT-LM HTTP server is alive and listening on port 9379.
	if req, err := http.NewRequestWithContext(ctx, "GET", base+"/v1/models", nil); err == nil {
		if resp, err := client.Do(req); err == nil {
			resp.Body.Close()
			if isLiteRT(apiURL) || resp.StatusCode == http.StatusOK {
				return true
			}
		}
	}

	// Fallback: check root URL
	req, err := http.NewRequestWithContext(ctx, "GET", base, nil)
	if err != nil {
		return false
	}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if isLiteRT(apiURL) {
		return true
	}
	return resp.StatusCode == http.StatusOK
}

// GenerateSummary generates a concise summary and tags using the local LiteRT-LM (or Ollama) server.
func (c *OllamaClient) GenerateSummary(ctx context.Context, apiURL string, model string, title string, text string) (string, error) {
	model = c.resolveModel(ctx, apiURL, model)

	// Strip HTML markup and cap length so local models stay well within context window limits
	cleanText := stripHTML(text)
	if len(cleanText) < 80 {
		cleanText = text
	}
	limit := 4500
	if len(cleanText) > limit {
		cleanText = cleanText[:limit] + "... [truncated for context]"
	}

	log.Printf("LocalAIClient: Starting summarization for %q using model %q at %s. Clean text length: %d (raw: %d)", title, model, apiURL, len(cleanText), len(text))

	tagInstructions := tags.GetManager().GetPromptInstructions()
	prompt := fmt.Sprintf(`Analyze the following article and return a high-quality summary and tags.
<Title>%s</Title>
<ArticleText>%s</ArticleText>

INSTRUCTIONS:
- You MUST return a valid JSON object.
- Use ONLY these two keys: "summary" and "topics".
- "summary" MUST be an array of 5 short, impactful bullet points.
- "topics" MUST be an array of up to 3 one-word technical tags. %s
- PRIORITIZE RELEVANCE: If no technical tags from the provided list apply, return an empty array [].
- DO NOT hallucinate or force unrelated tags.
- Output NOTHING except the JSON.`, title, cleanText, tagInstructions)

	return c.generateWithRetry(ctx, apiURL, model, prompt)
}

// ChatMessage represents a message in the chat history.
type OllamaChatRequest struct {
	Model    string        `json:"model"`
	Messages []MessagePart `json:"messages"`
	Stream   bool          `json:"stream"`
}

type MessagePart struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type OllamaChatResponse struct {
	Message MessagePart `json:"message"`
	Choices []struct {
		Message MessagePart `json:"message"`
		Delta   MessagePart `json:"delta"`
	} `json:"choices"`
}

// GenerateChatResponse generates a response to a user message, given context and history.
func (c *OllamaClient) GenerateChatResponse(ctx context.Context, apiURL string, model string, contextText string, history []ChatMessage, newMessage string) (string, error) {
	model = c.resolveModel(ctx, apiURL, model)
	log.Printf("LocalAIClient: Starting chat using model %q at %s. History length: %d", model, apiURL, len(history))

	messages := []MessagePart{
		{
			Role:    "system",
			Content: fmt.Sprintf("Here is the content of the Hacker News story and discussion we will talk about:\n\n%s\n\nPlease answer my future questions based on this context.", contextText),
		},
		{
			Role:    "assistant",
			Content: "Understood. I have read the story and discussion. I am ready to answer your questions about it.",
		},
	}

	for _, msg := range history {
		role := "user"
		if msg.Role == "model" || msg.Role == "assistant" {
			role = "assistant"
		}
		messages = append(messages, MessagePart{
			Role:    role,
			Content: msg.Content,
		})
	}

	messages = append(messages, MessagePart{
		Role:    "user",
		Content: newMessage,
	})

	reqBody := OllamaChatRequest{
		Model:    model,
		Messages: messages,
		Stream:   false,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal chat request: %w", err)
	}

	base := trimBaseURL(apiURL)
	if isLiteRT(apiURL) {
		return c.doOllamaRequest(ctx, base+"/v1/chat/completions", jsonData)
	}
	return c.doOllamaRequest(ctx, base+"/api/chat", jsonData)
}

// StreamChatResponse streams a response to a user message (supports both LiteRT-LM SSE and Ollama NDJSON).
func (c *OllamaClient) StreamChatResponse(ctx context.Context, apiURL string, model string, contextText string, history []ChatMessage, newMessage string, onChunk func(string)) error {
	model = c.resolveModel(ctx, apiURL, model)

	messages := []MessagePart{
		{
			Role:    "system",
			Content: fmt.Sprintf("Here is the content of the Hacker News story and discussion we will talk about:\n\n%s\n\nPlease answer my future questions based on this context.", contextText),
		},
		{
			Role:    "assistant",
			Content: "Understood. I have read the story and discussion. I am ready to answer your questions about it.",
		},
	}

	for _, msg := range history {
		role := "user"
		if msg.Role == "model" || msg.Role == "assistant" {
			role = "assistant"
		}
		messages = append(messages, MessagePart{
			Role:    role,
			Content: msg.Content,
		})
	}

	messages = append(messages, MessagePart{
		Role:    roleUser,
		Content: newMessage,
	})

	base := trimBaseURL(apiURL)
	if isLiteRT(apiURL) {
		// Use non-streaming /v1/chat/completions or SSE chunks cleanly
		respText, err := c.GenerateChatResponse(ctx, apiURL, model, contextText, history, newMessage)
		if err != nil {
			return err
		}
		onChunk(respText)
		return nil
	}

	reqBody := OllamaChatRequest{
		Model:    model,
		Messages: messages,
		Stream:   true,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal chat request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", base+"/api/chat", bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("local AI server returned status %d", resp.StatusCode)
	}

	decoder := json.NewDecoder(resp.Body)
	for {
		var chunk struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			Done bool `json:"done"`
		}
		if err := decoder.Decode(&chunk); err != nil {
			if err == io.EOF {
				break
			}
			return err
		}
		if chunk.Message.Content != "" {
			onChunk(chunk.Message.Content)
		}
		if chunk.Done {
			break
		}
	}

	return nil
}

const (
	roleUser      = "user"
	roleAssistant = "assistant"
)

type OllamaGenerateRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
	Format string `json:"format,omitempty"`
}

type OllamaGenerateResponse struct {
	Response string `json:"response"`
}

// generateWithRetry executes a JSON generation call with retries.
func (c *OllamaClient) generateWithRetry(ctx context.Context, apiURL string, model string, prompt string) (string, error) {
	base := trimBaseURL(apiURL)
	var endpoint string
	var jsonData []byte
	var err error

	if isLiteRT(apiURL) {
		endpoint = base + "/v1/chat/completions"
		chatReq := OllamaChatRequest{
			Model: model,
			Messages: []MessagePart{
				{Role: "user", Content: prompt},
			},
			Stream: false,
		}
		jsonData, err = json.Marshal(chatReq)
	} else {
		endpoint = base + "/api/generate"
		reqBody := OllamaGenerateRequest{
			Model:  model,
			Prompt: prompt,
			Stream: false,
			Format: "json",
		}
		jsonData, err = json.Marshal(reqBody)
	}
	if err != nil {
		return "", fmt.Errorf("failed to marshal generate request: %w", err)
	}

	var lastErr error
	backoff := 2 * time.Second
	maxRetries := 3

	for retries := 0; retries < maxRetries; retries++ {
		result, err := c.doOllamaRequest(ctx, endpoint, jsonData)
		if err == nil {
			return result, nil
		}

		lastErr = err

		if strings.Contains(err.Error(), "context deadline exceeded") || strings.Contains(err.Error(), "Client.Timeout exceeded") {
			return "", fmt.Errorf("local AI server timed out: %w", err)
		}

		log.Printf("LocalAIClient: Request failed (attempt %d/%d), retrying in %v (Error: %v)...", retries+1, maxRetries, backoff, err)

		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(backoff):
			backoff *= 2
			continue
		}
	}
	return "", fmt.Errorf("failed after retries: %w", lastErr)
}

func (c *OllamaClient) doOllamaRequest(ctx context.Context, endpoint string, reqBody []byte) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(reqBody))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("unexpected status code: %d, body: %s", resp.StatusCode, string(bodyBytes))
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	// OpenAI / LiteRT-LM /v1/chat/completions or Ollama /api/chat response
	if strings.HasSuffix(endpoint, "/v1/chat/completions") || strings.HasSuffix(endpoint, "/api/chat") {
		var chatResp OllamaChatResponse
		if err := json.Unmarshal(bodyBytes, &chatResp); err != nil {
			return "", fmt.Errorf("failed to decode chat response: %w", err)
		}
		if len(chatResp.Choices) > 0 && chatResp.Choices[0].Message.Content != "" {
			return chatResp.Choices[0].Message.Content, nil
		}
		if chatResp.Message.Content != "" {
			return chatResp.Message.Content, nil
		}
		return "", fmt.Errorf("empty chat response from local AI server")
	}

	// Generate endpoint returned response structure
	var genResp OllamaGenerateResponse
	if err := json.Unmarshal(bodyBytes, &genResp); err != nil {
		return "", fmt.Errorf("failed to decode generate response: %w", err)
	}
	if genResp.Response == "" {
		return "", fmt.Errorf("empty generate response from ollama")
	}

	return genResp.Response, nil
}

// ListModels returns a list of available models on the LiteRT-LM (~/.litert-lm/models or /v1/models) or Ollama (/api/tags) server.
func (c *OllamaClient) ListModels(ctx context.Context, apiURL string) ([]string, error) {
	if isLiteRT(apiURL) {
		if diskModels := listDiskLiteRTModels(); len(diskModels) > 0 {
			return diskModels, nil
		}
	}

	client := &http.Client{Timeout: 5 * time.Second}
	base := trimBaseURL(apiURL)

	// 1. Try LiteRT-LM / OpenAI /v1/models first
	if req, err := http.NewRequestWithContext(ctx, "GET", base+"/v1/models", nil); err == nil {
		if resp, err := client.Do(req); err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				var oaiData struct {
					Data []struct {
						ID string `json:"id"`
					} `json:"data"`
				}
				if err := json.NewDecoder(resp.Body).Decode(&oaiData); err == nil && len(oaiData.Data) > 0 {
					models := make([]string, 0, len(oaiData.Data))
					for _, m := range oaiData.Data {
						models = append(models, m.ID)
					}
					return models, nil
				}
			}
		}
	}

	// 2. Fallback to Ollama /api/tags
	req, err := http.NewRequestWithContext(ctx, "GET", base+"/api/tags", nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var data struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	models := make([]string, 0, len(data.Models))
	for _, m := range data.Models {
		models = append(models, m.Name)
	}
	return models, nil
}
