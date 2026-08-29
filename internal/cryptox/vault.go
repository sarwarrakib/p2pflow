package cryptox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
)

// Vault encrypts tenant secrets at rest with AES-256-GCM. The application secret
// is never stored in the database; deployments should source it from a secret
// manager or protected environment variable.
type Vault struct{ key [32]byte }

func New(secret string) *Vault {
	return &Vault{key: sha256.Sum256([]byte(secret))}
}

func (v *Vault) Encrypt(plain string) (string, error) {
	if plain == "" {
		return "", nil
	}
	block, err := aes.NewCipher(v.key[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	out := gcm.Seal(nil, nonce, []byte(plain), nil)
	raw := append(nonce, out...)
	return "v1:" + base64.RawURLEncoding.EncodeToString(raw), nil
}

func (v *Vault) Decrypt(ciphertext string) (string, error) {
	if ciphertext == "" {
		return "", nil
	}
	if len(ciphertext) < 4 || ciphertext[:3] != "v1:" {
		return "", errors.New("unsupported ciphertext format")
	}
	raw, err := base64.RawURLEncoding.DecodeString(ciphertext[3:])
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(v.key[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	plain, err := gcm.Open(nil, raw[:gcm.NonceSize()], raw[gcm.NonceSize():], nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
