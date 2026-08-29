package main

import (
	"context"
	"log"
	"net/http"
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

	rootCtx, cancelRoot := context.WithCancel(context.Background())
	defer cancelRoot()
	store, err := db.Open(rootCtx, cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer store.DB.Close()

	if cfg.AutoMigrate {
		if err := migrate.Apply(rootCtx, store.DB, cfg.DBDriver, cfg.MigrationDir); err != nil {
			log.Fatalf("database migration failed: %v", err)
		}
		log.Printf("database migrations are current (%s)", cfg.DBDriver)
	}

	app := httpapi.New(cfg, store)
	if err := app.EnsureSuperAdmin(rootCtx); err != nil {
		log.Printf("warning: could not apply configured super-admin: %v", err)
	}
	if cfg.WorkerEnabled {
		go app.RunWorkers(rootCtx)
	}
	go app.RunRealtimeBridge(rootCtx)

	srv := &http.Server{
		Addr: cfg.Listen, Handler: app.Handler(),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second,
		WriteTimeout: 30 * time.Second, IdleTimeout: 90 * time.Second,
	}
	go func() {
		log.Printf("P2PFlow %s listening on %s using %s instance=%s workers=%v", cfg.Version, cfg.Listen, cfg.DBDriver, cfg.InstanceID, cfg.WorkerEnabled)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
	<-ch
	cancelRoot()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
