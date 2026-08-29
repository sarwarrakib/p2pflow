package main

import (
	"context"
	"log"

	"p2pflow/v2/internal/config"
	"p2pflow/v2/internal/db"
	"p2pflow/v2/internal/migrate"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	ctx := context.Background()
	store, err := db.Open(ctx, cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer store.DB.Close()
	if err := migrate.Apply(ctx, store.DB, cfg.DBDriver, cfg.MigrationDir); err != nil {
		log.Fatal(err)
	}
	log.Printf("P2PFlow %s database migrations are current (%s)", cfg.Version, cfg.DBDriver)
}
