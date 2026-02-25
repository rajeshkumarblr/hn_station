package ai

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

// GeminiClient handles interactions with Google's Gemini API.
type GeminiClient struct{}

// NewGeminiClient creates a new instance of GeminiClient.
func NewGeminiClient() *GeminiClient {
	return &GeminiClient{}
}

// GenerateSummary generates a summary using the provided API key and text.
func (c *GeminiClient) GenerateSummary(ctx context.Context, apiKey string, text string) (string, error) {
	log.Printf("GeminiClient: Starting summarization. Input text length: %d", len(text))

	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return "", fmt.Errorf("failed to create gemini client: %w", err)
	}
	defer client.Close()

	// Wrap in retry logic
	return c.generateWithRetry(ctx, func() (string, error) {
		model, err := c.getBestModel(ctx, client)
		if err != nil {
			return "", err
		}

		prompt := fmt.Sprintf("Summarize this Hacker News story/discussion in 3-5 bullet points. Focus on the unique technical details or controversy. Do not include any introductory text or conversational filler. Output the bullet points directly. Text: %s", text)

		resp, err := model.GenerateContent(ctx, genai.Text(prompt))
		if err != nil {
			log.Printf("GeminiClient: Model failed: %v", err)
			return "", fmt.Errorf("model failed: %w", err)
		}

		return c.extractTextFromResponse(resp)
	})
}

// ChatMessage represents a message in the chat history.
type ChatMessage struct {
	Role    string // "user" or "model"
	Content string
}

// GenerateChatResponse generates a response to a user message, given context and history.
func (c *GeminiClient) GenerateChatResponse(ctx context.Context, apiKey string, contextText string, history []ChatMessage, newMessage string) (string, error) {
	log.Printf("GeminiClient: Starting chat. History length: %d", len(history))

	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return "", fmt.Errorf("failed to create gemini client: %w", err)
	}
	defer client.Close()

	// Wrap in retry logic
	return c.generateWithRetry(ctx, func() (string, error) {
		model, err := c.getBestModel(ctx, client)
		if err != nil {
			return "", err
		}

		cs := model.StartChat()

		// Set the system instruction or initial context if supported,
		// or just prepend it to the history/first message.
		// Gemini Pro often works best if context is in the first message or history.

		// We will construct the history for the session.
		// We'll inject the context (story content) as a "user" message at the beginning,
		// followed by a "model" confirmation, to establish context.

		cs.History = []*genai.Content{
			{
				Role: "user",
				Parts: []genai.Part{
					genai.Text(fmt.Sprintf("Here is the content of the Hacker News story and discussion we will talk about:\n\n%s\n\nPlease answer my future questions based on this context.", contextText)),
				},
			},
			{
				Role: "model",
				Parts: []genai.Part{
					genai.Text("Understood. I have read the story and discussion. I am ready to answer your questions about it."),
				},
			},
		}

		// Append actual user history
		for _, msg := range history {
			role := "user"
			if msg.Role == "model" || msg.Role == "assistant" {
				role = "model"
			}
			cs.History = append(cs.History, &genai.Content{
				Role:  role,
				Parts: []genai.Part{genai.Text(msg.Content)},
			})
		}

		resp, err := cs.SendMessage(ctx, genai.Text(newMessage))
		if err != nil {
			log.Printf("GeminiClient: Chat failed: %v", err)
			return "", fmt.Errorf("chat failed: %w", err)
		}

		return c.extractTextFromResponse(resp)
	})
}

func (c *GeminiClient) getBestModel(ctx context.Context, client *genai.Client) (*genai.GenerativeModel, error) {
	// Skip dynamic discovery to save quota/latency for now.
	// Gemini Flash is generally available and best for this use case.
	modelName := "gemini-2.5-flash"
	return client.GenerativeModel(modelName), nil
}

func (c *GeminiClient) extractTextFromResponse(resp *genai.GenerateContentResponse) (string, error) {
	if len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil || len(resp.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("empty response from model")
	}

	var sb strings.Builder
	for _, part := range resp.Candidates[0].Content.Parts {
		if txt, ok := part.(genai.Text); ok {
			sb.WriteString(string(txt))
		}
	}

	result := sb.String()
	if result == "" {
		return "", fmt.Errorf("empty text response from model")
	}

	return result, nil
}

// generateWithRetry executes a generation function with retries for quota errors.
func (c *GeminiClient) generateWithRetry(ctx context.Context, operation func() (string, error)) (string, error) {
	var lastErr error
	// Exponential backoff: 1s, 2s, 4s, 8s, 16s
	backoff := 1 * time.Second
	maxRetries := 5

	for retries := 0; retries < maxRetries; retries++ {
		result, err := operation()
		if err == nil {
			return result, nil
		}

		lastErr = err
		errMsg := err.Error()
		if strings.Contains(errMsg, "429") || strings.Contains(errMsg, "Quota") || strings.Contains(errMsg, "quota") {
			log.Printf("GeminiClient: Quota exceeded (attempt %d/%d), retrying in %v...", retries+1, maxRetries, backoff)

			// Wait before retrying
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(backoff):
				backoff *= 2 // Double the wait time
				continue
			}
		}

		// If not a quota error, fail immediately
		return "", err
	}
	return "", fmt.Errorf("failed after retries: %w", lastErr)
}
