# Hacker News Station

A modern, fast, and feature-rich Hacker News client built with Go and React.

## Features

- **Real-time Updates**: Stories are fetched every minute to keep content fresh.
- **Accurate Ranking**: "Front Page" algorithm mirrors HN exactly, clearing old ranks automatically.
- **Modern UI**: sleek dark mode (`bg-[#111827]`) with no white edges and a 3-column layout.
- **Comments Sidebar**: Read comments inline in a dedicated right sidebar with recursive threading.
- **Topic Filtering**: Filter stories by popular topics like *Postgres, LLM, Rust, Go, AI*.
- **Custom Topics**: Add and remove your own topics, persisted via local storage.
- **Search**: Full-text search powered by PostgreSQL `tsvector`.
- **Dockerized**: Easy setup with Docker Compose.

## Tech Stack

- **Backend**: Go (Golang) with `chi` router.
- **Database**: PostgreSQL with `pgx`.
- **Frontend**: React, TypeScript, Tailwind CSS, Vite.
- **Ingestion**: Custom Go worker pool fetching from HN Firebase API.

## Getting Started

### Prerequisites

- Docker and Docker Compose

### Running the Application

1. Clone the repository.
2. Start the services:

```bash
docker-compose up --build
```
3. Open http://localhost:3000 in your browser.

## Architecture

- **Ingestion Service**: Fetches top stories and comments from HN API, processes them, and stores them in Postgres.
- **API Server**: Serves stories and comments via REST endpoints (`/api/stories`, `/api/stories/{id}`).
- **Frontend**: A responsive single-page application consuming the API.

## Recent Updates

- **Phase 9**: Production Ingress with Let's Encrypt TLS (https://hnstation.dev).
- **Phase 8**: AKS Deployment, Ranking Consistency Fixes (Atomic Updates), and Ingestion improvements.
- **Phase 7**: Sidebar visual enhancements (contrast) and custom topic management.
