package binance

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"testing"
)

func TestFindRSAPublicKeyAndEncryptOAEP(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	publicPEM := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}))
	nested := map[string]any{"data": map[string]any{"rsaPublicKey": publicPEM}}
	found := FindRSAPublicKey(nested)
	if found == "" {
		t.Fatal("RSA public key was not discovered")
	}
	cipherText, err := EncryptRSAOAEPBase64(found, "fund-password-value")
	if err != nil {
		t.Fatal(err)
	}
	cipherBytes, err := base64.StdEncoding.DecodeString(cipherText)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := rsa.DecryptOAEP(sha256.New(), rand.Reader, privateKey, cipherBytes, nil)
	if err != nil {
		t.Fatal(err)
	}
	if string(plain) != "fund-password-value" {
		t.Fatalf("decrypted value mismatch: %q", plain)
	}
}
