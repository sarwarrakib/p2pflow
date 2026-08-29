package httpapi

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const webPushRecordSize = uint32(4096)

type webPushSubscription struct {
	Endpoint string
	P256DH   string
	Auth     string
}

func decodeRawURLBase64(v string) ([]byte, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil, errors.New("empty base64url value")
	}
	return base64.RawURLEncoding.DecodeString(strings.TrimRight(v, "="))
}

func vapidPrivateKey(raw string) (*ecdsa.PrivateKey, []byte, error) {
	b, err := decodeRawURLBase64(raw)
	if err != nil {
		return nil, nil, fmt.Errorf("decode VAPID_PRIVATE_KEY: %w", err)
	}
	if len(b) != 32 {
		return nil, nil, fmt.Errorf("VAPID_PRIVATE_KEY must be a 32-byte P-256 scalar encoded as base64url")
	}
	d := new(big.Int).SetBytes(b)
	curve := elliptic.P256()
	if d.Sign() <= 0 || d.Cmp(curve.Params().N) >= 0 {
		return nil, nil, errors.New("VAPID_PRIVATE_KEY scalar is outside P-256 range")
	}
	x, y := curve.ScalarBaseMult(b)
	priv := &ecdsa.PrivateKey{PublicKey: ecdsa.PublicKey{Curve: curve, X: x, Y: y}, D: d}
	pub := elliptic.Marshal(curve, x, y)
	return priv, pub, nil
}

func vapidPublicKey(privateRaw, configuredPublic string) (string, error) {
	_, derived, err := vapidPrivateKey(privateRaw)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(configuredPublic) != "" {
		b, decErr := decodeRawURLBase64(configuredPublic)
		if decErr != nil || len(b) != 65 || !bytes.Equal(b, derived) {
			return "", errors.New("VAPID_PUBLIC_KEY does not match VAPID_PRIVATE_KEY")
		}
	}
	return base64.RawURLEncoding.EncodeToString(derived), nil
}

func hkdfExtract(salt, ikm []byte) []byte {
	if len(salt) == 0 {
		salt = make([]byte, sha256.Size)
	}
	h := hmac.New(sha256.New, salt)
	_, _ = h.Write(ikm)
	return h.Sum(nil)
}

func hkdfExpand(prk, info []byte, n int) ([]byte, error) {
	if n < 0 || n > 255*sha256.Size {
		return nil, errors.New("invalid HKDF output length")
	}
	out := make([]byte, 0, n)
	var previous []byte
	for counter := byte(1); len(out) < n; counter++ {
		h := hmac.New(sha256.New, prk)
		_, _ = h.Write(previous)
		_, _ = h.Write(info)
		_, _ = h.Write([]byte{counter})
		previous = h.Sum(nil)
		need := n - len(out)
		if need > len(previous) {
			need = len(previous)
		}
		out = append(out, previous[:need]...)
	}
	return out, nil
}

// encryptWebPush implements RFC 8291 + RFC 8188 aes128gcm content encoding.
// The resulting byte slice is the complete HTTP entity body, including the
// salt/record-size/key-id header expected by modern Push Services.
func encryptWebPush(payload, recipientPublic, authSecret []byte) ([]byte, error) {
	if len(payload) > int(webPushRecordSize)-86-17 {
		return nil, fmt.Errorf("push payload too large: %d bytes", len(payload))
	}
	if len(recipientPublic) != 65 || recipientPublic[0] != 4 {
		return nil, errors.New("subscription p256dh must contain an uncompressed P-256 public key")
	}
	if len(authSecret) < 16 {
		return nil, errors.New("subscription auth secret is invalid")
	}
	curve := ecdh.P256()
	recipient, err := curve.NewPublicKey(recipientPublic)
	if err != nil {
		return nil, fmt.Errorf("invalid subscription public key: %w", err)
	}
	senderPriv, err := curve.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	senderPub := senderPriv.PublicKey().Bytes()
	shared, err := senderPriv.ECDH(recipient)
	if err != nil {
		return nil, err
	}

	// RFC 8291 section 3.4: first combine the ECDH secret with the auth secret.
	info := make([]byte, 0, len("WebPush: info\x00")+130)
	info = append(info, []byte("WebPush: info\x00")...)
	info = append(info, recipientPublic...)
	info = append(info, senderPub...)
	ikmPRK := hkdfExtract(authSecret, shared)
	ikm, err := hkdfExpand(ikmPRK, info, 32)
	if err != nil {
		return nil, err
	}

	salt := make([]byte, 16)
	if _, err = rand.Read(salt); err != nil {
		return nil, err
	}
	prk := hkdfExtract(salt, ikm)
	cek, err := hkdfExpand(prk, []byte("Content-Encoding: aes128gcm\x00"), 16)
	if err != nil {
		return nil, err
	}
	nonce, err := hkdfExpand(prk, []byte("Content-Encoding: nonce\x00"), 12)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(cek)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	plain := append(append([]byte(nil), payload...), 0x02) // final-record delimiter
	ciphertext := gcm.Seal(nil, nonce, plain, nil)

	body := make([]byte, 0, 16+4+1+len(senderPub)+len(ciphertext))
	body = append(body, salt...)
	var rs [4]byte
	binary.BigEndian.PutUint32(rs[:], webPushRecordSize)
	body = append(body, rs[:]...)
	body = append(body, byte(len(senderPub)))
	body = append(body, senderPub...)
	body = append(body, ciphertext...)
	return body, nil
}

func pushAudience(endpoint string) (string, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", errors.New("invalid push endpoint")
	}
	return u.Scheme + "://" + u.Host, nil
}

