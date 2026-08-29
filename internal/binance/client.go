package binance

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Endpoint struct{ Method, Path string }

var Endpoints = map[string]Endpoint{
	"listOrders":                {"POST", "/sapi/v1/c2c/orderMatch/listOrders"},
	"listAds":                   {"POST", "/sapi/v1/c2c/ads/listWithPagination"},
	"searchAds":                 {"POST", "/sapi/v1/c2c/ads/search"},
	"getAdReferencePrice":       {"POST", "/sapi/v1/c2c/ads/getReferencePrice"},
	"getAvailableAdsCategory":   {"GET", "/sapi/v1/c2c/ads/getAvailableAdsCategory"},
	"listDigitalCurrencies":     {"POST", "/sapi/v1/c2c/digitalCurrency/list"},
	"listFiatCurrencies":        {"POST", "/sapi/v1/c2c/fiatCurrency/list"},
	"getCommissionOverview":     {"POST", "/sapi/v1/c2c/commission-rate/overview"},
	"getTakerCommissionRate":    {"POST", "/sapi/v1/c2c/commission-rate/taker"},
	"getAdDetail":               {"POST", "/sapi/v1/c2c/ads/getDetailByNo"},
	"postAd":                    {"POST", "/sapi/v1/c2c/ads/post"},
	"updateAd":                  {"POST", "/sapi/v1/c2c/ads/update"},
	"updateAdsStatus":           {"POST", "/sapi/v1/c2c/ads/updateStatus"},
	"getMerchantAdDetails":      {"GET", "/sapi/v1/c2c/merchant/getAdDetails"},
	"setMerchantOnline":         {"POST", "/sapi/v1/c2c/merchant/getOnline"},
	"setMerchantOffline":        {"POST", "/sapi/v1/c2c/merchant/getOffline"},
	"startMerchantBusiness":     {"POST", "/sapi/v1/c2c/merchant/startBusiness"},
	"closeMerchantBusiness":     {"POST", "/sapi/v1/c2c/merchant/closeBusiness"},
	"startMerchantRest":         {"POST", "/sapi/v1/c2c/merchant/startRest"},
	"endMerchantRest":           {"POST", "/sapi/v1/c2c/merchant/endRest"},
	"cancelOrder":               {"POST", "/sapi/v1/c2c/orderMatch/cancelOrder"},
	"checkIfAllowedCancelOrder": {"POST", "/sapi/v1/c2c/orderMatch/checkIfAllowedCancelOrder"},
	"getUserOrderDetail":        {"POST", "/sapi/v1/c2c/orderMatch/getUserOrderDetail"},
	"getOrderSummary":           {"GET", "/sapi/v1/c2c/orderMatch/getUserOrderSummary"},
	"listUserOrderHistory":      {"GET", "/sapi/v1/c2c/orderMatch/listUserOrderHistory"},
	"markOrderAsPaid":           {"POST", "/sapi/v1/c2c/orderMatch/markOrderAsPaid"},
	"verifiedAdditionalKyc":     {"POST", "/sapi/v1/c2c/orderMatch/verifiedAdditionalKyc"},
	"checkIfCanReleaseCoin":     {"POST", "/sapi/v1/c2c/orderMatch/checkIfCanReleaseCoin"},
	// Compatibility endpoint retained for the FUND_PWD flow migrated from the
	// production 1.7.x integration. It is only called when FUND_PWD is selected.
	"getC2cRsaPublicKey":              {"GET", "/sapi/v1/c2c/cryptography/rsa-public-key"},
	"releaseCoin":                     {"POST", "/sapi/v1/c2c/orderMatch/releaseCoin"},
	"queryCounterPartyOrderStatistic": {"POST", "/sapi/v1/c2c/orderMatch/queryCounterPartyOrderStatistic"},
	"getUserBaseDetail":               {"POST", "/sapi/v1/c2c/user/baseDetail"},
	"getPaymentMethodById":            {"GET", "/sapi/v1/c2c/paymentMethod/getPayMethodById"},
	"getPaymentMethodByUserId":        {"GET", "/sapi/v1/c2c/paymentMethod/getPayMethodByUserId"},
	"listAllPaymentMethods":           {"POST", "/sapi/v1/c2c/paymentMethod/listAll"},
	"retrieveChatCredential":          {"GET", "/sapi/v1/c2c/chat/retrieveChatCredential"},
	"retrieveChatMessages":            {"GET", "/sapi/v1/c2c/chat/retrieveChatMessagesWithPagination"},
	"markOrderMessagesAsRead":         {"POST", "/sapi/v1/c2c/chat/markOrderMessagesAsRead"},
	"markUserMessagesAsRead":          {"POST", "/sapi/v1/c2c/chat/markUserMessagesAsRead"},
	"getChatImagePreSignedUrl":        {"POST", "/sapi/v1/c2c/chat/image/pre-signed-url"},
	"getRiskWarningTips":              {"POST", "/sapi/v1/c2c/chat/getRiskWarningTips"},
	"getApiKeyPermission":             {"GET", "/sapi/v1/account/apiRestrictions"},
}

