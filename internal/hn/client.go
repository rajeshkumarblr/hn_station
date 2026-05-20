package hn

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const (
	BaseURL = "https://hacker-news.firebaseio.com/v0"
)

type Client struct {
	httpClient *http.Client
}

type UserItem struct {
	ID        string `json:"id"`
	Created   int    `json:"created"`
	Karma     int    `json:"karma"`
	About     string `json:"about"`
	Submitted []int  `json:"submitted"`
}

type Item struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	URL         string `json:"url"`
	Score       int    `json:"score"`
	By          string `json:"by"`
	Descendants int    `json:"descendants"`
	Time        int64  `json:"time"`
	Type        string `json:"type"`
	Deleted     bool   `json:"deleted"`
	Dead        bool   `json:"dead"`
	Text        string `json:"text"`
	Parent      int    `json:"parent"`
	Kids        []int  `json:"kids"`
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *Client) GetTopStories(ctx context.Context) ([]int, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/topstories.json", BaseURL), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var ids []int
	if err := json.NewDecoder(resp.Body).Decode(&ids); err != nil {
		return nil, err
	}

	return ids, nil
}

func (c *Client) GetNewStories(ctx context.Context) ([]int, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/newstories.json", BaseURL), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var ids []int
	if err := json.NewDecoder(resp.Body).Decode(&ids); err != nil {
		return nil, err
	}

	return ids, nil
}

func (c *Client) GetItem(ctx context.Context, id int) (*Item, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/item/%d.json", BaseURL, id), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var item Item
	if err := json.NewDecoder(resp.Body).Decode(&item); err != nil {
		return nil, err
	}

	return &item, nil
}

func (c *Client) GetUser(ctx context.Context, username string) (*UserItem, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/user/%s.json", BaseURL, username), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var item UserItem
	if err := json.NewDecoder(resp.Body).Decode(&item); err != nil {
		return nil, err
	}

	return &item, nil
}

// PerformHNInteract executes a login, crawls for auth tokens, and performs a vote or comment action.
func (c *Client) PerformHNInteract(ctx context.Context, username, password string, action string, itemID int, how string, text string) error {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return fmt.Errorf("failed to create cookie jar: %w", err)
	}

	client := &http.Client{
		Jar:     jar,
		Timeout: 15 * time.Second,
	}

	// 1. POST to https://news.ycombinator.com/login
	loginURL := "https://news.ycombinator.com/login"
	form := url.Values{}
	form.Add("acct", username)
	form.Add("pw", password)
	form.Add("goto", "news")

	req, err := http.NewRequestWithContext(ctx, "POST", loginURL, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("failed to create login request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("login request failed: %w", err)
	}
	defer resp.Body.Close()

	// Verify we got the user cookie
	u, _ := url.Parse("https://news.ycombinator.com")
	cookies := client.Jar.Cookies(u)
	hasUserCookie := false
	for _, cookie := range cookies {
		if cookie.Name == "user" {
			hasUserCookie = true
			break
		}
	}
	if !hasUserCookie {
		return errors.New("HN login failed: invalid credentials or cookie not set")
	}

	// 2. Perform requested action
	if action == "vote" {
		// Load item page to get auth token
		itemURL := fmt.Sprintf("https://news.ycombinator.com/item?id=%d", itemID)
		req, err = http.NewRequestWithContext(ctx, "GET", itemURL, nil)
		if err != nil {
			return err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")

		resp, err = client.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return err
		}
		bodyStr := string(bodyBytes)

		// Regex to find: vote?id=<itemID>&how=<how>&auth=<auth_token>
		// E.g., vote?id=40381014&amp;how=up&amp;auth=3fa8b61...
		reStr := fmt.Sprintf(`vote\?id=%d(&amp;|&)how=%s(&amp;|&)auth=([^"&]+)`, itemID, regexp.QuoteMeta(how))
		re := regexp.MustCompile(reStr)
		matches := re.FindStringSubmatch(bodyStr)
		if len(matches) < 4 {
			return fmt.Errorf("failed to find vote token: make sure you can vote on this item (vote link not found on page)")
		}
		authToken := matches[3]

		// Execute vote
		voteURL := fmt.Sprintf("https://news.ycombinator.com/vote?id=%d&how=%s&auth=%s&goto=item?id=%d", itemID, how, authToken, itemID)
		req, err = http.NewRequestWithContext(ctx, "GET", voteURL, nil)
		if err != nil {
			return err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")

		resp, err = client.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		return nil

	} else if action == "comment" {
		// Load parent page to get hmac token
		itemURL := fmt.Sprintf("https://news.ycombinator.com/item?id=%d", itemID)
		req, err = http.NewRequestWithContext(ctx, "GET", itemURL, nil)
		if err != nil {
			return err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")

		resp, err = client.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return err
		}
		bodyStr := string(bodyBytes)

		// Find hmac value: name="hmac" value="([^"]+)" or value="([^"]+)" name="hmac"
		reHmac1 := regexp.MustCompile(`name="hmac"\s+value="([^"]+)"`)
		reHmac2 := regexp.MustCompile(`value="([^"]+)"\s+name="hmac"`)
		var hmac string
		if matches := reHmac1.FindStringSubmatch(bodyStr); len(matches) > 1 {
			hmac = matches[1]
		} else if matches := reHmac2.FindStringSubmatch(bodyStr); len(matches) > 1 {
			hmac = matches[1]
		}

		if hmac == "" {
			return errors.New("failed to find comment hmac: make sure comments are enabled and you are logged in correctly")
		}

		// POST comment
		commentPostURL := "https://news.ycombinator.com/comment"
		commentForm := url.Values{}
		commentForm.Add("parent", fmt.Sprintf("%d", itemID))
		commentForm.Add("hmac", hmac)
		commentForm.Add("text", text)

		req, err = http.NewRequestWithContext(ctx, "POST", commentPostURL, strings.NewReader(commentForm.Encode()))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")

		resp, err = client.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		return nil
	}

	return fmt.Errorf("unsupported action: %s", action)
}
