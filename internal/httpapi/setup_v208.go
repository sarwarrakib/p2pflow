package httpapi

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"p2pflow/v2/internal/config"
	dbx "p2pflow/v2/internal/db"
	"p2pflow/v2/internal/migrate"
	sec "p2pflow/v2/internal/security"
)

type setupV208Input struct {
	SetupCode        string `json:"setupCode"`
	DatabaseMode     string `json:"databaseMode"`
	DatabaseProvider string `json:"databaseProvider"`
	DatabaseURL      string `json:"databaseUrl"`
	DatabaseHost     string `json:"databaseHost"`
	DatabasePort     string `json:"databasePort"`
	DatabaseName     string `json:"databaseName"`
	DatabaseUser     string `json:"databaseUser"`
	DatabasePassword string `json:"databasePassword"`
	DatabaseSSL      string `json:"databaseSsl"`
	WorkspaceName    string `json:"workspaceName"`
	OwnerUsername    string `json:"ownerUsername"`
	OwnerName        string `json:"ownerName"`
	OwnerEmail       string `json:"ownerEmail"`
	OwnerPassword    string `json:"ownerPassword"`
	OwnerSecretCode  string `json:"ownerSecretCode"`
	MailDriver       string `json:"mailDriver"`
	MailFrom         string `json:"mailFrom"`
	SMTPHost         string `json:"smtpHost"`
	SMTPPort         string `json:"smtpPort"`
	SMTPUser         string `json:"smtpUser"`
	SMTPPass         string `json:"smtpPass"`
	PublicBaseURL    string `json:"publicBaseUrl"`
}

func (s *Server) setupGate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.cfg.SetupRequired {
			next.ServeHTTP(w, r)
			return
		}
		path := r.URL.Path
		if path == "/setup" || path == "/setup/" {
			http.Redirect(w, r, "/setup.html", http.StatusTemporaryRedirect)
			return
		}
		allowed := path == "/setup.html" || path == "/setup.css" || path == "/setup.js" ||
			path == "/healthz" || path == "/api/healthz" || path == "/ready" || path == "/api/ready" ||
			strings.HasPrefix(path, "/setup/api/")
		if allowed {
			next.ServeHTTP(w, r)
			return
		}
		if strings.HasPrefix(path, "/api/") {
			writeJSON(w, http.StatusServiceUnavailable, envelope{"error": "setup_required", "setupRequired": true})
			return
		}
		if r.Method == http.MethodGet || r.Method == http.MethodHead {
			http.Redirect(w, r, "/setup.html", http.StatusTemporaryRedirect)
			return
		}
		writeJSON(w, http.StatusServiceUnavailable, envelope{"error": "setup_required", "setupRequired": true})
	})
}

func (s *Server) setupCodeOK(got string) bool {
	if !s.cfg.SetupRequired || strings.TrimSpace(got) == "" {
		return false
	}
	b, err := os.ReadFile(s.cfg.SetupCodeFile)
	if err != nil {
		return false
	}
	wantHash := sha256.Sum256([]byte(strings.TrimSpace(string(b))))
	gotHash := sha256.Sum256([]byte(strings.TrimSpace(got)))
	return subtle.ConstantTimeCompare(wantHash[:], gotHash[:]) == 1
}

func (s *Server) setupStatus(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.SetupRequired {
		writeJSON(w, http.StatusGone, envelope{"error": "setup_locked", "setupRequired": false})
		return
	}
	writeJSON(w, 200, map[string]any{
		"configured":     false,
		"setupRequired":  true,
		"version":        s.cfg.Version,
		"setupCodeFile":  filepath.Base(s.cfg.SetupCodeFile),
		"localDatabase":  map[string]any{"provider": s.cfg.DBDriver, "prepared": true},
		"defaults":       map[string]any{"databaseMode": "local", "databaseProvider": s.cfg.DBDriver, "workspaceName": "P2PFlow Main Workspace", "ownerUsername": "owner", "ownerName": "Owner", "mailDriver": "skip", "publicBaseUrl": s.cfg.PublicBaseURL},
		"browserSetupV2": true,
	})
}

