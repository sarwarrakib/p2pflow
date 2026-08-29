package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/mail"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"p2pflow/v2/internal/binance"
	"p2pflow/v2/internal/config"
	dbx "p2pflow/v2/internal/db"
	"p2pflow/v2/internal/events"
	"p2pflow/v2/internal/service"
)

type Server struct {
	cfg       config.Config
	store     *dbx.Store
	svc       *service.Service
	mux       *http.ServeMux
	startedAt time.Time
	usageMu   sync.Mutex
	usage     map[string]int64
	chatMu    sync.RWMutex
	chatConns map[int64]*binance.WSConn
}
type ctxUser struct {
	ID           int64    `json:"id"`
	TenantID     int64    `json:"tenantId"`
	Email        string   `json:"email"`
	Username     string   `json:"username"`
	Name         string   `json:"name"`
	Role         string   `json:"role"`
	IsOwner      bool     `json:"isOwner"`
	IsSuperAdmin bool     `json:"isSuperAdmin"`
	Permissions  []string `json:"permissions,omitempty"`
}
type envelope map[string]any

func New(c config.Config, store *dbx.Store) *Server {
	s := &Server{cfg: c, store: store, svc: service.New(c, store), mux: http.NewServeMux(), startedAt: time.Now().UTC(), usage: map[string]int64{}, chatConns: map[int64]*binance.WSConn{}}
	s.routes()
	return s
}
func (s *Server) Service() *service.Service             { return s.svc }
func (s *Server) RunRealtimeBridge(ctx context.Context) { s.svc.RunNATSBridge(ctx) }
func (s *Server) EnsureSuperAdmin(ctx context.Context) error {
	email := strings.ToLower(strings.TrimSpace(s.cfg.SuperAdminEmail))
	if email == "" {
		return nil
	}
	_, err := s.store.DB.ExecContext(ctx, `UPDATE users SET is_super_admin=TRUE,updated_at=CURRENT_TIMESTAMP WHERE LOWER(email)=`+s.store.Bind(1), email)
	return err
}
func (s *Server) Handler() http.Handler { return s.requestLog(s.securityHeaders(s.setupGate(s.mux))) }

