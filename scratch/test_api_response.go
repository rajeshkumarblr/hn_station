package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
)

func main() {
	// The port from the user's latest terminal output
	url := "http://127.0.0.1:58090/api/stories/47655408"
	resp, err := http.Get(url)
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Printf("Response Size: %d bytes\n", len(body))

	var data struct {
		Comments []map[string]interface{} `json:"comments"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Comment count in JSON: %d\n", len(data.Comments))
	if len(data.Comments) > 0 {
		fmt.Printf("First comment: %+v\n", data.Comments[0])
	}
}
