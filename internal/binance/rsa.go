package binance

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"strings"
)

// FindRSAPublicKey extracts the public-key string from the varying response
// wrappers used by the C2C compatibility endpoint without depending on one
// particular envelope shape.
func FindRSAPublicKey(v any) string {
	var walk func(any) string
	walk = func(x any) string {
		switch z := x.(type) {
		case map[string]any:
			for k, value := range z {
				lk := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(k, "_", ""), "-", ""))
				if lk == "publickey" || lk == "rsapublickey" || lk == "key" {
					if s := strings.TrimSpace(fmt.Sprint(value)); s != "" && s != "<nil>" {
						return s
					}
				}
			}
			for _, value := range z {
				if s := walk(value); s != "" {
					return s
				}
			}
		case []any:
			for _, value := range z {
				if s := walk(value); s != "" {
					return s
				}
			}
		case string:
			if strings.Contains(z, "BEGIN PUBLIC KEY") || strings.Contains(z, "BEGIN RSA PUBLIC KEY") {
				return z
			}
		}
		return ""
	}
	return walk(v)
}

func parseRSAPublicKey(raw string) (*rsa.PublicKey, error) {
	raw = strings.TrimSpace(strings.ReplaceAll(raw, `\n`, "\n"))
	if raw == "" {
		return nil, fmt.Errorf("empty RSA public key")
	}
	var der []byte
	if block, _ := pem.Decode([]byte(raw)); block != nil {
		der = block.Bytes
	} else {
		compact := strings.Map(func(r rune) rune {
			if r == ' ' || r == '\n' || r == '\r' || r == '\t' {
				return -1
			}
			return r
		}, raw)
		b, err := base64.StdEncoding.DecodeString(compact)
		if err != nil {
			return nil, fmt.Errorf("invalid RSA public key encoding: %w", err)
		}
		der = b
	}
	if key, err := x509.ParsePKIXPublicKey(der); err == nil {
		if pub, ok := key.(*rsa.PublicKey); ok {
			return pub, nil
		}
	}
	if pub, err := x509.ParsePKCS1PublicKey(der); err == nil {
		return pub, nil
	}
	if cert, err := x509.ParseCertificate(der); err == nil {
		if pub, ok := cert.PublicKey.(*rsa.PublicKey); ok {
			return pub, nil
		}
	}
	return nil, fmt.Errorf("unsupported RSA public key format")
}

// EncryptRSAOAEPBase64 applies the legacy Binance FUND_PWD requirement:
// RSA/OAEP with SHA-256, base64 encoded for the releaseCoin code field.
func EncryptRSAOAEPBase64(publicKey, plaintext string) (string, error) {
	if plaintext == "" {
		return "", fmt.Errorf("fund password is empty")
	}
	pub, err := parseRSAPublicKey(publicKey)
	if err != nil {
		return "", err
	}
	cipher, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, pub, []byte(plaintext), nil)
	if err != nil {
		return "", fmt.Errorf("RSA/OAEP-SHA256 encryption failed: %w", err)
	}
	return base64.StdEncoding.EncodeToString(cipher), nil
}