type Credential struct {
	ID         int64
	APIKey     string
	SecretKey  string
	ClientType string
}

type Error struct {
	Status  int
	Code    string
	Message string
	Body    any
}

func (e *Error) Error() string {
	return fmt.Sprintf("Binance SAPI %d %s: %s", e.Status, e.Code, e.Message)
}

type keyGate struct {
	ch           chan struct{}
	blockedUntil time.Time
}

type Scheduler struct {
	global     chan struct{}
	background chan struct{}
	perKeyCap  int
	mu         sync.Mutex
	keys       map[string]*keyGate
}

func NewScheduler(global, perKey, interactiveReserve int) *Scheduler {
	if global < 2 {
		global = 2
	}
	if perKey < 1 {
		perKey = 1
	}
	if interactiveReserve < 1 {
		interactiveReserve = 1
	}
	bg := global - interactiveReserve
	if bg < 1 {
		bg = 1
	}
	return &Scheduler{global: make(chan struct{}, global), background: make(chan struct{}, bg), perKeyCap: perKey, keys: map[string]*keyGate{}}
}

func keyHash(apiKey string) string {
	s := sha256.Sum256([]byte(apiKey))
	return hex.EncodeToString(s[:10])
}
func (s *Scheduler) gate(apiKey string) *keyGate {
	k := keyHash(apiKey)
	s.mu.Lock()
	defer s.mu.Unlock()
	g := s.keys[k]
	if g == nil {
		g = &keyGate{ch: make(chan struct{}, s.perKeyCap)}
		s.keys[k] = g
	}
	return g
}
func take(ctx context.Context, ch chan struct{}) error {
	select {
	case ch <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
func release(ch chan struct{}) { <-ch }
func (s *Scheduler) acquire(ctx context.Context, apiKey string, background bool) (func(), error) {
	g := s.gate(apiKey)
	for {
		s.mu.Lock()
		blocked := g.blockedUntil
		s.mu.Unlock()
		if d := time.Until(blocked); d > 0 {
			timer := time.NewTimer(d)
			select {
			case <-timer.C:
			case <-ctx.Done():
				timer.Stop()
				return nil, ctx.Err()
			}
		}
		if background {
			if err := take(ctx, s.background); err != nil {
				return nil, err
			}
		}
		if err := take(ctx, s.global); err != nil {
			if background {
				release(s.background)
			}
			return nil, err
		}
		if err := take(ctx, g.ch); err != nil {
			release(s.global)
			if background {
				release(s.background)
			}
			return nil, err
		}

		// The request may have spent time queued behind another request that just
		// received a 418/429. Re-check the per-key block after obtaining capacity;
		// if it changed, release scarce global slots before waiting/retrying.
		s.mu.Lock()
		blocked = g.blockedUntil
		s.mu.Unlock()
		if time.Now().Before(blocked) {
			release(g.ch)
			release(s.global)
			if background {
				release(s.background)
			}
			continue
		}
		return func() {
			release(g.ch)
			release(s.global)
			if background {
				release(s.background)
			}
		}, nil
	}
}

func (s *Scheduler) backoff(apiKey string, status int, retryAfter string) {
	if status != 418 && status != 429 {
		return
	}
	d := 2500 * time.Millisecond
	if status == 418 {
		d = 30 * time.Second
	}
	if n, err := strconv.ParseFloat(strings.TrimSpace(retryAfter), 64); err == nil && n > 0 {
		d = time.Duration(n * float64(time.Second))
		if d > 2*time.Minute {
			d = 2 * time.Minute
		}
	}
	g := s.gate(apiKey)
	s.mu.Lock()
	until := time.Now().Add(d)
	if until.After(g.blockedUntil) {
		g.blockedUntil = until
	}
	s.mu.Unlock()
}

type Client struct {
	BaseURL    string
	HTTP       *http.Client
	Scheduler  *Scheduler
	RecvWindow int64
}

func New(baseURL string, global, perKey, reserve int) *Client {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.binance.com"
	}
	return &Client{BaseURL: strings.TrimRight(baseURL, "/"), HTTP: &http.Client{Timeout: 20 * time.Second}, Scheduler: NewScheduler(global, perKey, reserve), RecvWindow: 5000}
}

func sign(values url.Values, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(values.Encode()))
	return hex.EncodeToString(mac.Sum(nil))
}

