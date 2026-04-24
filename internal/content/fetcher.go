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
	Content     string
	Title       string
	CanIframe   bool
	ContentType string // 'html', 'markdown', or 'text'
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
		u, _ := url.Parse(urlStr)
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		
		// 1. Repo root or close to it (e.g., github.com/user/repo)
		if len(parts) >= 2 {
			user, repo := parts[0], parts[1]
			
			// Detect branch from subpaths like tree/branchName
			branchCandidate := ""
			if len(parts) >= 4 && (parts[2] == "tree" || parts[2] == "blob") {
				branchCandidate = parts[3]
			}

			// Try to find README in common locations
			branches := []string{branchCandidate, "main", "master", "develop"}
			for _, branch := range branches {
				if branch == "" {
					continue
				}
				rawPaths := []string{
					fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/README.md", user, repo, branch),
					fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/readme.md", user, repo, branch),
					fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/README.markdown", user, repo, branch),
					fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/docs/README.md", user, repo, branch),
				}
				
				for _, rawURL := range rawPaths {
					req, _ = http.NewRequest("GET", rawURL, nil)
					resp2, err2 := client.Do(req)
					if err2 == nil && resp2.StatusCode == 200 {
						defer resp2.Body.Close()
						bodyBytes, _ := io.ReadAll(resp2.Body)
						log.Printf("Fetcher: Found GitHub README for %s at %s", urlStr, rawURL)
						return &FetchResult{
							Content:     string(bodyBytes),
							Title:       fmt.Sprintf("GitHub README: %s/%s", user, repo),
							CanIframe:   false,
							ContentType: "markdown",
						}, nil
					}
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
		log.Printf("Fetcher: Attempting PDF text extraction for %s", urlStr)
		// We need a new response body because resp.Body was already checked for headers but not ReadAll'd yet
		// Actually FetchArticle already has the body.
		text, err := extractTextFromPDF(resp.Body)
		if err == nil && text != "" {
			return &FetchResult{
				Content:     text,
				Title:       "PDF Extraction: " + urlStr,
				CanIframe:   true,
				ContentType: "text",
			}, nil
		}
		
		log.Printf("Fetcher: PDF extraction failed or returned no text for %s. Returning placeholder.", urlStr)
		return &FetchResult{
			Content:     "PDF content (text extraction unavailable)", 
			Title:       "PDF Document: " + urlStr,
			CanIframe:   true,
			ContentType: "pdf",
		}, nil
	}

	// 2. Read Body
	// Limit to 2MB to prevent memory exhaustion
	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return nil, err
	}

	bodyStr := string(bodyBytes)

	// Cloudflare / Bot Protection Check
	isBotProtected := false
	if strings.Contains(bodyStr, "Enable JavaScript and cookies to continue") && strings.Contains(bodyStr, "Just a moment...") {
		isBotProtected = true
	} else if (resp.StatusCode == 403 || resp.StatusCode == 503 || resp.StatusCode == 429) && (strings.Contains(bodyStr, "Cloudflare") || strings.Contains(bodyStr, "challenge-platform") || strings.Contains(bodyStr, "Just a moment")) {
		isBotProtected = true
	} else if strings.Contains(bodyStr, "Just a moment...") && strings.Contains(bodyStr, "cf_chl_opt") {
		isBotProtected = true
	}

	if isBotProtected {
		log.Printf("Fetcher: Detected Anti-Bot protection (Status %d) for %s", resp.StatusCode, urlStr)
		return &FetchResult{
			Content:     fmt.Sprintf("<div style=\"padding: 3rem; text-align: center; color: #64748b; font-family: ui-sans-serif, system-ui, sans-serif;\"><h3 style=\"font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem;\">Protected Content</h3><p>This site blocked the Reader Mode extraction (HTTP %d). It likely uses Cloudflare or an anti-bot challenge.<br/><br/>Please switch to the <b>Web</b> tab to view it natively, or open the link directly.</p></div>", resp.StatusCode),
			Title:       "Protection Challenge",
			CanIframe:   true, // Force iframe true since the block is just on our server IP
			ContentType: "html",
		}, nil
	}

	// 3. Attempt Parsing with go-readability
	article, err := readability.FromReader(strings.NewReader(string(bodyBytes)), parsedURL)
	if err == nil && article.Content != "" {
		return &FetchResult{
			Content:     article.Content, // Use full HTML content instead of stripped TextContent
			Title:       article.Title,
			CanIframe:   canIframe,
			ContentType: "html",
		}, nil
	}

	// 4. Fallback to Raw HTML but strip tags (poor man's strip)
	raw := string(bodyBytes)
	return &FetchResult{
		Content:     stripTags(raw),
		Title:       "Unknown Title",
		CanIframe:   canIframe,
		ContentType: "text",
	}, nil
}

func stripTags(html string) string {
	var sb strings.Builder
	inTag := false
	inScript := false
	inStyle := false
	tagName := ""

	for i := 0; i < len(html); i++ {
		r := rune(html[i])
		if r == '<' {
			inTag = true
			tagName = ""
			// peek at tag name
			for j := i + 1; j < len(html) && html[j] != ' ' && html[j] != '>'; j++ {
				tagName += string(html[j])
			}
			tagName = strings.ToLower(tagName)
			
			if tagName == "script" {
				inScript = true
			} else if tagName == "/script" {
				inScript = false
			} else if tagName == "style" {
				inStyle = true
			} else if tagName == "/style" {
				inStyle = false
			}
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag && !inScript && !inStyle {
			sb.WriteRune(r)
		}
	}
	// Post-process to clean up whitespace
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