func (s *Server) setupDatabaseTest(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.SetupRequired {
		writeJSON(w, http.StatusGone, envelope{"error": "setup_locked"})
		return
	}
	var in setupV208Input
	if !decode(w, r, &in) {
		return
	}
	if !s.setupCodeOK(in.SetupCode) {
		writeJSON(w, http.StatusForbidden, envelope{"error": "setup_code_invalid"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	store, cfg, closeStore, err := s.setupTargetStore(ctx, in)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, envelope{"error": "database_connection_failed", "message": err.Error()})
		return
	}
	if closeStore {
		defer store.DB.Close()
	}
	var users int64
	_ = store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&users)
	writeJSON(w, 200, map[string]any{
		"ok": true,
		"database": map[string]any{
			"provider":      cfg.DBDriver,
			"mode":          setupDatabaseMode(in.DatabaseMode),
			"existingUsers": users,
			"empty":         users == 0,
		},
	})
}

func (s *Server) setupSave(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.SetupRequired {
		writeJSON(w, http.StatusGone, envelope{"error": "setup_locked"})
		return
	}
	var in setupV208Input
	if !decode(w, r, &in) {
		return
	}
	if !s.setupCodeOK(in.SetupCode) {
		writeJSON(w, http.StatusForbidden, envelope{"error": "setup_code_invalid"})
		return
	}
	if err := validateSetupV208(in); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, envelope{"error": "setup_validation_failed", "message": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	store, targetCfg, closeStore, err := s.setupTargetStore(ctx, in)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, envelope{"error": "database_connection_failed", "message": err.Error()})
		return
	}
	if closeStore {
		defer store.DB.Close()
	}
	if err := migrate.Apply(ctx, store.DB, targetCfg.DBDriver, s.cfg.MigrationDir); err != nil {
		writeJSON(w, http.StatusInternalServerError, envelope{"error": "migration_failed", "message": safeErr(err)})
		return
	}
	var users int64
	if err := store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&users); err != nil {
		writeJSON(w, http.StatusInternalServerError, envelope{"error": "database_check_failed", "message": safeErr(err)})
		return
	}
	targetCfg.SuperAdminEmail = strings.ToLower(strings.TrimSpace(in.OwnerEmail))
	targetCfg.PublicBaseURL = strings.TrimRight(strings.TrimSpace(in.PublicBaseURL), "/")
	targetCfg.CookieSecure = true
	targetCfg.SetupRequired = false
	targetCfg.AutoMigrate = false
	targetCfg.WorkerEnabled = false
	var ownerID, tenantID int64
	if users == 0 {
		ownerID, tenantID, err = createSetupOwner(ctx, targetCfg, store, in)
		if err != nil {
			writeJSON(w, http.StatusConflict, envelope{"error": "owner_create_failed", "message": safeErr(err)})
			return
		}
	} else {
		ownerID, tenantID, err = existingSetupOwner(ctx, store, in, users)
		if err != nil {
			writeJSON(w, http.StatusConflict, envelope{"error": "database_not_empty", "message": "Browser first-install requires an empty database, except for an exact retry of the Owner created by this same setup."})
			return
		}
	}

	updates := map[string]string{
		"P2PFLOW_VERSION":          "2.0.8",
		"P2PFLOW_ENV":              "production",
		"P2PFLOW_SETUP_REQUIRED":   "false",
		"P2PFLOW_SUPERADMIN_EMAIL": targetCfg.SuperAdminEmail,
		"P2PFLOW_PUBLIC_BASE_URL":  targetCfg.PublicBaseURL,
		"DB_DRIVER":                targetCfg.DBDriver,
		"DB_URL":                   targetCfg.DBURL,
		"COOKIE_SECURE":            "true",
		"P2PFLOW_AUTO_MIGRATE":     "false",
		"P2PFLOW_WORKERS":          "false",
	}
	if strings.EqualFold(strings.TrimSpace(in.MailDriver), "smtp") {
		updates["SMTP_HOST"] = strings.TrimSpace(in.SMTPHost)
		updates["SMTP_PORT"] = firstNonEmpty(strings.TrimSpace(in.SMTPPort), "587")
		updates["SMTP_USER"] = strings.TrimSpace(in.SMTPUser)
		updates["SMTP_PASSWORD"] = in.SMTPPass
		updates["SMTP_FROM"] = strings.TrimSpace(in.MailFrom)
		updates["SMTP_FROM_NAME"] = "P2PFlow"
		updates["VAPID_SUBJECT"] = "mailto:" + targetCfg.SuperAdminEmail
	} else {
		updates["SMTP_HOST"] = ""
		updates["SMTP_USER"] = ""
		updates["SMTP_PASSWORD"] = ""
		updates["SMTP_FROM"] = strings.TrimSpace(in.MailFrom)
	}
	if err := writeSetupEnvAtomic(s.cfg.EnvFile, updates); err != nil {
		writeJSON(w, http.StatusInternalServerError, envelope{"error": "environment_write_failed", "message": err.Error()})
		return
	}
	lockWarning := ""
	if err := os.Remove(s.cfg.SetupCodeFile); err != nil && !os.IsNotExist(err) {
		lockWarning = "runtime setup flag was disabled but the one-time code file could not be deleted: " + err.Error()
	}

	writeJSON(w, 200, map[string]any{
		"ok":            true,
		"setupLocked":   true,
		"restart":       true,
		"loginUrl":      "/login.html",
		"ownerId":       ownerID,
		"tenantId":      tenantID,
		"database":      map[string]any{"provider": targetCfg.DBDriver, "mode": setupDatabaseMode(in.DatabaseMode)},
		"publicBaseUrl": targetCfg.PublicBaseURL,
		"warning":       lockWarning,
	})
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	go func() {
		time.Sleep(1200 * time.Millisecond)
		os.Exit(0)
	}()
}

