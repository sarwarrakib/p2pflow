package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"p2pflow/v2/internal/config"
	"p2pflow/v2/internal/db"
	"p2pflow/v2/internal/httpapi"
	"p2pflow/v2/internal/migrate"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	if !cfg.WorkerEnabled {
		log.Fatal("P2PFLOW_WORKERS=false; worker process has nothing to run")
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	if cfg.SetupRequired {
		log.Printf("P2PFlow setup is pending; worker will start after the setup token is removed")
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if _, err := os.Stat(cfg.SetupCodeFile); os.IsNotExist(err) {
					log.Printf("setup completed; exiting so systemd can restart the worker with final configuration")
					return
				}
			}
		}
	}
	store, err := db.Open(ctx, cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer store.DB.Close()
	if cfg.AutoMigrate {
		if err := migrate.Apply(ctx, store.DB, cfg.DBDriver, cfg.MigrationDir); err != nil {
			log.Fatal(err)
		}
	}
	app := httpapi.New(cfg, store)
	if err := app.EnsureSuperAdmin(ctx); err != nil {
		log.Printf("warning: super-admin setup: %v", err)
	}
	log.Printf("P2PFlow %s worker started instance=%s database=%s pid=%d", cfg.Version, cfg.InstanceID, cfg.DBDriver, os.Getpid())
	app.RunWorkers(ctx)
}
