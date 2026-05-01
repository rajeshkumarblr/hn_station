package tags

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type TagManager struct {
	mappings   map[string][]string
	lastLoaded time.Time
	mu         sync.RWMutex
}

var (
	instance *TagManager
	once     sync.Once
)

func GetManager() *TagManager {
	once.Do(func() {
		instance = &TagManager{
			mappings: make(map[string][]string),
		}
		instance.Load()
	})
	return instance
}

func (m *TagManager) getPath() string {
	// 1. Check User Config Dir (Production)
	configDir, _ := os.UserConfigDir()
	path1 := filepath.Join(configDir, "HN Station", "tag_mappings.json")
	if _, err := os.Stat(path1); err == nil {
		return path1
	}

	// 2. Check Executable Dir (Portable/Packaged)
	execPath, _ := os.Executable()
	path2 := filepath.Join(filepath.Dir(execPath), "tag_mappings.json")
	if _, err := os.Stat(path2); err == nil {
		return path2
	}

	// 3. Check CWD (Dev)
	path3 := "tag_mappings.json"
	if _, err := os.Stat(path3); err == nil {
		abs, _ := filepath.Abs(path3)
		return abs
	}

	// 4. Check Project Root relative to binary (Dev via Electron)
	// Binary is in web/resources/hn-local.exe
	// tag_mappings is in ../../tag_mappings.json
	path4 := filepath.Join(filepath.Dir(execPath), "..", "..", "tag_mappings.json")
	if _, err := os.Stat(path4); err == nil {
		return path4
	}

	return path1 // Default to config dir if none found
}

func (m *TagManager) Load() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	mappingPath := m.getPath()
	data, err := os.ReadFile(mappingPath)
	if err != nil {
		log.Printf("TagManager: WARNING: Could not find tag_mappings.json at %s: %v", mappingPath, err)
		return err
	}

	if err := json.Unmarshal(data, &m.mappings); err != nil {
		return err
	}

	m.lastLoaded = time.Now()
	return nil
}

func (m *TagManager) checkReload() {
	m.mu.RLock()
	if time.Since(m.lastLoaded) < 5*time.Second {
		m.mu.RUnlock()
		return
	}
	m.mu.RUnlock()

	path := m.getPath()
	info, err := os.Stat(path)
	if err != nil {
		return
	}

	m.mu.RLock()
	needsReload := info.ModTime().After(m.lastLoaded)
	m.mu.RUnlock()

	if needsReload {
		log.Printf("TagManager: Reloading mappings from %s", path)
		m.Load()
	}
}

func (m *TagManager) GetCanonicalTags() []string {
	m.checkReload()
	m.mu.RLock()
	defer m.mu.RUnlock()

	tags := make([]string, 0, len(m.mappings))
	for tag := range m.mappings {
		tags = append(tags, tag)
	}
	return tags
}

func normalizeTag(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	// Basic plural-to-singular (crude but effective for tags)
	if len(s) > 3 && strings.HasSuffix(s, "s") && !strings.HasSuffix(s, "ss") {
		return s[:len(s)-1]
	}
	return s
}

func (m *TagManager) ExpandTag(tag string) []string {
	m.checkReload()
	
	// Find the canonical tag if the input is a synonym
	canonical := tag
	normInput := normalizeTag(tag)
	
	m.mu.RLock()
	for key, synonyms := range m.mappings {
		if normalizeTag(key) == normInput {
			canonical = key
			break
		}
		found := false
		for _, syn := range synonyms {
			if normalizeTag(syn) == normInput {
				canonical = key
				found = true
				break
			}
		}
		if found {
			break
		}
	}
	synonyms, _ := m.mappings[canonical]
	m.mu.RUnlock()

	// Use a map to collect all unique variants
	resMap := make(map[string]bool)
	
	addVariants := func(t string) {
		low := strings.ToLower(strings.TrimSpace(t))
		if low == "" {
			return
		}
		resMap[low] = true
		
		// Add singular version
		norm := normalizeTag(low)
		resMap[norm] = true
		
		// Add plural version if it looks singular
		if !strings.HasSuffix(low, "s") {
			resMap[low+"s"] = true
		}
	}

	// Add variants for the canonical tag
	addVariants(canonical)
	// Add variants for the original input tag (in case it wasn't the canonical)
	addVariants(tag)
	// Add variants for all synonyms
	for _, syn := range synonyms {
		addVariants(syn)
	}

	results := make([]string, 0, len(resMap))
	for r := range resMap {
		results = append(results, r)
	}
	return results
}

// Reload forces the manager to re-read the configuration file.
func (m *TagManager) Reload() error {
	return m.Load()
}

func (m *TagManager) GetPromptInstructions() string {
	m.checkReload()
	m.mu.RLock()
	defer m.mu.RUnlock()

	if len(m.mappings) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("\nCRITICAL: Use these CANONICAL tags only. If an article matches a synonym, use the Canonical Tag instead:\n")
	for tag, synonyms := range m.mappings {
		sb.WriteString(fmt.Sprintf("- %s (Synonyms: %s)\n", tag, strings.Join(synonyms, ", ")))
	}
	return sb.String()
}