func (s *Server) routes() {
	s.registerCoreRoutes()
	s.registerAuthRoutes()
	s.registerUserRoutes()
	s.registerCredentialRoutes()
	s.registerOrderRoutes()
	s.registerAdsRoutes()
	s.registerChatRoutes()
	s.registerPaymentRoutes()
	s.registerAccountingRoutes()
	s.registerNotificationRoutes()
	s.registerSecurityRoutes()
	s.registerExtensionRoutes()
	s.registerBillingRoutes()
	s.registerSystemRoutes()
	s.mux.HandleFunc("/", s.staticFallback)
}
func (s *Server) registerCoreRoutes() {
	s.mux.HandleFunc("GET /api/health", s.health)
	s.mux.HandleFunc("GET /api/healthz", s.health)
	s.mux.HandleFunc("GET /healthz", s.health)
	s.mux.HandleFunc("GET /ready", s.ready)
	s.mux.HandleFunc("GET /api/ready", s.ready)
	s.mux.HandleFunc("GET /api/version", s.version)
	s.mux.HandleFunc("GET /api/events", s.requireUser(s.events))
	s.mux.HandleFunc("GET /api/bootstrap", s.requireUser(s.bootstrap))
	s.mux.HandleFunc("GET /api/dashboard", s.requireUser(s.dashboard))
	s.mux.HandleFunc("GET /api/navigation-counts", s.requireUser(s.navigationCounts))
	s.mux.HandleFunc("GET /api/me", s.requireUser(s.me))
}
func (s *Server) staticFallback(w http.ResponseWriter, r *http.Request) {
	p := filepath.Clean(r.URL.Path)
	if p == "/" {
		p = "/index.html"
	}
	full := filepath.Join(s.cfg.PublicDir, filepath.FromSlash(strings.TrimPrefix(p, "/")))
	rootAbs, _ := filepath.Abs(s.cfg.PublicDir)
	fullAbs, _ := filepath.Abs(full)
	rel, relErr := filepath.Rel(rootAbs, fullAbs)
	if relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		http.NotFound(w, r)
		return
	}
	if st, err := os.Stat(fullAbs); err == nil && !st.IsDir() {
		http.ServeFile(w, r, fullAbs)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	http.ServeFile(w, r, filepath.Join(s.cfg.PublicDir, "index.html"))
}
func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	// /api/health doubles as the authenticated legacy diagnostics page. Public
	// liveness endpoints stay intentionally small and never disclose tenant data.
	if r.URL.Path == "/api/health" {
		if u, err := s.userFromSession(r); err == nil {
			writeJSON(w, 200, s.healthPayload(r.Context(), u))
			return
		}
	}
	writeJSON(w, 200, envelope{"ok": true, "version": s.cfg.Version, "service": "p2pflow", "architecture": "multi-tenant-relational", "workers": s.cfg.WorkerEnabled})
}
func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.store.DB.PingContext(ctx); err != nil {
		// Do not expose database hostnames/driver errors from a public readiness probe.
		writeJSON(w, 503, envelope{"ok": false, "database": "unavailable"})
		return
	}
	if s.cfg.SetupRequired {
		writeJSON(w, 503, envelope{"ok": false, "database": s.cfg.DBDriver, "version": s.cfg.Version, "setupRequired": true, "status": "setup_required"})
		return
	}
	writeJSON(w, 200, envelope{"ok": true, "database": s.cfg.DBDriver, "version": s.cfg.Version, "setupRequired": false})
}
func (s *Server) version(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, envelope{"version": s.cfg.Version, "api": "v2"})
}
func (s *Server) me(w http.ResponseWriter, r *http.Request, u ctxUser) {
	writeJSON(w, 200, s.userSafe(r.Context(), u))
}
func (s *Server) events(w http.ResponseWriter, r *http.Request, u ctxUser) {
	// The main HTTP server has a finite write timeout for normal API requests.
	// Disable that deadline for this long-lived SSE response so realtime streams
	// do not get recycled every few seconds under production traffic.
	_ = http.NewResponseController(w).SetWriteDeadline(time.Time{})
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, 500, envelope{"error": "streaming_not_supported"})
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(200)
	sub := s.svc.Hub.Subscribe(u.TenantID, u.ID)
	defer s.svc.Hub.Unsubscribe(sub)
	fmt.Fprintf(w, "data: %s\n\n", service.JSONString(events.Event{TenantID: u.TenantID, UserID: u.ID, Type: "connected", At: time.Now().UTC()}))
	flusher.Flush()
	heartbeat := time.NewTicker(25 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case b, ok := <-sub.C:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", b)
			flusher.Flush()
		case <-heartbeat.C:
			fmt.Fprintf(w, ": heartbeat %d\n\n", time.Now().UnixMilli())
			flusher.Flush()
		}
	}
}