func setupDatabaseMode(v string) string {
	if strings.EqualFold(strings.TrimSpace(v), "external") {
		return "external"
	}
	return "local"
}

func (s *Server) setupTargetStore(ctx context.Context, in setupV208Input) (*dbx.Store, config.Config, bool, error) {
	cfg := s.cfg
	if setupDatabaseMode(in.DatabaseMode) == "local" {
		return s.store, cfg, false, nil
	}
	provider, dsn, err := setupExternalDSN(in)
	if err != nil {
		return nil, cfg, false, err
	}
	cfg.DBDriver = provider
	cfg.DBURL = dsn
	cfg.DBMaxOpen = 8
	cfg.DBMaxIdle = 2
	store, err := dbx.Open(ctx, cfg)
	if err != nil {
		return nil, cfg, false, err
	}
	return store, cfg, true, nil
}

func setupExternalDSN(in setupV208Input) (string, string, error) {
	provider := strings.ToLower(strings.TrimSpace(in.DatabaseProvider))
	if provider == "" {
		provider = "postgres"
	}
	if provider != "postgres" && provider != "mysql" && provider != "mariadb" {
		return "", "", fmt.Errorf("unsupported database provider")
	}
	raw := strings.TrimSpace(in.DatabaseURL)
	if raw != "" {
		if provider == "postgres" {
			u, err := url.Parse(raw)
			if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || u.Host == "" {
				return "", "", fmt.Errorf("invalid PostgreSQL URL")
			}
			return provider, raw, nil
		}
		if strings.HasPrefix(strings.ToLower(raw), "mysql://") {
			u, err := url.Parse(raw)
			if err != nil || u.Host == "" || u.User == nil {
				return "", "", fmt.Errorf("invalid MySQL URL")
			}
			pass, _ := u.User.Password()
			dbName := strings.TrimPrefix(u.Path, "/")
			if dbName == "" {
				return "", "", fmt.Errorf("database name is required")
			}
			q := u.Query()
			if q.Get("parseTime") == "" {
				q.Set("parseTime", "true")
			}
			return provider, fmt.Sprintf("%s:%s@tcp(%s)/%s?%s", u.User.Username(), pass, u.Host, dbName, q.Encode()), nil
		}
		return provider, raw, nil
	}

	host := strings.TrimSpace(in.DatabaseHost)
	name := strings.TrimSpace(in.DatabaseName)
	userName := strings.TrimSpace(in.DatabaseUser)
	password := in.DatabasePassword
	if host == "" || name == "" || userName == "" || password == "" {
		return "", "", fmt.Errorf("database host, name, user and password are required")
	}
	port := strings.TrimSpace(in.DatabasePort)
	if port == "" {
		if provider == "postgres" {
			port = "5432"
		} else {
			port = "3306"
		}
	}
	if _, err := strconv.Atoi(port); err != nil {
		return "", "", fmt.Errorf("invalid database port")
	}
	hostPort := net.JoinHostPort(host, port)
	if provider == "postgres" {
		u := &url.URL{Scheme: "postgres", User: url.UserPassword(userName, password), Host: hostPort, Path: "/" + name}
		q := u.Query()
		if strings.EqualFold(strings.TrimSpace(in.DatabaseSSL), "true") {
			q.Set("sslmode", "require")
		} else {
			q.Set("sslmode", "disable")
		}
		u.RawQuery = q.Encode()
		return provider, u.String(), nil
	}
	if strings.ContainsAny(userName+password+name, "@()/") {
		return "", "", fmt.Errorf("for MySQL credentials containing @ ( ) /, use the full driver DSN field")
	}
	return provider, fmt.Sprintf("%s:%s@tcp(%s)/%s?parseTime=true&charset=utf8mb4&loc=UTC", userName, password, hostPort, name), nil
}

