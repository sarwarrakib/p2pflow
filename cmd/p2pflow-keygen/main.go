package main

import (
	"archive/zip"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

var b64 = base64.RawURLEncoding

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "vapid":
		err = generateVAPID(os.Args[2:])
	case "release":
		err = generateRelease(os.Args[2:])
	case "sign-release":
		err = signRelease(os.Args[2:])
	case "help", "-h", "--help":
		usage()
		return
	default:
		err = fmt.Errorf("unknown command %q", os.Args[1])
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `P2PFlow key helper

Usage:
  p2pflow-keygen vapid [--private-out FILE]
  p2pflow-keygen release [--private-out FILE]
  p2pflow-keygen sign-release --file RELEASE.zip [--key-file FILE]

The release signing private key is intended to stay offline. If --key-file is
omitted, sign-release reads P2PFLOW_UPDATE_PRIVATE_KEY from the environment.`)
}

func writePrivate(path, value string) error {
	if strings.TrimSpace(path) == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil && filepath.Dir(path) != "." {
		return err
	}
	if err := os.WriteFile(path, []byte(value+"\n"), 0600); err != nil {
		return err
	}
	return os.Chmod(path, 0600)
}

func generateVAPID(args []string) error {
	fs := flag.NewFlagSet("vapid", flag.ContinueOnError)
	privateOut := fs.String("private-out", "", "write the private scalar to a mode-0600 file")
	if err := fs.Parse(args); err != nil {
		return err
	}
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return err
	}
	scalar := make([]byte, 32)
	priv.D.FillBytes(scalar)
	pub := elliptic.Marshal(elliptic.P256(), priv.PublicKey.X, priv.PublicKey.Y)
	privateRaw := b64.EncodeToString(scalar)
	publicRaw := b64.EncodeToString(pub)
	if err := writePrivate(*privateOut, privateRaw); err != nil {
		return err
	}
	if *privateOut == "" {
		fmt.Println("VAPID_PRIVATE_KEY=" + privateRaw)
	} else {
		fmt.Println("VAPID_PRIVATE_KEY_FILE=" + *privateOut)
	}
	fmt.Println("VAPID_PUBLIC_KEY=" + publicRaw)
	return nil
}

func generateRelease(args []string) error {
	fs := flag.NewFlagSet("release", flag.ContinueOnError)
	privateOut := fs.String("private-out", "", "write the Ed25519 seed to a mode-0600 file")
	if err := fs.Parse(args); err != nil {
		return err
	}
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return err
	}
	seed := priv.Seed()
	privateRaw := b64.EncodeToString(seed)
	publicRaw := b64.EncodeToString(pub)
	if err := writePrivate(*privateOut, privateRaw); err != nil {
		return err
	}
	if *privateOut == "" {
		fmt.Println("P2PFLOW_UPDATE_PRIVATE_KEY=" + privateRaw)
	} else {
		fmt.Println("P2PFLOW_UPDATE_PRIVATE_KEY_FILE=" + *privateOut)
	}
	fmt.Println("P2PFLOW_UPDATE_PUBLIC_KEY=" + publicRaw)
	return nil
}

func decodeFlexible(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("empty key")
	}
	decoders := []func(string) ([]byte, error){
		base64.RawURLEncoding.DecodeString,
		base64.URLEncoding.DecodeString,
		base64.RawStdEncoding.DecodeString,
		base64.StdEncoding.DecodeString,
		hex.DecodeString,
	}
	for _, dec := range decoders {
		if out, err := dec(raw); err == nil {
			return out, nil
		}
	}
	return nil, errors.New("key is not valid base64/base64url/hex")
}

func loadReleasePrivate(keyFile string) (ed25519.PrivateKey, error) {
	raw := strings.TrimSpace(os.Getenv("P2PFLOW_UPDATE_PRIVATE_KEY"))
	if strings.TrimSpace(keyFile) != "" {
		b, err := os.ReadFile(keyFile)
		if err != nil {
			return nil, err
		}
		raw = strings.TrimSpace(string(b))
	}
	b, err := decodeFlexible(raw)
	if err != nil {
		return nil, fmt.Errorf("load release private key: %w", err)
	}
	switch len(b) {
	case ed25519.SeedSize:
		return ed25519.NewKeyFromSeed(b), nil
	case ed25519.PrivateKeySize:
		return ed25519.PrivateKey(append([]byte(nil), b...)), nil
	default:
		return nil, fmt.Errorf("release private key must encode a %d-byte Ed25519 seed or %d-byte private key", ed25519.SeedSize, ed25519.PrivateKeySize)
	}
}

func zipVersion(path string) (string, error) {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return "", err
	}
	defer zr.Close()
	var candidates []*zip.File
	for _, f := range zr.File {
		clean := filepath.ToSlash(filepath.Clean(f.Name))
		if clean == "VERSION" || (strings.Count(clean, "/") == 1 && strings.HasSuffix(clean, "/VERSION")) {
			candidates = append(candidates, f)
		}
	}
	if len(candidates) != 1 {
		return "", fmt.Errorf("release ZIP must contain exactly one VERSION at root or one top-level directory")
	}
	r, err := candidates[0].Open()
	if err != nil {
		return "", err
	}
	defer r.Close()
	b, err := io.ReadAll(io.LimitReader(r, 256))
	if err != nil {
		return "", err
	}
	version := strings.TrimSpace(string(b))
	if version == "" {
		return "", errors.New("VERSION is empty")
	}
	return version, nil
}

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func signRelease(args []string) error {
	fs := flag.NewFlagSet("sign-release", flag.ContinueOnError)
	file := fs.String("file", "", "release ZIP to hash and sign")
	keyFile := fs.String("key-file", "", "file containing base64url/base64/hex Ed25519 seed/private key")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*file) == "" {
		return errors.New("--file is required")
	}
	version, err := zipVersion(*file)
	if err != nil {
		return err
	}
	sha, err := fileSHA256(*file)
	if err != nil {
		return err
	}
	priv, err := loadReleasePrivate(*keyFile)
	if err != nil {
		return err
	}
	message := "p2pflow-release:v1\nversion=" + version + "\nsha256=" + strings.ToLower(sha) + "\n"
	sig := ed25519.Sign(priv, []byte(message))
	fmt.Println("VERSION=" + version)
	fmt.Println("SHA256=" + sha)
	fmt.Println("SIGNATURE=" + b64.EncodeToString(sig))
	fmt.Println("SIGNING_MESSAGE_BEGIN")
	fmt.Print(message)
	fmt.Println("SIGNING_MESSAGE_END")
	return nil
}
