package ai

import (
	"context"
	"fmt"
	"log"
	"strings"

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

	model, err := c.getBestModel(ctx, client)
	if err != nil {
		return "", err
	}

	prompt := fmt.Sprintf("Summarize this Hacker News story/discussion in 3-5 bullet points. Focus on the unique technical details or controversy. Text: %s", text)

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		log.Printf("GeminiClient: Model failed: %v", err)
		return "", fmt.Errorf("model failed: %w", err)
	}

	return c.extractTextFromResponse(resp)
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
}

func (c *GeminiClient) getBestModel(ctx context.Context, client *genai.Client) (*genai.GenerativeModel, error) {
	// Dynamic Model Discovery
	iter := client.ListModels(ctx)
	var selectedModel string

	log.Println("GeminiClient: Listing available models...")
	for {
		m, err := iter.Next()
		if err != nil {
			if strings.Contains(err.Error(), "iterator") && strings.Contains(err.Error(), "stop") {
				break
			}
			log.Printf("GeminiClient: Error listing models: %v", err)
			break
		}

		// Check if it supports generateContent
		supportsGenerateContent := false
		for _, method := range m.SupportedGenerationMethods {
			if method == "generateContent" {
				supportsGenerateContent = true
				break
			}
		}

		if supportsGenerateContent && strings.Contains(strings.ToLower(m.Name), "gemini") {
			// Prioritize flash models, then pro
			if selectedModel == "" {
				selectedModel = m.Name
			} else if strings.Contains(m.Name, "flash") && !strings.Contains(selectedModel, "flash") {
				selectedModel = m.Name
			}
		}
	}

	if selectedModel == "" {
		log.Println("GeminiClient: No suitable models found via discovery. Using hardcoded fallback.")
		selectedModel = "gemini-1.5-flash"
	} else {
		log.Printf("GeminiClient: Selected model via discovery: %s", selectedModel)
	}

	selectedModel = strings.TrimPrefix(selectedModel, "models/")
	return client.GenerativeModel(selectedModel), nil
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
