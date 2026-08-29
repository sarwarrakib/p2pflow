package httpapi

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"p2pflow/v2/internal/config"
)

func TestSetupV208SecretValidation(t *testing.T) {
	for _, bad := range []string{"", "123456", "654321", "111111", "12345a", "012345"} {
		if validSetupSecret(bad) {
			t.Fatalf("secret %q should be rejected", bad)
		}
	}
	if !validSetupSecret("482731") {
		t.Fatal("non-sequential six digit secret should be accepted")
	}
}

func TestSetupV208PostgresDSN(t *testing.T) {
	provider, dsn, err := setupExternalDSN(setupV208Input{
		DatabaseProvider: "postgres",
		DatabaseHost:     "127.0.0.1",
		DatabasePort:     "5432",
		DatabaseName:     "p2pflow",
		DatabaseUser:     "p2pflow",
		DatabasePassword: "p@ss:word",
		DatabaseSSL:      "false",
	})
	if err != nil {
		t.Fatal(err)
	}
	if provider != "postgres" || !strings.Contains(dsn, "sslmode=disable") || !strings.Contains(dsn, "p2pflow") {
		t.Fatalf("unexpected postgres DSN: %s %s", provider, dsn)
	}
}

func TestSetupV208EnvAtomic(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "p2pflow.env")
	if err := os.WriteFile(path, []byte("APP_SECRET=\"keep-me\"\nP2PFLOW_SETUP_REQUIRED=\"true\"\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := writeSetupEnvAtomic(path, map[string]string{"P2PFLOW_SETUP_REQUIRED": "false", "P2PFLOW_VERSION": "2.0.8"}); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(b)
	for _, token := range []string{"APP_SECRET=\"keep-me\"", "P2PFLOW_SETUP_REQUIRED=\"false\"", "P2PFLOW_VERSION=\"2.0.8\""} {
		if !strings.Contains(text, token) {
			t.Fatalf("missing %s in %s", token, text)
		}
	}
}

func TestSetupV208GateBlocksNormalAPI(t *testing.T) {
	s := &Server{cfg: config.Config{SetupRequired: true}}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	w := httptest.NewRecorder()
	s.setupGate(next).ServeHTTP(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 during setup, got %d", w.Code)
	}
}
