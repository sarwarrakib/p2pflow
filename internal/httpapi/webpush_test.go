package httpapi

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"testing"
)

func TestVAPIDPublicKeyDerivationStable(t *testing.T) {
	priv := make([]byte, 32)
	priv[31] = 1
	raw := base64.RawURLEncoding.EncodeToString(priv)
	pub1, err := vapidPublicKey(raw, "")
	if err != nil {
		t.Fatal(err)
	}
	pub2, err := vapidPublicKey(raw, pub1)
	if err != nil {
		t.Fatal(err)
	}
	if pub1 != pub2 {
		t.Fatalf("derived public key changed: %q != %q", pub1, pub2)
	}
	b, err := base64.RawURLEncoding.DecodeString(pub1)
	if err != nil || len(b) != 65 || b[0] != 4 {
		t.Fatalf("unexpected public key encoding: len=%d err=%v", len(b), err)
	}
}

func TestEncryptWebPushRoundTrip(t *testing.T) {
	curve := ecdh.P256()
	recipientPriv, err := curve.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	auth := make([]byte, 16)
	if _, err := rand.Read(auth); err != nil {
		t.Fatal(err)
	}
	payload := []byte(`{"title":"P2PFlow","body":"hello"}`)
	encoded, err := encryptWebPush(payload, recipientPriv.PublicKey().Bytes(), auth)
	if err != nil {
		t.Fatal(err)
	}
	if len(encoded) < 86 {
		t.Fatalf("encoded body too short: %d", len(encoded))
	}
	salt := encoded[:16]
	rs := binary.BigEndian.Uint32(encoded[16:20])
	if rs != webPushRecordSize {
		t.Fatalf("unexpected record size %d", rs)
	}
	idLen := int(encoded[20])
	if idLen != 65 || len(encoded) <= 21+idLen {
		t.Fatalf("invalid sender key header: %d", idLen)
	}
	senderPubBytes := encoded[21 : 21+idLen]
	ciphertext := encoded[21+idLen:]
	senderPub, err := curve.NewPublicKey(senderPubBytes)
	if err != nil {
		t.Fatal(err)
	}
	shared, err := recipientPriv.ECDH(senderPub)
	if err != nil {
		t.Fatal(err)
	}
	info := []byte("WebPush: info\x00")
	info = append(info, recipientPriv.PublicKey().Bytes()...)
	info = append(info, senderPubBytes...)
	ikm, err := hkdfExpand(hkdfExtract(auth, shared), info, 32)
	if err != nil {
		t.Fatal(err)
	}
	prk := hkdfExtract(salt, ikm)
	cek, _ := hkdfExpand(prk, []byte("Content-Encoding: aes128gcm\x00"), 16)
	nonce, _ := hkdfExpand(prk, []byte("Content-Encoding: nonce\x00"), 12)
	block, err := aes.NewCipher(cek)
	if err != nil {
		t.Fatal(err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(plain) == 0 || plain[len(plain)-1] != 0x02 {
		t.Fatalf("missing final record delimiter")
	}
	plain = plain[:len(plain)-1]
	if string(plain) != string(payload) {
		t.Fatalf("payload mismatch: %q", plain)
	}
}

func TestValidatePushEndpointRejectsPrivateTargets(t *testing.T) {
	bad := []string{
		"http://push.example.com/send",
		"https://127.0.0.1/push",
		"https://10.10.1.4/push",
		"https://[::1]/push",
		"https://localhost/push",
		"https://service.internal/push",
	}
	for _, raw := range bad {
		if _, err := validatePushEndpoint(raw); err == nil {
			t.Fatalf("expected endpoint rejection for %q", raw)
		}
	}
	if _, err := validatePushEndpoint("https://push.example.com/send/abc"); err != nil {
		t.Fatalf("public endpoint rejected: %v", err)
	}
}

func TestNotificationCategory(t *testing.T) {
	cases := map[string]string{
		"order_assigned":  "orders",
		"billing_invoice": "billing",
		"security_alert":  "security",
		"chat_message":    "messages",
		"payment_split":   "payments",
		"approval":        "accounting",
		"worker_health":   "system",
	}
	for kind, want := range cases {
		if got := notificationCategory(kind, `{}`); got != want {
			t.Fatalf("%s => %s, want %s", kind, got, want)
		}
	}
	if got := notificationCategory("anything", `{"category":"billing"}`); got != "billing" {
		t.Fatalf("explicit category ignored: %s", got)
	}
}
