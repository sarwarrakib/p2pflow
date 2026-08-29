package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadEnvFileQuotedDSNAndNoOverride(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	if err := os.WriteFile(path, []byte("P2PFLOW_TEST_DSN='user:pass@tcp(localhost:3306)/db?parseTime=true&charset=utf8mb4'\nP2PFLOW_TEST_KEEP=file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("P2PFLOW_TEST_KEEP", "environment")
	_ = os.Unsetenv("P2PFLOW_TEST_DSN")
	defer os.Unsetenv("P2PFLOW_TEST_DSN")
	loadEnvFile(path)
	if got := os.Getenv("P2PFLOW_TEST_DSN"); got != "user:pass@tcp(localhost:3306)/db?parseTime=true&charset=utf8mb4" {
		t.Fatalf("unexpected DSN %q", got)
	}
	if got := os.Getenv("P2PFLOW_TEST_KEEP"); got != "environment" {
		t.Fatalf("existing environment was overwritten: %q", got)
	}
}