func (c *Client) Call(ctx context.Context, cred Credential, name string, query map[string]any, body any, background bool) (map[string]any, error) {
	ep, ok := Endpoints[name]
	if !ok {
		return nil, fmt.Errorf("unknown Binance endpoint %q", name)
	}
	var bodyBytes []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyBytes = b
	}

	// Acquire scheduler capacity before stamping/signing the request. A queued or
	// rate-limited request can wait longer than Binance's recvWindow; signing it
	// before that wait would produce a stale timestamp and intermittent -1021
	// failures precisely when the system is under load.
	release, err := c.Scheduler.acquire(ctx, cred.APIKey, background)
	if err != nil {
		return nil, err
	}
	defer release()

	vals := url.Values{}
	vals.Set("recvWindow", strconv.FormatInt(c.RecvWindow, 10))
	vals.Set("timestamp", strconv.FormatInt(time.Now().UnixMilli(), 10))
	for k, v := range query {
		if v == nil {
			continue
		}
		vals.Set(k, fmt.Sprint(v))
	}
	vals.Set("signature", sign(vals, cred.SecretKey))
	u := c.BaseURL + ep.Path + "?" + vals.Encode()
	var reader io.Reader
	if len(bodyBytes) > 0 {
		reader = strings.NewReader(string(bodyBytes))
	}
	req, err := http.NewRequestWithContext(ctx, ep.Method, u, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-MBX-APIKEY", cred.APIKey)
	req.Header.Set("clientType", firstNonEmpty(cred.ClientType, "web"))
	req.Header.Set("Content-Type", "application/json;charset=utf-8")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	b, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	var out map[string]any
	if len(b) > 0 {
		_ = json.Unmarshal(b, &out)
	}
	if out == nil {
		out = map[string]any{}
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 || successFalse(out) {
		c.Scheduler.backoff(cred.APIKey, res.StatusCode, res.Header.Get("Retry-After"))
		return out, &Error{Status: res.StatusCode, Code: stringValue(out, "code"), Message: firstNonEmpty(stringValue(out, "message"), firstNonEmpty(stringValue(out, "msg"), strings.TrimSpace(string(b)))), Body: out}
	}
	return out, nil
}

func stringValue(v map[string]any, key string) string {
	if x, ok := v[key]; ok && x != nil {
		return strings.TrimSpace(fmt.Sprint(x))
	}
	return ""
}

func successFalse(v map[string]any) bool {
	if x, ok := v["success"].(bool); ok && !x {
		return true
	}
	if x, ok := v["code"]; ok && x != nil {
		code := strings.TrimSpace(fmt.Sprint(x))
		return code != "" && code != "0" && code != "000000"
	}
	return false
}

func Data(v map[string]any) any {
	if d, ok := v["data"]; ok {
		return d
	}
	return v
}
func Success(v map[string]any) bool {
	if x, ok := v["success"].(bool); ok {
		return x
	}
	code := fmt.Sprint(v["code"])
	return code == "" || code == "0" || code == "000000"
}
func firstNonEmpty(v, d string) string {
	if strings.TrimSpace(v) != "" {
		return v
	}
	return d
}
func IsRateLimit(err error) bool {
	var e *Error
	return errors.As(err, &e) && (e.Status == 418 || e.Status == 429)
}
