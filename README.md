# Hacker News Station

[![Go](https://img.shields.io/badge/Go-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?style=flat-square&logo=kubernetes&logoColor=white)](https://kubernetes.io)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
[![Live](https://img.shields.io/badge/Live-hnstation.dev-orange?style=flat-square)](https://hnstation.dev)

A modern, fast, and feature-rich Hacker News client built with Go and React. Live at **[hnstation.dev](https://hnstation.dev)**.

![Hacker News Station Screenshot](screenshot.png)

---

## Features

| Category | Highlights |
|----------|-----------|
| **Reading** | 3-pane resizable layout · Reader Mode (`go-readability`) · Smart iframe fallback |
| **Comments** | Recursive collapsible threads · Keyboard nav (`n`/`p` root comments) |
| **Discovery** | Topic filters (Postgres, LLM, Rust, …) · Full-text search (PostgreSQL `tsvector`) |
| **AI (BYOK)** | Discussion & article summarizer · Multi-turn contextual chat · Auto-summarization |
| **Auth** | Google OAuth · Bookmarks · Read/hidden state synced to DB |
| **Navigation** | Full keyboard control · `j`/`k`, `/` search, `z` Zen mode, `Delete` to hide |
| **Infra** | Docker Compose · Kubernetes (AKS + local Kind) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Go · `go-chi/chi` |
| Ingestion | Go worker pool · HN Firebase REST API |
| AI | Google Gemini 2.5 Flash (`google/generative-ai-go`) |
| Database | PostgreSQL · `pgx/v5` · `pgvector` |
| Auth | Google OAuth 2.0 · JWT (HS256) cookies |
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
cp .env.example .env   # fill in Google OAuth credentials, JWT_SECRET, optional GEMINI_API_KEY

# 3. Start everything
docker-compose up --build
```

Open **http://localhost:3000** in your browser.

### Local Kind Cluster

```bash
./infrastructure/deploy_local.sh
```

Uses the manifests in `infrastructure/k8s-local/`, pointing Postgres at your host machine's running PostgreSQL instance. See [`DEPLOY.md`](DEPLOY.md) for full details.

---

## Architecture

The system has four main components: a **Go ingestion worker** (polls HN every minute), a **Go API server** (REST + static file serving), a **React frontend**, and a **PostgreSQL database**.

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
| `GEMINI_API_KEY` | ⬜ | Server-side key for auto-summarization in the ingest service |
| `FRONTEND_URL` | ⬜ | Redirect URL after OAuth (defaults to `/`) |

---

## Recent Updates

- **Phase 40** — Local k8s deployment via `kind` with host-Postgres ExternalName service; Azure manifests moved to `infrastructure/azure/`; one-command `deploy_local.sh`.
- **Phase 38** — Reader Mode: server-side article fetch + sanitize (`go-readability` + `dompurify`), smart iframe fallback.
- **Phase 36** — Admin Panel v2: Grafana-style analytics dashboard with user list and activity metrics at `/admin`.
- **Phase 35** — Full light mode support, hover-expand story cards, zebra striping.
- **Phase 33** — Persistent AI chat history saved to DB (`chat_messages`); on-demand discussion summarization.
- **Phase 31** — Hide stories with `Delete` key; persisted in DB with "Show All" toggle.
- **Phase 29** — High-density single-line story list (15+ visible items); AI thread summarizer (`s` key).
