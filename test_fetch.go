package main

import (
	"fmt"

	"github.com/rajeshkumarblr/hn_station/internal/content"
)

func main() {
	res, err := content.FetchArticle("https://developer.chrome.com/docs/extensions/mv3/")
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	fmt.Printf("CanIframe: %v\n", res.CanIframe)
	fmt.Printf("ContentType: %v\n", res.ContentType)
	fmt.Printf("Title: %v\n", res.Title)
}