func validateSetupV208(in setupV208Input) error {
	workspace := strings.TrimSpace(in.WorkspaceName)
	if len(workspace) < 2 || len(workspace) > 160 {
		return fmt.Errorf("workspace name must be 2-160 characters")
	}
	username := normalizePublicUsername(in.OwnerUsername)
	if !validPublicUsername(username) {
		return fmt.Errorf("owner username must be 3-60 characters using letters, numbers, dot, underscore or hyphen")
	}
	if strings.TrimSpace(in.OwnerName) == "" || len(strings.TrimSpace(in.OwnerName)) > 160 {
		return fmt.Errorf("owner name is required")
	}
	if !validEmailAddress(strings.ToLower(strings.TrimSpace(in.OwnerEmail))) {
		return fmt.Errorf("valid owner email is required")
	}
	if len(in.OwnerPassword) < 12 || len(in.OwnerPassword) > 256 {
		return fmt.Errorf("owner password must be 12-256 characters")
	}
	if !validSetupSecret(in.OwnerSecretCode) {
		return fmt.Errorf("use a private non-sequential 6 digit security PIN")
	}
	u, err := url.Parse(strings.TrimRight(strings.TrimSpace(in.PublicBaseURL), "/"))
	if err != nil || u.Scheme != "https" || u.Host == "" || u.Path != "" {
		return fmt.Errorf("public URL must be the HTTPS origin, for example https://app.example.com")
	}
	if strings.EqualFold(strings.TrimSpace(in.MailDriver), "smtp") {
		if strings.TrimSpace(in.SMTPHost) == "" || strings.TrimSpace(in.MailFrom) == "" {
			return fmt.Errorf("SMTP host and From email are required when SMTP is enabled")
		}
	}
	return nil
}

func validSetupSecret(v string) bool {
	v = strings.TrimSpace(v)
	if len(v) != 6 {
		return false
	}
	for _, r := range v {
		if r < '0' || r > '9' {
			return false
		}
	}
	allSame := true
	for i := 1; i < len(v); i++ {
		if v[i] != v[0] {
			allSame = false
			break
		}
	}
	if allSame {
		return false
	}
	for _, bad := range []string{"123456", "654321", "012345", "543210"} {
		if v == bad {
			return false
		}
	}
	return true
}