func (s *Server) requireUser(next func(http.ResponseWriter, *http.Request, ctxUser)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, err := s.userFromSession(r)
		if err != nil {
			writeJSON(w, 401, envelope{"error": "unauthorized"})
			return
		}
		if mutating(r.Method) && !s.csrfValid(r) {
			writeJSON(w, 403, envelope{"error": "csrf_invalid"})
			return
		}
		next(w, r, u)
	}
}
func (s *Server) requirePerm(code string, next func(http.ResponseWriter, *http.Request, ctxUser)) http.HandlerFunc {
	return s.requireUser(func(w http.ResponseWriter, r *http.Request, u ctxUser) {
		if !s.hasPerm(u, code) {
			writeJSON(w, 403, envelope{"error": "forbidden", "permission": code})
			return
		}
		if !s.tenantOperationalAllowed(w, r, u, code) {
			return
		}
		next(w, r, u)
	})
}
func (s *Server) hasPerm(u ctxUser, code string) bool {
	if u.IsSuperAdmin || u.IsOwner {
		return true
	}
	for _, p := range u.Permissions {
		if p == code || p == "*" {
			return true
		}
	}
	return false
}
func (s *Server) userFromSession(r *http.Request) (ctxUser, error) {
	c, err := r.Cookie("p2pflow_session")
	if err != nil {
		return ctxUser{}, err
	}
	q := `SELECT u.id,u.tenant_id,u.email,u.username,u.name,u.role_code,u.is_owner,u.is_super_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=` + s.store.Bind(1) + ` AND s.expires_at>CURRENT_TIMESTAMP AND u.status='active'`
	var u ctxUser
	err = s.store.DB.QueryRowContext(r.Context(), q, hashToken(c.Value)).Scan(&u.ID, &u.TenantID, &u.Email, &u.Username, &u.Name, &u.Role, &u.IsOwner, &u.IsSuperAdmin)
	if err != nil {
		return u, err
	}
	u.Permissions = s.permissionCodes(r.Context(), u)
	// Presence is maintained by the dedicated /api/activity/heartbeat endpoint.
	// Writing last_seen_at on every authenticated API request causes avoidable
	// database write amplification under high user/API concurrency.
	return u, nil
}
func (s *Server) permissionCodes(ctx context.Context, u ctxUser) []string {
	if u.IsOwner || u.IsSuperAdmin {
		return []string{"*"}
	}
	var overridden bool
	_ = s.store.DB.QueryRowContext(ctx, `SELECT permissions_overridden FROM users WHERE id=`+s.store.Bind(1), u.ID).Scan(&overridden)
	q := ``
	if overridden {
		q = `SELECT DISTINCT p.code FROM user_permissions up JOIN permissions p ON p.id=up.permission_id WHERE up.user_id=` + s.store.Bind(1) + ` ORDER BY p.code`
	} else {
		q = `SELECT DISTINCT p.code FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=` + s.store.Bind(1) + ` ORDER BY p.code`
	}
	rows, err := s.store.DB.QueryContext(ctx, q, u.ID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var x string
		if rows.Scan(&x) == nil {
			out = append(out, x)
		}
	}
	return out
}
func (s *Server) accountPerm(ctx context.Context, u ctxUser, accountID int64, code string) bool {
	if u.IsOwner || u.IsSuperAdmin {
		return true
	}
	if accountID <= 0 || !isAccountScopedPermission(code) || !s.hasPerm(u, code) {
		return false
	}
	// 2.x uses deny-by-default resource scope: a global permission is necessary but
	// never sufficient for a Binance account. The exact tenant/account grant must exist.
	var n int
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM exchange_account_permissions eap JOIN exchange_accounts ea ON ea.id=eap.exchange_account_id WHERE eap.tenant_id=`+s.store.Bind(1)+` AND eap.user_id=`+s.store.Bind(2)+` AND eap.exchange_account_id=`+s.store.Bind(3)+` AND eap.permission_code=`+s.store.Bind(4)+` AND ea.tenant_id=eap.tenant_id`, u.TenantID, u.ID, accountID, code).Scan(&n)
	return n > 0
}
func (s *Server) csrfToken(r *http.Request) string {
	c, err := r.Cookie("p2pflow_session")
	if err != nil {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(s.cfg.AppSecret))
	mac.Write([]byte("csrf:" + c.Value))
	return hex.EncodeToString(mac.Sum(nil))
}
func (s *Server) csrfValid(r *http.Request) bool {
	expected := s.csrfToken(r)
	got := strings.TrimSpace(r.Header.Get("X-CSRF-Token"))
	return expected != "" && hmac.Equal([]byte(expected), []byte(got))
}
func mutating(m string) bool { return m == "POST" || m == "PUT" || m == "PATCH" || m == "DELETE" }
func (s *Server) createSession(r *http.Request, userID, tenantID int64) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(b)
	q := `INSERT INTO sessions(user_id,tenant_id,token_hash,expires_at,created_at) VALUES(` + s.store.Bind(1) + `,` + s.store.Bind(2) + `,` + s.store.Bind(3) + `,` + s.store.Bind(4) + `,CURRENT_TIMESTAMP)`
	_, err := s.store.DB.ExecContext(r.Context(), q, userID, tenantID, hashToken(token), time.Now().Add(s.cfg.SessionTTL))
	return token, err
}
func (s *Server) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{Name: "p2pflow_session", Value: token, Path: "/", HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode, Expires: time.Now().Add(s.cfg.SessionTTL), Domain: s.cfg.CookieDomain})
}
func hashToken(v string) string { sum := sha256.Sum256([]byte(v)); return fmt.Sprintf("%x", sum[:]) }
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	dec := json.NewDecoder(r.Body)
	dec.UseNumber()
	if err := dec.Decode(v); err != nil {
		writeJSON(w, 400, envelope{"error": "invalid_json", "detail": err.Error()})
		return false
	}
	return true
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func parseID(v string) int64 { x, _ := strconv.ParseInt(strings.TrimSpace(v), 10, 64); return x }
func safeErr(err error) string {
	if errors.Is(err, sql.ErrNoRows) {
		return "not_found"
	}
	return "constraint_or_database_error"
}
func validEmailAddress(v string) bool {
	v = strings.TrimSpace(v)
	if v == "" || len(v) > 254 {
		return false
	}
	a, err := mail.ParseAddress(v)
	return err == nil && strings.EqualFold(a.Address, v)
}

func slug(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	var b strings.Builder
	dash := false
	for _, r := range v {
		ok := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if ok {
			b.WriteRune(r)
			dash = false
		} else if !dash {
			b.WriteByte('-')
			dash = true
		}
	}
	x := strings.Trim(b.String(), "-")
	if x == "" {
		x = "workspace"
	}
	rnd := make([]byte, 3)
	_, _ = rand.Read(rnd)
	return fmt.Sprintf("%s-%x", x, rnd)
}
func requestString(r *http.Request, key string) string {
	return strings.TrimSpace(r.URL.Query().Get(key))
}
func boolParam(v string) bool { b, _ := strconv.ParseBool(v); return b }
func asString(v any) string {
	if v == nil {
		return ""
	}
	return fmt.Sprint(v)
}
func asFloat(v any) float64 {
	switch x := v.(type) {
	case json.Number:
		f, _ := x.Float64()
		return f
	case float64:
		return x
	case int:
		return float64(x)
	case int64:
		return float64(x)
	case string:
		f, _ := strconv.ParseFloat(x, 64)
		return f
	}
	f, _ := strconv.ParseFloat(fmt.Sprint(v), 64)
	return f
}
func asInt64(v any) int64 {
	switch x := v.(type) {
	case json.Number:
		n, _ := x.Int64()
		return n
	case float64:
		return int64(x)
	case int64:
		return x
	case int:
		return int64(x)
	case string:
		n, _ := strconv.ParseInt(x, 10, 64)
		return n
	}
	n, _ := strconv.ParseInt(fmt.Sprint(v), 10, 64)
	return n
}
func jsonMap(raw string) map[string]any {
	var m map[string]any
	if json.Unmarshal([]byte(raw), &m) != nil || m == nil {
		return map[string]any{}
	}
	return m
}
func (s *Server) requestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if d := time.Since(start); d > 1500*time.Millisecond {
			log.Printf("slow-request method=%s path=%s duration=%s", r.Method, r.URL.Path, d)
		}
	})
}
func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		if s.cfg.CookieSecure {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}
func withTimeout(r *http.Request, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), d)
}
