package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"p2pflow/v2/internal/config"
)

type Store struct {
	DB     *sql.DB
	Driver string
}

func Open(ctx context.Context, c config.Config) (*Store, error) {
	driver := "pgx"
	if c.DBDriver == "mysql" || c.DBDriver == "mariadb" {
		driver = "mysql"
	}
	d, err := sql.Open(driver, c.DBURL)
	if err != nil {
		return nil, err
	}
	d.SetMaxOpenConns(c.DBMaxOpen)
	d.SetMaxIdleConns(c.DBMaxIdle)
	d.SetConnMaxLifetime(c.DBConnMaxLifetime)
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := d.PingContext(pingCtx); err != nil {
		_ = d.Close()
		return nil, fmt.Errorf("database ping: %w", err)
	}
	return &Store{DB: d, Driver: c.DBDriver}, nil
}
func (s *Store) Bind(n int) string {
	if s.Driver == "postgres" {
		return fmt.Sprintf("$%d", n)
	}
	return "?"
}
func (s *Store) KeyColumn() string {
	if s.Driver == "postgres" {
		return "key"
	}
	return "`key`"
}
func (s *Store) Bool(v bool) any { return v }
