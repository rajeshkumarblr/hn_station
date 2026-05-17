# HN Station

[![Go](https://img.shields.io/badge/Go-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://sqlite.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Live](https://img.shields.io/badge/Live-hnstation.dev-orange?style=flat-square)](https://hnstation.dev)

A local-first Hacker News desktop client. Read articles and comments side by side, get AI-powered summaries, and keep a searchable archive — all on your machine.

![Workflow Demo](screenshots/workflow_demo.gif)

---

## Why HN Station?

- **Split-pane reading** — Article and discussion side by side, like a proper workspace
- **Local AI assistant** — Summarize articles, analyze discussions, and chat about stories using [Ollama](https://ollama.com), Gemini, or OpenAI
- **Full-text search** — FTS5-powered instant search across titles, summaries, and topics with synonym-aware tag filtering
- **Privacy-first** — Built-in ad blocker and cookie stripper. All data stays in your local SQLite database
- **Keyboard-driven** — Navigate with `j/k`, open stories with `Enter`, cycle layouts with `Ctrl+Space`, and close tabs with `Ctrl+W`
- **Your personal archive** — Stories and comments persist locally forever. No account required

> **Web vs Desktop**: Try the [web preview at hnstation.dev](https://hnstation.dev) for a quick look. For the full experience — split-pane article loading, local AI, and persistent storage — use the desktop app.
> 
> *Note for Web Mode*: We have completely streamlined the web workspace into a premium, clutter-free **2-Pane Comments Workspace**! Articles are opened directly in your native browser tab for unblocked and secure reading, while the full right 70% of the screen is dedicated to Hacker News discussion comments, AI bullet takeaway summaries, and dynamic topic tags.

---

## Download

| Platform | Download | Notes |
|:---|:---|:---|
| **Windows** | [HN Station Setup 0.10.0.exe](https://github.com/rajeshkumarblr/hn_station/releases/latest) | NSIS installer, x64 |
| **macOS** | [HN Station 0.10.0.dmg](https://github.com/rajeshkumarblr/hn_station/releases/latest) | Universal binary |
| **Linux** | [AppImage](https://github.com/rajeshkumarblr/hn_station/releases/latest), [deb](https://github.com/rajeshkumarblr/hn_station/releases/latest), [rpm](https://github.com/rajeshkumarblr/hn_station/releases/latest) | x64 |
| **Web** | [hnstation.dev](https://hnstation.dev) | Lite preview |

---

## Features

### Reader
- Chrome-style browser toolbar with Back/Forward/Refresh/Home
- Triple-state dark mode: Original, Follow System, or Forced Safe Dark
- Tabbed workspace with Chrome-style flexible tabs
- Resizable AI sidebar with Discussion, Summary, and Chat tabs

### AI Integration
- **Article summaries** — Bullet-point takeaways from full article text
- **Discussion analysis** — Synthesized community opinion from top comments
- **Multi-turn chat** — Ask questions about any story with full context
- **Token-by-token streaming** via SSE with base64 encoding for lossless Markdown
- Supports **Ollama** (local), **Gemini**, and **OpenAI**

### Search & Filtering
- Hybrid FTS5 full-text search across the entire archive
- Canonical tag mapping with user-editable `tag_mappings.json`
- ANY/ALL/Exclusive match modes for multi-topic filtering
- Search-to-filter workflow: type and press Enter to create persistent topic chips

### Privacy Engine
- Request-level ad and tracker blocking
- Cookie stripping ("Ghost Mode")
- No telemetry, no analytics, no external calls (except HN API and your chosen AI provider)

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `j` / `k` or `↑` / `↓` | Navigate stories |
| `Enter` | Open story in split view |
| `Ctrl + Space` | Cycle layout: Article → Discussion → Split |
| `Ctrl + W` | Close tab / Exit (from Feed) |
| `Ctrl + Tab` | Next tab |
| `Ctrl + D` | Bookmarks |
| `Ctrl + 0` | Back to Feed |
| `Ctrl + Q` | Toggle sidebar |
| `Ctrl + G` | AI Chat |
| `Ctrl + H` | Discussion |
| `Ctrl + K` | AI Summary |
| `Alt + D` | Focus address bar |
| `F5` | Refresh |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Electron (Desktop)                         │
│  ┌───────────┐  ┌────────────────────────┐  │
│  │ React SPA │◄─│ Go Backend (SQLite)    │  │
│  │ (Vite)    │  │ localhost:58090         │  │
│  └───────────┘  │ • HN API ingestion     │  │
│                 │ • Ollama AI integration │  │
│                 │ • FTS5 search engine    │  │
│                 └────────────────────────┘  │
└─────────────────────────────────────────────┘
```

- **Frontend**: React 18 + TypeScript + Tailwind, bundled with Vite
- **Backend**: Go with Chi router, serving both API and embedded SPA
- **Storage**: SQLite (desktop) / PostgreSQL (web deployment)
- **AI**: Ollama for local inference, Gemini/OpenAI for cloud
- **Desktop**: Electron with bundled Go binary as background process

Data is stored at `%APPDATA%/HN Station/` (Windows) or `~/Library/Application Support/HN Station/` (macOS).

See [docs/architecture.md](docs/architecture.md) for the full technical deep-dive.

---

## Development

### Prerequisites
- **Go 1.22+**
- **Node.js 20+**
- **Ollama** (optional, for local AI features)

### Quick Start

**Windows (PowerShell):**
```powershell
# Build backend + frontend
.\scripts\build.ps1

# Run both components
.\scripts\run.ps1
```

**macOS:**
```bash
chmod +x scripts/start-desktop.sh
make dev
```

**Linux:**
```bash
make all
make dev-backend   # Terminal 1
make dev-frontend  # Terminal 2
```

### Build Desktop Installer

```bash
# Windows
npm run build:win --prefix web

# macOS
./scripts/release_mac.sh

# Linux (AppImage)
npm run build:linux --prefix web
```

---

## Contributing

Contributions welcome! Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE) © 2026 Rajesh Kumar
