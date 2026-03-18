package storage

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewStore initializes either a Postgres or SQLite store based on the connection string.
// If connections starts with "postgres://" or "postgresql://", it uses Postgres.
// Otherwise, it treats it as a file path for SQLite.
func NewStore(ctx context.Context, connStr string) (DB, error) {
	if strings.HasPrefix(connStr, "postgres://") || strings.HasPrefix(connStr, "postgresql://") {
		log.Println("Initializing Postgres storage...")
		dbpool, err := pgxpool.New(ctx, connStr)
		if err != nil {
			return nil, fmt.Errorf("unable to create postgres connection pool: %w", err)
		}
		// Verify connection
		if err := dbpool.Ping(ctx); err != nil {
			return nil, fmt.Errorf("unable to ping postgres: %w", err)
		}
		s := New(dbpool)
		if err := s.Migrate(ctx); err != nil {
			log.Printf("Warning: Postgres migration failed: %v", err)
		}
		return s, nil
	}

	log.Printf("Initializing SQLite storage at: %s", connStr)
	// SQLite path might be a direct file path
	return NewSQLite(connStr)
}
