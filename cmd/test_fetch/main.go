package main

import (
	"fmt"
	"log"
	"strings"

	"github.com/rajeshkumarblr/hn_station/internal/content"
)

func main() {
	url := "https://blog.ivan.digital/nvidia-personaplex-7b-on-apple-silicon-full-duplex-speech-to-speech-in-native-swift-with-mlx-0aa5276f2e23"
	res, err := content.FetchArticle(url)
	if err != nil {
		log.Fatalf("Error: %v", err)
	}
	fmt.Printf("Content starts with: %s\n", res.Content[:100])
	fmt.Printf("Is HTML? %v\n", strings.Contains(res.Content, "<div"))
}
