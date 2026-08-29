package httpapi

import (
	"archive/zip"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
)

func writeTestReleaseZip(t *testing.T, entries map[string]string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "release.zip")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	for name, content := range entries {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestExtractReleaseZipSingleRoot(t *testing.T) {
	path := writeTestReleaseZip(t, map[string]string{
		"P2PFlow_v2.0.4/VERSION":                     "2.0.4\n",
		"P2PFlow_v2.0.4/web/index.html":              "ok",
		"P2PFlow_v2.0.4/migrations/postgres/001.sql": "-- test",
		"P2PFlow_v2.0.4/cmd/p2pflow/main.go":         "package main",
	})
	dst := t.TempDir()
	root, err := extractReleaseZip(path, dst, 10<<20)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateReleaseRoot(root); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(root, "VERSION"))
	if err != nil || string(b) != "2.0.4\n" {
		t.Fatalf("unexpected VERSION: %q %v", b, err)
	}
}

func TestExtractReleaseZipRejectsTraversal(t *testing.T) {
	path := writeTestReleaseZip(t, map[string]string{"../escape.txt": "no"})
	if _, err := extractReleaseZip(path, t.TempDir(), 1<<20); err == nil {
		t.Fatal("expected traversal rejection")
	}
}

func TestReleaseSignatureVerification(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	m := systemReleaseManifest{Version: "2.0.6", SHA256: "0123456789abcdef"}
	m.Signature = base64.RawURLEncoding.EncodeToString(ed25519.Sign(priv, releaseSignatureMessage(m)))
	if err := verifyReleaseSignature(base64.RawURLEncoding.EncodeToString(pub), m, true); err != nil {
		t.Fatal(err)
	}
	m.SHA256 = "deadbeef"
	if err := verifyReleaseSignature(base64.RawURLEncoding.EncodeToString(pub), m, true); err == nil {
		t.Fatal("tampered manifest signature accepted")
	}
}
