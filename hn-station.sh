#!/bin/bash

# hn-station.sh - Launcher for HN Station Local
# This script ensures the Go backend is built and then starts the Electron app.

set -e

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

echo "🚀 Starting HN Station..."

# 1. Build the local backend (always rebuild to ensure latest changes)
echo "📦 Building local backend (hn-local)..."
rm -f web/resources/hn-local
go build -o web/resources/hn-local ./cmd/local

# 2. Start the application
cd web
echo "🖥️  Launching Electron..."
npm run dev