func makeVAPIDAuthorization(endpoint, subject, privateRaw, configuredPublic string, now time.Time) (string, string, error) {
	priv, pub, err := vapidPrivateKey(privateRaw)
	if err != nil {
		return "", "", err
	}
	pubB64 := base64.RawURLEncoding.EncodeToString(pub)
	if strings.TrimSpace(configuredPublic) != "" {
		configured, decErr := decodeRawURLBase64(configuredPublic)
		if decErr != nil || !bytes.Equal(configured, pub) {
			return "", "", errors.New("VAPID_PUBLIC_KEY does not match VAPID_PRIVATE_KEY")
		}
	}
	aud, err := pushAudience(endpoint)
	if err != nil {
		return "", "", err
	}
	subject = strings.TrimSpace(subject)
	if subject == "" {
		return "", "", errors.New("VAPID_SUBJECT is required")
	}
	subjectURL, subjectErr := url.Parse(subject)
	if subjectErr != nil || subjectURL.Scheme == "" || (subjectURL.Scheme != "mailto" && subjectURL.Scheme != "https") {
		return "", "", errors.New("VAPID_SUBJECT must be a mailto: or https: contact URI")
	}
	header, _ := json.Marshal(map[string]any{"typ": "JWT", "alg": "ES256"})
	claims, _ := json.Marshal(map[string]any{"aud": aud, "exp": now.UTC().Add(12 * time.Hour).Unix(), "sub": subject})
	input := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(claims)
	digest := sha256.Sum256([]byte(input))
	r, s, err := ecdsa.Sign(rand.Reader, priv, digest[:])
	if err != nil {
		return "", "", err
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	jwt := input + "." + base64.RawURLEncoding.EncodeToString(sig)
	return "vapid t=" + jwt + ", k=" + pubB64, pubB64, nil
}

func forbiddenPushIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified()
}

func validatePushEndpoint(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
		return nil, errors.New("push endpoint must be an absolute HTTPS URL without credentials")
	}
	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") {
		return nil, errors.New("local/private push endpoint is not allowed")
	}
	if ip := net.ParseIP(host); ip != nil && forbiddenPushIP(ip) {
		return nil, errors.New("private push endpoint is not allowed")
	}
	return u, nil
}

// pushHTTPClient resolves the endpoint once, rejects non-public addresses, and
// pins the request dial to that validated address. This closes the common DNS
// rebinding gap in SSRF checks while retaining the original hostname for TLS.
func pushHTTPClient(ctx context.Context, endpoint *url.URL) (*http.Client, error) {
	host := endpoint.Hostname()
	port := endpoint.Port()
	if port == "" {
		port = "443"
	}
	var ips []net.IP
	if parsed := net.ParseIP(host); parsed != nil {
		ips = []net.IP{parsed}
	} else {
		resolveCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		rows, err := net.DefaultResolver.LookupIPAddr(resolveCtx, host)
		if err != nil || len(rows) == 0 {
			return nil, fmt.Errorf("resolve push endpoint: %w", err)
		}
		for _, row := range rows {
			ips = append(ips, row.IP)
		}
	}
	for _, ip := range ips {
		if forbiddenPushIP(ip) {
			return nil, errors.New("push endpoint resolved to a private/local address")
		}
	}
	approved := append([]net.IP(nil), ips...)
	dialer := &net.Dialer{Timeout: 8 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          20,
		IdleConnTimeout:       30 * time.Second,
		TLSHandshakeTimeout:   8 * time.Second,
		ResponseHeaderTimeout: 12 * time.Second,
	}
	transport.DialContext = func(dctx context.Context, network, _ string) (net.Conn, error) {
		var last error
		for _, ip := range approved {
			conn, err := dialer.DialContext(dctx, network, net.JoinHostPort(ip.String(), port))
			if err == nil {
				return conn, nil
			}
			last = err
		}
		return nil, last
	}
	return &http.Client{Transport: transport, Timeout: 20 * time.Second}, nil
}

func (s *Server) sendWebPush(ctx context.Context, sub webPushSubscription, payload []byte) (int, error) {
	u, err := validatePushEndpoint(sub.Endpoint)
	if err != nil {
		return 0, err
	}
	if strings.TrimSpace(s.cfg.VAPIDPrivateKey) == "" {
		return 0, errors.New("VAPID_PRIVATE_KEY is not configured")
	}
	recipientPublic, err := decodeRawURLBase64(sub.P256DH)
	if err != nil {
		return 0, fmt.Errorf("decode p256dh: %w", err)
	}
	authSecret, err := decodeRawURLBase64(sub.Auth)
	if err != nil {
		return 0, fmt.Errorf("decode auth: %w", err)
	}
	body, err := encryptWebPush(payload, recipientPublic, authSecret)
	if err != nil {
		return 0, err
	}
	authorization, _, err := makeVAPIDAuthorization(sub.Endpoint, s.cfg.VAPIDSubject, s.cfg.VAPIDPrivateKey, s.cfg.VAPIDPublicKey, time.Now())
	if err != nil {
		return 0, err
	}
	client, err := pushHTTPClient(ctx, u)
	if err != nil {
		return 0, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, sub.Endpoint, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("Content-Encoding", "aes128gcm")
	req.Header.Set("Authorization", authorization)
	ttl := int(s.cfg.PushTTL.Seconds())
	if ttl < 1 {
		ttl = 300
	}
	req.Header.Set("TTL", fmt.Sprint(ttl))
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return resp.StatusCode, nil
	}
	return resp.StatusCode, fmt.Errorf("push service returned HTTP %d", resp.StatusCode)
}
