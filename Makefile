# Makefile for HN Station (macOS/Linux)

.PHONY: all dev build clean backend frontend

all: build

# 🏗️ Build both backend and frontend
build: backend frontend

backend:
	@echo "Building backend..."
	@mkdir -p web/resources
	@GOOS=darwin go build -o web/resources/hn-local ./cmd/local

frontend:
	@echo "Building frontend..."
	@cd web && npm install && npm run build

# 🌟 Run the desktop app in dev mode
dev:
	@echo "Starting HN Station Desktop (Dev Mode)..."
	@chmod +x scripts/start-desktop.sh
	@./scripts/start-desktop.sh

# 🧹 Clean up binaries and logs
clean:
	@echo "Cleaning up..."
	@rm -rf web/resources/hn-local
	@rm -rf web/dist
	@rm -rf web/dist-electron
	@rm -rf web/release
	@find . -name "*.log" -type f -delete

# 🧪 Run tests
test:
	@go test ./...
