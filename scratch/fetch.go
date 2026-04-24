package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/rajeshkumarblr/hn_station/internal/content"
)

func fetchStory(id int) {
	resp, _ := http.Get(fmt.Sprintf("https://hacker-news.firebaseio.com/v0/item/%d.json", id))
	defer resp.Body.Close()
	var item struct{ URL string `json:"url"` }
	json.NewDecoder(resp.Body).Decode(&item)

	fetchRes, err := content.FetchArticle(item.URL)
	if err != nil {
		log.Printf("Error fetching article %d: %v", id, err)
	}
	if fetchRes != nil {
		fmt.Printf("\n--- STORY %d ---\n%s\n", id, fetchRes.Content)
	}
}

func main() {
	fetchStory(47833247)
	fetchStory(47834195)
}
