package ai

import (
	"context"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
	"github.com/rajeshkumarblr/hn_station/internal/tags"
)

type RateLimitError struct {
	RetryAfter time.Duration
	Err        error
}

func (e *RateLimitError) Error() string {
	return fmt.Sprintf("rate limit hit, retry after %v: %v", e.RetryAfter, e.Err)
}

// GeminiClient handles interactions with Google's Gemini API.
type GeminiClient struct{}

// NewGeminiClient creates a new instance of GeminiClient.
func NewGeminiClient() *GeminiClient {
	return &GeminiClient{}
}

// GenerateSummary generates a summary of the article content.
func (c *GeminiClient) GenerateSummary(ctx context.Context, apiKey string, preferredModel string, text string) (string, error) {
	log.Printf("GeminiClient: BLOCKED call to GenerateSummary (AI Provider restricted to local-only)")
	return "", fmt.Errorf("Gemini API calls are explicitly disabled in this configuration")

	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return "", fmt.Errorf("failed to create gemini client: %w", err)
	}
	defer client.Close()

	// Wrap in retry logic
	return c.generateWithRetry(ctx, func() (string, error) {
		model, err := c.getBestModel(ctx, client, preferredModel)
		if err != nil {
			return "", err
		}

		tagInstructions := tags.GetManager().GetPromptInstructions()
		prompt := fmt.Sprintf("Summarize this in exactly 5 ULTRA-BRIEF, high-impact bullet points. Use crisp sentence fragments. Be brutally concise. Also extract 3-5 one-word technical tags NO HASHTAGS. %s\n\nOutput ONLY valid JSON:\n{\n  \"summary\": \"- Point 1\\n- Point 2\\n- Point 3\\n- Point 4\\n- Point 5\",\n  \"topics\": [\"tag1\", \"tag2\"]\n}\n\nArticle Text: %s", tagInstructions, text)

		resp, err := model.GenerateContent(ctx, genai.Text(prompt))
		if err != nil {
			log.Printf("GeminiClient: Model failed: %v", err)
			return "", fmt.Errorf("model failed: %w", err)
		}

		return c.extractTextFromResponse(resp)
	})
}

// GenerateDiscussionSummary generates a summary of the Hacker News community discussion.
func (c *GeminiClient) GenerateDiscussionSummary(ctx context.Context, apiKey string, preferredModel string, discussionText string) (string, error) {
	log.Printf("GeminiClient: BLOCKED call to GenerateDiscussionSummary (AI Provider restricted to local-only)")
	return "", fmt.Errorf("Gemini API calls are explicitly disabled in this configuration")

	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return "", fmt.Errorf("failed to create gemini client: %w", err)
	}
	defer client.Close()

	// Wrap in retry logic
	return c.generateWithRetry(ctx, func() (string, error) {
		model, err := c.getBestModel(ctx, client, preferredModel)
		if err != nil {
			return "", err
		}

		prompt := fmt.Sprintf("Analyze this Hacker News community discussion and provide 3-5 bullet points. Highlight the top insights, any major debunking by commenters, and the overall community sentiment (agreement/disagreement). Do not include any introductory text. Output the bullet points directly.\n\nDiscussion: %s", discussionText)

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
func (c *GeminiClient) GenerateChatResponse(ctx context.Context, apiKey string, preferredModel string, contextText string, history []ChatMessage, newMessage string) (string, error) {
	log.Printf("GeminiClient: BLOCKED call to GenerateChatResponse (AI Provider restricted to local-only)")
	return "", fmt.Errorf("Gemini API calls are explicitly disabled in this configuration")

	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return "", fmt.Errorf("failed to create gemini client: %w", err)
	}
	defer client.Close()

	// Wrap in retry logic
	return c.generateWithRetry(ctx, func() (string, error) {
		model, err := c.getBestModel(ctx, client, preferredModel)
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

func (c *GeminiClient) getBestModel(ctx context.Context, client *genai.Client, preferred string) (*genai.GenerativeModel, error) {
	if preferred != "" {
		name := strings.TrimPrefix(preferred, "models/")
		
		// SAFETY OVERRIDE: If the user selected a Gemini 3 variant (which has strict quotas)
		// we intercept it and force gemini-2.5-flash instead to prevent infinite rate limiting.
		if strings.Contains(name, "gemini-3") || strings.Contains(name, "pro") {
			log.Printf("GeminiClient: Intercepted unsafe model preference '%s', forcing gemini-2.5-flash for free-tier stability.", name)
			name = "gemini-2.5-flash"
		}

		return client.GenerativeModel(name), nil
	}

	// Default candidate list for 2026 (1.5 is deprecated, forcing 2.5)
	candidates := []string{
		"gemini-2.5-flash",
		"gemini-2.0-flash",
		"gemini-flash-latest",
	}

	// For now, since we can't easily probe without a call, return the top candidate.
	// In a real scenario, we might want to ListModels and check availability.
	return client.GenerativeModel(candidates[0]), nil
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
	result, err := operation()
	if err == nil {
		return result, nil
	}

	errMsg := err.Error()
	if strings.Contains(errMsg, "429") || strings.Contains(errMsg, "Quota") || strings.Contains(errMsg, "quota") {
		return "", &RateLimitError{
			RetryAfter: c.parseRetryAfter(errMsg),
			Err:        err,
		}
	}

	return "", fmt.Errorf("model failed: %w", err)
}

func (c *GeminiClient) parseRetryAfter(msg string) time.Duration {
	// Look for "retry in 21.123s" or "retry in 21s"
	re := regexp.MustCompile(`retry in (\d+\.?\d*)s`)
	match := re.FindStringSubmatch(msg)
	if len(match) > 1 {
		seconds, err := strconv.ParseFloat(match[1], 64)
		if err == nil {
			return time.Duration(seconds * float64(time.Second))
		}
	}
	return 0
}
