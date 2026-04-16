package main

import (
	"fmt"
	"log"
	"github.com/rajeshkumarblr/hn_station/internal/content"
)

func main() {
	url := "https://github.com/rajeshkumarblr/hn_station"
	fmt.Printf("Fetching README: %s\n", url)
	res, err := content.FetchArticle(url)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Title: %s\n", res.Title)
	fmt.Printf("Content Length: %d\n", len(res.Content))
	if len(res.Content) > 500 {
		fmt.Printf("Preview: %s\n", res.Content[:500])
	} else {
		fmt.Printf("Content: %s\n", res.Content)
	}
}
