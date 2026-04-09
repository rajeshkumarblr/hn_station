# Show HN: HN Station – A split-pane, AI-enhanced Hacker News reader

Hi HN,

I built HN Station because I was tired of drowning in browser tabs. I wanted a way to read a story and its discussion side-by-side without losing context or constantly context-switching.

### The Problem
Most HN clients are great but force a linear flow. When you find an interesting thread, you often have to choose between reading the comments or the article. In the browser, you just open another tab, and suddenly you have 20 tabs open.

### The Tech Stack
- **Web Version**: Go backend which embeds and serves a React/TypeScript frontend. It uses a PostgreSQL database for shared state and summaries.
- **Desktop (Electron)**: A native wrapper that includes a Go-based background agent. This agent runs a Windows service (native) for continuous ingestion, ensuring your feed is fresh even when the app is closed. It uses SQLite for local persistence.

### Why a Desktop App?
This is the most common question! The web version is great for a quick look at AI summaries, but it's heavily limited by `X-Frame-Options` and `Content-Security-Policy` headers on many news sites. These headers block browsers from loading certain sites in iframes, which breaks the split-pane experience.

The Electron app bypasses these security headers during the fetch phase, allowing for a **true, unrestricted split-view** where you can read almost any article side-by-side with HN comments.

### AI Summaries
The app currently supports AI takeaways powered by local Ollama (llama3) or Gemini Pro. On the desktop app, it defaults to a local ingestion flow that keeps your data private while serving you concise key points.

### Roadmap
- Full local-first offline support.
- Better topic management and "smart" filters.
- Support for more local LLMs.
- Linux/Mac native ingestion services.

I'd love to hear your feedback on the interface and the split-pane workflow!

[Link to Repo](https://github.com/rajeshkumarblr/hn_station)
[Live Web Version](https://hnstation.dev)