func createSetupOwner(ctx context.Context, cfg config.Config, store *dbx.Store, in setupV208Input) (int64, int64, error) {
	passwordHash, err := sec.HashPassword(in.OwnerPassword)
	if err != nil {
		return 0, 0, err
	}
	secretHash, err := sec.HashPassword(strings.TrimSpace(in.OwnerSecretCode))
	if err != nil {
		return 0, 0, err
	}
	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()
	workspace := strings.TrimSpace(in.WorkspaceName)
	username := normalizePublicUsername(in.OwnerUsername)
	email := strings.ToLower(strings.TrimSpace(in.OwnerEmail))
	name := strings.TrimSpace(in.OwnerName)
	var tenantID, userID int64
	if store.Driver == "postgres" {
		if err := tx.QueryRowContext(ctx, `INSERT INTO tenants(name,slug,status,created_at,updated_at) VALUES($1,$2,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`, workspace, slug(workspace)).Scan(&tenantID); err != nil {
			return 0, 0, err
		}
		if err := tx.QueryRowContext(ctx, `INSERT INTO users(tenant_id,email,username,name,password_hash,status,role_code,is_owner,is_super_admin,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'active','admin',TRUE,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`, tenantID, email, username, name, passwordHash).Scan(&userID); err != nil {
			return 0, 0, err
		}
	} else {
		res, err := tx.ExecContext(ctx, `INSERT INTO tenants(name,slug,status,created_at,updated_at) VALUES(?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, workspace, slug(workspace))
		if err != nil {
			return 0, 0, err
		}
		tenantID, _ = res.LastInsertId()
		res, err = tx.ExecContext(ctx, `INSERT INTO users(tenant_id,email,username,name,password_hash,status,role_code,is_owner,is_super_admin,created_at,updated_at) VALUES(?,?,?,?,?,'active','admin',TRUE,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, tenantID, email, username, name, passwordHash)
		if err != nil {
			return 0, 0, err
		}
		userID, _ = res.LastInsertId()
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO user_preferences(user_id,tenant_id,order_accepting,ready_to_receive_orders,notifications_json,ui_json,updated_at) VALUES(`+store.Bind(1)+`,`+store.Bind(2)+`,TRUE,TRUE,'{}','{}',CURRENT_TIMESTAMP)`, userID, tenantID); err != nil {
		return 0, 0, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO user_security(user_id,tenant_id,secret_code_hash,fallback_question,fallback_answer_hash,updated_at) VALUES(`+store.Bind(1)+`,`+store.Bind(2)+`,`+store.Bind(3)+`,'','',CURRENT_TIMESTAMP)`, userID, tenantID, secretHash); err != nil {
		return 0, 0, err
	}
	var planID int64
	_ = tx.QueryRowContext(ctx, `SELECT id FROM plans WHERE code='starter' AND status='active' ORDER BY id LIMIT 1`).Scan(&planID)
	if planID > 0 {
		_, _ = tx.ExecContext(ctx, `UPDATE tenants SET plan_id=`+store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+store.Bind(2), planID, tenantID)
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}
	tmp := New(cfg, store)
	if err := tmp.ensureDefaultRoles(ctx, tenantID); err != nil {
		return 0, 0, err
	}
	return userID, tenantID, nil
}

func existingSetupOwner(ctx context.Context, store *dbx.Store, in setupV208Input, users int64) (int64, int64, error) {
	if users != 1 {
		return 0, 0, fmt.Errorf("database contains %d users", users)
	}
	var userID, tenantID int64
	var email, username string
	var isOwner, isSuper bool
	err := store.DB.QueryRowContext(ctx, `SELECT id,tenant_id,email,username,is_owner,is_super_admin FROM users ORDER BY id LIMIT 1`).Scan(&userID, &tenantID, &email, &username, &isOwner, &isSuper)
	if err != nil {
		return 0, 0, err
	}
	if !isOwner || !isSuper || !strings.EqualFold(strings.TrimSpace(email), strings.TrimSpace(in.OwnerEmail)) || !strings.EqualFold(strings.TrimSpace(username), normalizePublicUsername(in.OwnerUsername)) {
		return 0, 0, fmt.Errorf("existing user is not the setup owner")
	}
	return userID, tenantID, nil
}

func writeSetupEnvAtomic(path string, updates map[string]string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return fmt.Errorf("P2PFLOW_ENV_FILE is empty")
	}
	values := map[string]string{}
	if b, err := os.ReadFile(path); err == nil {
		for _, line := range strings.Split(string(b), "\n") {
			line = strings.TrimSpace(strings.TrimSuffix(line, "\r"))
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
			idx := strings.IndexByte(line, '=')
			if idx <= 0 {
				continue
			}
			key := strings.TrimSpace(line[:idx])
			if !setupEnvKey(key) {
				continue
			}
			value := strings.TrimSpace(line[idx+1:])
			if len(value) >= 2 && value[0] == '"' && value[len(value)-1] == '"' {
				if x, err := strconv.Unquote(value); err == nil {
					value = x
				}
			} else if len(value) >= 2 && value[0] == '\'' && value[len(value)-1] == '\'' {
				value = value[1 : len(value)-1]
			}
			values[key] = value
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	for k, v := range updates {
		if !setupEnvKey(k) {
			return fmt.Errorf("invalid environment key %q", k)
		}
		values[k] = v
	}
	keys := make([]string, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	b.WriteString("# P2PFlow runtime environment. Managed by the v2.0.8 installer/setup wizard.\n")
	for _, k := range keys {
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(strconv.Quote(values[k]))
		b.WriteByte('\n')
	}
	if err := os.MkdirAll(filepath.Dir(path), 0750); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(b.String()), 0600); err != nil {
		return err
	}
	if err := os.Chmod(tmp, 0600); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func setupEnvKey(k string) bool {
	if k == "" {
		return false
	}
	for i, r := range k {
		if (r >= 'A' && r <= 'Z') || r == '_' || (i > 0 && r >= '0' && r <= '9') {
			continue
		}
		return false
	}
	return true
}
