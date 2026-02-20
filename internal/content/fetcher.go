package content

import (
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	readability "github.com/go-shiori/go-readability"
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

	// GitHub Handling: If 404 on a repo URL, try raw README
	if resp.StatusCode == 404 && strings.Contains(urlStr, "github.com") {
		// Convert https://github.com/user/repo -> https://raw.githubusercontent.com/user/repo/master/README.md
		if !strings.Contains(urlStr, "/blob/") && !strings.Contains(urlStr, "/tree/") {
			rawURL := strings.Replace(urlStr, "github.com", "raw.githubusercontent.com", 1)
			rawURL = strings.TrimSuffix(rawURL, "/") + "/master/README.md"

			// Retry with raw URL
			req, _ = http.NewRequest("GET", rawURL, nil)
			resp, err = client.Do(req)
			if err == nil && resp.StatusCode == 200 {
				defer resp.Body.Close()
				bodyBytes, _ := io.ReadAll(resp.Body)
				return &FetchResult{
					Content:   string(bodyBytes),
					Title:     "GitHub README",
					CanIframe: false,
				}, nil
			}
			// If master fails, try main
			rawURLMain := strings.Replace(rawURL, "master", "main", 1)
			req, _ = http.NewRequest("GET", rawURLMain, nil)
			resp, err = client.Do(req)
			if err == nil && resp.StatusCode == 200 {
				defer resp.Body.Close()
				bodyBytes, _ := io.ReadAll(resp.Body)
				return &FetchResult{
					Content:   string(bodyBytes),
					Title:     "GitHub README",
					CanIframe: false,
				}, nil
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

	// 2. Read Body
	// Limit to 2MB to prevent memory exhaustion
	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return nil, err
	}

	// 3. Attempt Parsing with go-readability
	article, err := readability.FromReader(strings.NewReader(string(bodyBytes)), parsedURL)
	if err == nil && article.Content != "" {
		return &FetchResult{
			Content:   article.Content,
			Title:     article.Title,
			CanIframe: canIframe,
		}, nil
	}

	// 4. Fallback to Raw HTML
	return &FetchResult{
		Content:   string(bodyBytes),
		Title:     "Unknown Title",
		CanIframe: canIframe,
	}, nil
}
