package ai

import (
	"encoding/json"
	"log"
	"strings"
)

// SummaryResult is the unified output of the greedy parser.
type SummaryResult struct {
	Summary []string
	Topics  []string
}

// ParseGreedyJSON attempts to extract summary bullets and topics from AI output.
// It is "greedy" because it searches for multiple alternative field names (e.g., "answer", "result").
func ParseGreedyJSON(rawJSON string, storyID int64) SummaryResult {
	var result SummaryResult
	
	// Pre-cleanup: LLMs sometimes wrap JSON in markdown blocks
	cleanJSON := strings.TrimPrefix(strings.TrimSuffix(strings.TrimSpace(strings.TrimPrefix(rawJSON, "```json")), "```"), "```")
	if i := strings.Index(cleanJSON, "{"); i != -1 {
		if j := strings.LastIndex(cleanJSON, "}"); j > i {
			cleanJSON = cleanJSON[i : j+1]
		}
	}

	var data map[string]interface{}
	if err := json.Unmarshal([]byte(cleanJSON), &data); err != nil {
		log.Printf("[parser] Failed to unmarshal JSON for story %d: %v. Raw length: %d", storyID, err, len(rawJSON))
		// Fallback: If it's not JSON, treat the whole thing as a single summary bullet
		if len(rawJSON) > 10 {
			result.Summary = []string{rawJSON}
		}
		return result
	}

	// 1. Extract Summary
	summaryKeys := []string{"summary", "answer", "result", "content", "description", "desc"}
	for _, key := range summaryKeys {
		if val, ok := data[key]; ok {
			result.Summary = flattenStrings(val)
			if len(result.Summary) > 0 {
				break
			}
		}
	}

	// 2. Extract Topics
	topicKeys := []string{"topics", "tags", "keywords", "categories", "labels"}
	for _, key := range topicKeys {
		if val, ok := data[key]; ok {
			result.Topics = flattenStrings(val)
			if len(result.Topics) > 0 {
				break
			}
		}
	}

	// 3. Final Fallback: If summary is still empty but we have ANY string field, use it.
	if len(result.Summary) == 0 {
		for _, v := range data {
			if s, ok := v.(string); ok && len(s) > 20 {
				result.Summary = []string{s}
				break
			}
		}
	}

	// Cleanup summary bullets (ensure bullet prefix)
	for i, s := range result.Summary {
		s = strings.TrimSpace(s)
		if s != "" && !strings.HasPrefix(s, "-") && !strings.HasPrefix(s, "*") && !strings.HasPrefix(s, "•") {
			result.Summary[i] = "- " + s
		}
	}

	// Cleanup topics (no hashtags)
	for i, t := range result.Topics {
		result.Topics[i] = strings.TrimPrefix(strings.TrimSpace(t), "#")
	}

	return result
}

func flattenStrings(input interface{}) []string {
	if input == nil {
		return nil
	}
	switch v := input.(type) {
	case string:
		v = strings.TrimSpace(v)
		if v == "" {
			return nil
		}
		// If it's a newline-separated list
		if strings.Contains(v, "\n") {
			var parts []string
			for _, line := range strings.Split(v, "\n") {
				line = strings.TrimSpace(line)
				if line != "" {
					parts = append(parts, line)
				}
			}
			return parts
		}
		// If it's a comma-separated or semicolon-separated list
		// We split and trim. We don't care about spaces here as long as we trim.
		if strings.Contains(v, ",") || strings.Contains(v, ";") {
			var parts []string
			var rawParts []string
			if strings.Contains(v, ";") {
				rawParts = strings.Split(v, ";")
			} else {
				rawParts = strings.Split(v, ",")
			}
			for _, part := range rawParts {
				part = strings.TrimSpace(part)
				if part != "" {
					parts = append(parts, part)
				}
			}
			if len(parts) > 0 {
				return parts
			}
		}
		return []string{v}
	case []interface{}:
		var result []string
		for _, item := range v {
			if s, ok := item.(string); ok {
				s = strings.TrimSpace(s)
				if s != "" {
					result = append(result, s)
				}
			}
		}
		return result
	case []string:
		var result []string
		for _, s := range v {
			s = strings.TrimSpace(s)
			if s != "" {
				result = append(result, s)
			}
		}
		return result
	}
	return nil
}
