# HN Station Makefile
# Use 'make' to build all components

.PHONY: all build-backend build-frontend run dev clean

all: build-backend build-frontend

build-backend:
	@echo "Building Backend..."
	go build -o bin/hn-backend.exe ./cmd/local/main.go

build-frontend:
	@echo "Building Frontend..."
	cd web && npm install && npm run build

run: build-backend
	@echo "Starting Backend..."
	./bin/hn-backend.exe -port 58090

dev-backend:
	@echo "Starting Backend in Dev Mode..."
	go run ./cmd/local/main.go -port 58090

dev-frontend:
	@echo "Starting Frontend in Dev Mode..."
	cd web && npm run dev

clean:
	@echo "Cleaning up binaries..."
	rm -rf bin/
