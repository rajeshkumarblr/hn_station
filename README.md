# Hacker News Station

[![Go](https://img.shields.io/badge/Go-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?style=flat-square&logo=kubernetes&logoColor=white)](https://kubernetes.io)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
[![Live](https://img.shields.io/badge/Live-hnstation.dev-orange?style=flat-square)](https://hnstation.dev)

A modern, fast, and feature-rich Hacker News client built with Go and React. Live at **[hnstation.dev](https://hnstation.dev)**, or as a **fully-contained local Desktop app**.

![HN Station Feed](screenshots/feed_view.png)


## Features

- **Split-Pane Workspace**: A modern 3-pane responsive layout that allows you to seamlessly browse the feed, read articles natively (or via Reader Mode), and view HN discussions side-by-side.
  ![Split View](screenshots/split_view.png)
- **Adaptive Mobile UI**: A distinct, touch-friendly mobile shell that automatically activates on small screens, featuring a bottom navigation bar and full-screen drill-down reader views without sacrificing the desktop power-user experience.
- **Desktop Multi-Tab Support**: Open multiple stories concurrently on desktop viewing, with smart focus-snapping and sandboxed web views.
- **Automated AI Summaries & Tagging**: A background Go ingestion worker automatically fetches top HN articles, uses local LLMs (via Ollama) to pre-generate concise "Zen" summaries, and tags them with deterministic semantic topics (e.g., Postgres, Rust, AI) for quick visual scanning.
- **Smart Reader Mode**: Includes specialized Web/Text fallback toggles. By default, it embeds websites natively or renders PDFs via `<object>` tags, and smoothly falls back to a clean text-only "Reader Mode" (`go-readability`) if paywalled or blocked.
  ![Article View](screenshots/article_view.png)
- **Archive Retention**: Intelligently maintains an actively rolling 7-day database archive of the top stories for continuous scrolling, with permanent retention for securely bookmarked items.
- **Advanced Comment Threads**: Deeply nested, recursive, and collapsible HN discussion threads. Navigate smoothly with deep keyboard bindings.
- **Dynamic "Zen" Sidebar**: A high-efficiency right sidebar that provides:
  - **Bold AI Summaries**: Instantly read article takeaways in a stabilized, high-contrast amber summary pane.
  - **Page-Aware Tags**: Automatically computes and displays tags relevant only to your current feed page.
  - **Match Highlighting**: When clicking a tag, corresponding labels in the feed "light up" in orange for instant visual search confirmation.
- **Zero-Login Local Mode**: The Desktop app runs an embedded SQLite backend locally. Browse, bookmark, and queue stories without ever needing an external account or internet sync.
- **Keyboard-First Navigation**: Vim-like feed navigation (`j`/`k`), `Home`/`End` support, `/` to search, `z` for Zen mode, and `Delete` to hide stories.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Go · `go-chi/chi` |
| Ingestion | Go worker pool · HN Firebase REST API |
| AI | Ollama (`qwen2.5-coder`) · Local GPU · Discussion Context |
| Database | PostgreSQL (Web) / SQLite (Local Desktop) |
| Auth | Google OAuth 2.0 (Web) / No-Auth (Local Desktop) |
| Frontend | React 18 · TypeScript · Tailwind CSS · Vite |
| Infrastructure | Docker · Kubernetes (AKS / Kind) · NGINX Ingress |

---

## Getting Started

### Prerequisites

- Docker and Docker Compose

### Docker Compose (Quickstart)

```bash
# 1. Clone the repo
git clone https://github.com/rajeshkumarblr/hn_station && cd hn_station

# 2. Configure environment
cp .env.example .env   # fill in Google OAuth credentials and JWT_SECRET

# 3. Start everything
docker-compose up --build
```

Open **http://localhost:3000** in your browser.

### Local Kind Cluster

```bash
./infrastructure/deploy_local.sh
```

Uses the manifests in `infrastructure/k8s-local/`, pointing Postgres at your host machine's running PostgreSQL instance. See [`DEPLOY.md`](DEPLOY.md) for full details.

### Electron Desktop App

A powerful, fully-contained desktop experience. It **bundles its own Go backend** and uses a local **SQLite** database for zero-config persistence.

```bash
cd web
npm install       # first time only
npm run dev       # launches the Electron app + local backend
```

**Desktop features:**
- **Bundled Backend**: Spawns a dedicated Go worker process on startup — no external server required.
- **Local SQLite Persistence**: Your reading history and bookmarks are stored privately on your machine.
- **Enhanced Visual Focus**: High-contrast "VS Code style" line highlighting for active stories.
- **Native Browsing**: Frameless window with native drag, windows/macOS style window controls.
- **Persistent Tab State**: Switching tabs never reloads the page or loses scroll position.
- `Ctrl+Tab` / `Ctrl+Shift+Tab` to cycle through open article tabs.

---

## Architecture

The system has four main components: a **Go ingestion worker** (polls HN periodically, fetching articles and automatically generating AI summaries & topic tags via a local GPU node), a **Go API server** (REST + static file serving), a **React frontend**, and a **PostgreSQL database**.

For a detailed breakdown — component responsibilities, all API routes, database schema, data flow diagrams, and infrastructure layout — see **[architecture.md](architecture.md)**.

---

## Environment Variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret for signing JWT session tokens |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth client secret |
| `OAUTH_CALLBACK_URL` | ✅ | Full callback URL (e.g. `https://hnstation.dev/auth/google/callback`) |
| `OLLAMA_URL` | ⬜ | URL for local Ollama instance (e.g. `http://localhost:11434`) |
| `FRONTEND_URL` | ⬜ | Redirect URL after OAuth (defaults to `/`) |


