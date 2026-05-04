#!/bin/bash
# scripts/start-desktop.sh - Build and run HN Station as a Desktop Electron App for macOS

# 1. Cleanup
echo "🚀 Cleaning up old processes..."
pkill -f "hn-local" || true
pkill -f "HN Station" || true

# 2. Build Backend
echo "🏗️  Building Go Backend for macOS..."
mkdir -p web/resources

# Detect architecture (Intel vs Apple Silicon)
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    GOARCH=amd64
    echo "💻 Target: Intel Mac (amd64)"
else
    GOARCH=arm64
    echo "🚀 Target: Apple Silicon Mac (arm64)"
fi

GOOS=darwin GOARCH=$GOARCH go build -o web/resources/hn-local ./cmd/local
if [ $? -ne 0 ]; then
    echo "❌ Backend build failed"
    exit 1
fi

# 3. Frontend Setup
echo "📦 Preparing Frontend..."
export VITE_ELECTRON="true"

cd web
if [ ! -d "node_modules" ]; then
    echo "📥 Installing dependencies..."
    npm install
fi

# 4. Launch
echo "🌟 Launching HN Station..."
npm run dev
cd ..
