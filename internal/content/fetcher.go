package content

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	readability "github.com/go-shiori/go-readability"
	"github.com/ledongthuc/pdf"
)

// FetchResult contains the result of an article fetch
type FetchResult struct {
	Content   string
	Title     string
	CanIframe bool
}

// FetchArticle attempts to fetch and parse the article content.
func FetchArticle(urlStr string) (*FetchResult, error) {
	parsedURL, err := url.Parse(urlStr)
	if err != nil {
		return nil, err
	}

	client := &http.Client{
		Timeout: 30 * time.Second,
	}
	req, _ := http.NewRequest("GET", urlStr, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// GitHub Handling: Direct README extraction
	if strings.Contains(urlStr, "github.com") {
		// If it's a repo root (no blob/tree/pull etc)
		u, _ := url.Parse(urlStr)
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		if len(parts) == 2 {
			// Try master then main
			for _, branch := range []string{"master", "main"} {
				rawURL := fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/README.md", parts[0], parts[1], branch)
				req, _ = http.NewRequest("GET", rawURL, nil)
				resp, err = client.Do(req)
				if err == nil && resp.StatusCode == 200 {
					defer resp.Body.Close()
					bodyBytes, _ := io.ReadAll(resp.Body)
					return &FetchResult{
						Content:   string(bodyBytes),
						Title:     fmt.Sprintf("GitHub README: %s/%s", parts[0], parts[1]),
						CanIframe: false,
					}, nil
				}
			}
		}
	}

	// 1. Check Iframe Compatibility
	canIframe := true
	xFrame := strings.ToUpper(resp.Header.Get("X-Frame-Options"))
	if xFrame == "DENY" || xFrame == "SAMEORIGIN" {
		canIframe = false
	}

	csp := strings.ToLower(resp.Header.Get("Content-Security-Policy"))
	if strings.Contains(csp, "frame-ancestors") {
		canIframe = false
	}

	// Detect PDF by Content-Type or extension
	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	isPDF := strings.Contains(contentType, "application/pdf") || strings.HasSuffix(strings.ToLower(urlStr), ".pdf")

	if isPDF {
		log.Printf("Fetcher: Detected PDF content for %s. Extracting text...", urlStr)
		content, err := extractTextFromPDF(resp.Body)
		if err == nil && len(content) > 100 {
			return &FetchResult{
				Content:   content,
				Title:     "PDF Document: " + urlStr,
				CanIframe: false,
			}, nil
		}
		log.Printf("Fetcher: PDF extraction failed or too short: %v", err)
	}

	// 2. Read Body
	// Limit to 2MB to prevent memory exhaustion
	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return nil, err
	}

	// 3. Attempt Parsing with go-readability
	article, err := readability.FromReader(strings.NewReader(string(bodyBytes)), parsedURL)
	if err == nil && article.TextContent != "" {
		return &FetchResult{
			Content:   article.TextContent,
			Title:     article.Title,
			CanIframe: canIframe,
		}, nil
	}

	// 4. Fallback to Raw HTML but strip tags (poor man's strip)
	raw := string(bodyBytes)
	return &FetchResult{
		Content:   stripTags(raw),
		Title:     "Unknown Title",
		CanIframe: canIframe,
	}, nil
}

func stripTags(html string) string {
	var sb strings.Builder
	inTag := false
	for _, r := range html {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			sb.WriteRune(r)
		}
	}
	return strings.Join(strings.Fields(sb.String()), " ")
}

// extractTextFromPDF reads PDF content from a reader and returns the extracted text.
func extractTextFromPDF(r io.Reader) (string, error) {
	// We need to read the whole body into a temp file or buffer because ledongthuc/pdf
	// often needs seekable access or a reader that can be reread.
	bodyBytes, err := io.ReadAll(r)
	if err != nil {
		return "", err
	}

	reader, err := pdf.NewReader(bytes.NewReader(bodyBytes), int64(len(bodyBytes)))
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	numPages := reader.NumPage()
	// Limit to first 20 pages to avoid performance issues
	if numPages > 20 {
		numPages = 20
	}

	for i := 1; i <= numPages; i++ {
		page := reader.Page(i)
		if page.V.IsNull() {
			continue
		}
		text, err := page.GetPlainText(nil)
		if err != nil {
			continue
		}
		sb.WriteString(text)
		sb.WriteString("\n")
	}

	return sb.String(), nil
}
