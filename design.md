# HN Station — Design Document

> **Version**: 0.9.7 · **Last Updated**: 2026-04-16
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

### 2.3 Context-Aware AI Summarization
**Decision**: Implementing specialized extraction logic for non-HTML content.
- **PDF Extraction**: Using the Go `pdf` package to extract text from the first 20 pages of linked documents.
- **GitHub Integration**: Detecting repo-links in "Show HN" posts and fetching the `README.md` via the raw GitHub API.
**Rationale**: Hacker News is increasingly a platform for sharing deep technical papers and new software repos. Standard "readability" parsers fail on these, leaving the AI with zero context.

---

## 3. UI Design Principles

### 3.1 Simplified Interaction model
**Decision**: Consolidating multiple "Open" buttons into a single icon that defaults to the **Split Layout**.
**Rationale**: Analysis showed that users almost always prefer the split view (Article + Comments) on their first open. Providing too many choices in the story card created cognitive friction.

### 3.2 Premium Desktop Aesthetics
**Decision**: Using a deep blue/slate dark mode with high-contrast accents (vibrant orange for scores, emerald for active status). 
**Rationale**: Position HN Station as a professional productivity tool rather than a generic news aggregator.

### 3.3 Keyboard-Centric Workflow
**Decision**: Comprehensive shortcut support for tab management and story triaging.
- `Ctrl + W`: Close current tab / Exit App.
- `Ctrl + D`: Toggle Bookmark (Universal).
- `Ctrl + 0`: Return to Feed.

---

## 4. Operational Notes

### 4.1 Data Persistence
- **Windows**: `%APPDATA%/HN Station/hn.db`
- **Schema**: Managed via Go migrations in the `internal/storage` layer.

### 4.2 Known Failure Modes and lessons
- **X-Frame-Options**: Many sites block iframes. The Desktop app solves this using the Electron `webview` with `webSecurity: false` for those specific contexts.
- **SQLite Locking**: The app uses a single database connection with a Write-Ahead Log (WAL) to prevent "database is locked" errors during high-speed ingestion.
- **AI Rate Limiting**: The summarizer implements a 10-second cool-down per request to stay within the Google Gemini Free Tier limits.
