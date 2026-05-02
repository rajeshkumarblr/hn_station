package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
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

// CheckAvailability verifies if the Ollama server is reachable.
func (c *OllamaClient) CheckAvailability(ctx context.Context, apiURL string) bool {
	client := &http.Client{Timeout: 500 * time.Millisecond}
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return false
	}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// GenerateSummary generates a concise summary and tags using the provided local Ollama server URL and model.
func (c *OllamaClient) GenerateSummary(ctx context.Context, apiURL string, model string, title string, text string) (string, error) {
	if model == "" {
		model = "llama3.2:3b"
	}

	// Limit context for local models to ensure instruction following
	limit := 12000
	if len(text) > limit {
		text = text[:limit] + "... [truncated for context]"
	}

	log.Printf("OllamaClient: Starting summarization for %q using model %q. Input text length: %d", title, model, len(text))

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
- Output NOTHING except the JSON.`, title, text, tagInstructions)

	return c.generateWithRetry(ctx, apiURL, model, prompt)
}

// ChatMessage represents a message in the chat history.
// We reuse the struct for compatibility but map it to Ollama's format.
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
}

// GenerateChatResponse generates a response to a user message, given context and history.
func (c *OllamaClient) GenerateChatResponse(ctx context.Context, apiURL string, model string, contextText string, history []ChatMessage, newMessage string) (string, error) {
	if model == "" {
		model = "llama3.2:3b"
	}
	log.Printf("OllamaClient: Starting chat using model %q. History length: %d", model, len(history))

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

	return c.doOllamaRequest(ctx, apiURL+"/api/chat", jsonData)
}

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
	reqBody := OllamaGenerateRequest{
		Model:  model,
		Prompt: prompt,
		Stream: false,
		Format: "json",
	}

	// We can optionally force a JSON format output in recent Ollama versions depending on the LLM parsing.
	// But let's fallback to standard completion if phi3 groks it well natively.
	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal generate request: %w", err)
	}

	var lastErr error
	backoff := 2 * time.Second
	maxRetries := 3

	for retries := 0; retries < maxRetries; retries++ {
		result, err := c.doOllamaRequest(ctx, apiURL+"/api/generate", jsonData)
		if err == nil {
			return result, nil
		}

		lastErr = err
		
		// If the error was a timeout, don't waste more minutes retrying. 
		// Fail fast so the worker can move to next job (Gemini is disabled).
		if strings.Contains(err.Error(), "context deadline exceeded") || strings.Contains(err.Error(), "Client.Timeout exceeded") {
			return "", fmt.Errorf("ollama timed out: %w", err)
		}

		log.Printf("OllamaClient: Request failed (attempt %d/%d), retrying in %v (Error: %v)...", retries+1, maxRetries, backoff, err)

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

	// Chat endpoint returned message.content structure
	if strings.HasSuffix(endpoint, "/api/chat") {
		var chatResp OllamaChatResponse
		if err := json.Unmarshal(bodyBytes, &chatResp); err != nil {
			return "", fmt.Errorf("failed to decode chat response: %w", err)
		}
		if chatResp.Message.Content == "" {
			return "", fmt.Errorf("empty chat response from ollama")
		}
		return chatResp.Message.Content, nil
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

// ListModels returns a list of available models on the Ollama server.
func (c *OllamaClient) ListModels(ctx context.Context, apiURL string) ([]string, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL+"/api/tags", nil)
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
