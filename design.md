# HN Station — Design Document

> **Version**: 0.9.6 · **Last Updated**: 2026-04-30
> Live at [hnstation.dev](https://hnstation.dev)

This document captures the **architectural decisions, design rationale, and operational constraints** that govern HN Station. It serves as the source of truth for the project's evolution from a cloud-first reader to a local-first productivity tool.

---

## 1. System Vision: Local-First Productivity

HN Station has transitioned from a cloud-centric service to a **Local-First Desktop Tool**. 

- **Privacy & Speed**: Data is stored locally in SQLite. No registration or login is required for core features (bookmarks, history, filters).
- **App-Bound Backend**: The ingestion and API logic is contained within a persistent background process (`hn-local.exe`) managed by the Electron app, ensuring "always-on" functionality without the complexity of a Windows Service.
- **Rich Content Extraction**: The tool doesn't just link to articles; it "understands" them via deep extraction (PDFs, GitHub READMEs) to provide better AI context.

---

## 2. Key Architectural Decisions

### 2.1 App-Bound Local Agent
**Decision**: Moving away from the native Windows Service (`SYSTEM` context) in favor of a standard user-space background process managed by Electron.
**Rationale**: 
- Simplifies installation (no admin/UAC prompts required for service management).
- Resolves file permission issues (running in the user's `%APPDATA%`).
- Ensures the backend lifecycle is tied to the app's installation.

### 2.2 Dual Primary Tab Navigation
**Decision**: Splitting the main view into two top-level persistent tabs: **FEED** and **BOOKMARKS**.
**Rationale**: 
- High-frequency users need instant access to their saved stories without losing their place in the "Top" or "New" feeds.
- Preserves the scroll position and filtering state independently for each context.

### 2.3 Scoped Summary Sidebars
**Decision**: Restricting the global `FilterSidebar` (containing "Article Summary" and "Article Topics") strictly to the **Feed** view.
**Rationale**: 
- Prevents UI redundancy in the **Reader** view, which already manages its own `AISidebar` with dedicated analysis and discussion tabs.
- Streamlines the reading experience by removing non-essential global controls when the user is focused on a specific article.

### 2.4 Context-Aware AI Summarization
**Decision**: Implementing specialized extraction logic for non-HTML content.
- **PDF Extraction**: Using the Go `pdf` package to extract text from the first 20 pages of linked documents.
- **GitHub Integration**: Detecting repo-links in "Show HN" posts and fetching the `README.md` via the raw GitHub API.
**Rationale**: Hacker News is increasingly a platform for sharing deep technical papers and new software repos. Standard "readability" parsers fail on these, leaving the AI with zero context.

### 2.5 Hybrid FTS5 Search System
**Decision**: Implementing a hybrid search model combining SQLite's Full-Text Search (FTS5) for keyword matching with JSON-indexed semantic topic filtering.
**Rationale**: 
- **Precision**: FTS5 allows for fast, multi-column search across titles, summaries, and topics.
- **Flexibility**: The "ANY/ALL" match logic gives users control over the breadth of their feed (Union vs. Intersection of topics).

### 2.6 Deterministic Global Tagging
**Decision**: Assigning colors to topic tags using a hash-based deterministic palette.
**Rationale**: 
- **Cognitive Load**: If `#LLM` is blue in the toolbar, it's blue on every article card. This creates strong visual associations and reduces scanning time.
- **No Mapping Required**: Colors are generated on-the-fly based on the tag string, removing the need for a central color-to-tag database.

---

## 3. UI Design Principles

### 3.1 Pinned Feed Navigation
**Decision**: Implementing a compact, numbered pagination bar (`< Prev 1 2 3 ... N Next >`) pinned to the bottom of the feed.
**Rationale**: Provides predictable, one-click access to the full story archive while maintaining a clean, non-obtrusive footer.

### 3.2 Dynamic Feed Density
**Decision**: Ensuring article cards dynamically stretch to occupy the full height of the feed pane.
**Rationale**: Eliminates "dead space" below the story list, providing a balanced and high-density information display regardless of the number of items or window size.

### 3.3 Simplified Interaction model
**Decision**: Consolidating multiple "Open" buttons into a single icon that defaults to the **Split Layout**.
**Rationale**: Analysis showed that users almost always prefer the split view (Article + Comments) on their first open. Providing too many choices in the story card created cognitive friction.

### 3.4 Premium Desktop Aesthetics
**Decision**: Using a deep blue/slate dark mode with high-contrast accents (vibrant orange for scores, emerald for active status). 
**Rationale**: Position HN Station as a professional productivity tool rather than a generic news aggregator.

### 3.5 Keyboard-Centric Workflow
**Decision**: Comprehensive shortcut support for tab management and story triaging.

| Shortcut | Category | Action |
| :--- | :--- | :--- |
| `Ctrl + 0` | View | Return to **Feed** view |
| `Ctrl + Home` | View | Switch to **Feed Tab** |
| `Ctrl + D` | View | Switch to **Bookmarks Tab** |
| `Ctrl + Tab` | View | Cycle through tabs (Forward) |
| `Ctrl + Shift + Tab` | View | Cycle through tabs (Backward) |
| `Ctrl + W` | App | Close active tab (Reader) / **Exit Application** (Feed) |
| `F5` / `Ctrl + R` | App | Refresh Feed or Active Tab |
| `j` / `k` or `Arrows` | Feed | Navigate stories in the feed |
| `Home` / `End` | Feed | Jump to first/last story in current view |
| `PageUp` / `PageDown` | Feed | Previous/Next 10 stories (Pagination) |
| `Enter` | Feed | Open story in **Split Mode** |
| `Ctrl + Space` | Reader | Cycle layout: **Article → Discussion → Split** |
| `Ctrl + Alt + Arrows` | Reader | Incremental layout cycling |
| `Ctrl + Q` | Reader | Toggle Sidebar Visibility (Show/Hide) |
| `Ctrl + H` | Reader | Switch to **Discussion** Tab |
| `Ctrl + K` | Reader | Switch to **AI Summary** Tab |
| `Ctrl + G` | Reader | Switch to **Gemini Chat** Tab |

---

## 4. Operational Notes

### 4.1 Data Persistence
- **Windows**: `%APPDATA%/HN Station/hn.db`
- **Schema**: Managed via Go migrations in the `internal/storage` layer.

### 4.2 Known Failure Modes and lessons
- **X-Frame-Options**: Many sites block iframes. The Desktop app solves this using the Electron `webview` with `webSecurity: false` for those specific contexts.
- **SQLite Locking**: The app uses a single database connection with a Write-Ahead Log (WAL) to prevent "database is locked" errors during high-speed ingestion.
- **AI Rate Limiting**: The summarizer implements a 10-second cool-down per request to stay within the Google Gemini Free Tier limits.
