package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"p2pflow/v2/internal/binance"
	"p2pflow/v2/internal/config"
	"p2pflow/v2/internal/cryptox"
	dbx "p2pflow/v2/internal/db"
	"p2pflow/v2/internal/events"
)

type Service struct {
	Cfg            config.Config
	Store          *dbx.Store
	Vault          *cryptox.Vault
	Binance        *binance.Client
	Hub            *events.Hub
	NATS           *events.NATSPublisher
	NATSSubscriber *events.NATSSubscriber
}

func New(c config.Config, store *dbx.Store) *Service {
	return &Service{Cfg: c, Store: store, Vault: cryptox.New(c.AppSecret), Binance: binance.New(c.BinanceAPIBaseURL, c.BinanceHTTPConcurrency, c.BinanceHTTPPerKeyConcurrency, c.BinanceInteractiveReserve), Hub: events.NewHub(), NATS: events.NewNATSPublisher(c.NATSURL), NATSSubscriber: events.NewNATSSubscriber(c.NATSURL)}
}

type ExchangeCredential struct {
	ID, TenantID                                                int64
	Label, APIKey, SecretKey, ClientType, Status, UID, Nickname string
}

func (s *Service) Credential(ctx context.Context, tenantID, id int64) (ExchangeCredential, error) {
	q := `SELECT id,tenant_id,label,api_key_ciphertext,api_secret_ciphertext,status,account_uid,p2p_nickname FROM exchange_accounts WHERE tenant_id=` + s.Store.Bind(1) + ` AND id=` + s.Store.Bind(2)
	var c ExchangeCredential
	var ek, es string
	if err := s.Store.DB.QueryRowContext(ctx, q, tenantID, id).Scan(&c.ID, &c.TenantID, &c.Label, &ek, &es, &c.Status, &c.UID, &c.Nickname); err != nil {
		return c, err
	}
	var err error
	c.APIKey, err = s.Vault.Decrypt(ek)
	if err != nil {
		return c, err
	}
	c.SecretKey, err = s.Vault.Decrypt(es)
	if err != nil {
		return c, err
	}
	c.ClientType = "web"
	return c, nil
}
func (s *Service) BinanceCredential(c ExchangeCredential) binance.Credential {
	return binance.Credential{ID: c.ID, APIKey: c.APIKey, SecretKey: c.SecretKey, ClientType: c.ClientType}
}

func (s *Service) Audit(ctx context.Context, tenantID, userID int64, action, entityType, entityID string, r *http.Request, meta any) {
	b, _ := json.Marshal(meta)
	ip := ""
	ua := ""
	if r != nil {
		ip = clientIP(r)
		ua = r.UserAgent()
	}
	q := `INSERT INTO audit_logs(tenant_id,user_id,action,entity_type,entity_id,ip_address,user_agent,metadata_json,created_at) VALUES(` + s.Store.Bind(1) + `,` + s.Store.Bind(2) + `,` + s.Store.Bind(3) + `,` + s.Store.Bind(4) + `,` + s.Store.Bind(5) + `,` + s.Store.Bind(6) + `,` + s.Store.Bind(7) + `,` + s.Store.Bind(8) + `,CURRENT_TIMESTAMP)`
	_, _ = s.Store.DB.ExecContext(ctx, q, nullID(tenantID), nullID(userID), action, entityType, entityID, ip, ua, string(b))
}
func (s *Service) Notify(ctx context.Context, tenantID, userID int64, kind, title, body string, data any) {
	b, _ := json.Marshal(data)
	q := `INSERT INTO notifications(tenant_id,user_id,kind,title,body,data_json,is_read,created_at) VALUES(` + s.Store.Bind(1) + `,` + s.Store.Bind(2) + `,` + s.Store.Bind(3) + `,` + s.Store.Bind(4) + `,` + s.Store.Bind(5) + `,` + s.Store.Bind(6) + `,FALSE,CURRENT_TIMESTAMP)`
	_, _ = s.Store.DB.ExecContext(ctx, q, tenantID, nullID(userID), kind, title, body, string(b))
	s.Publish(ctx, events.Event{TenantID: tenantID, UserID: userID, Type: "notification.created", Data: map[string]any{"kind": kind, "title": title, "body": body}})
}
func (s *Service) Publish(ctx context.Context, e events.Event) error {
	if e.Source == "" {
		e.Source = s.Cfg.InstanceID
	}
	s.Hub.Publish(e)
	if s.NATS != nil && s.NATS.Enabled() {
		b, _ := json.Marshal(e)
		subject := "p2pflow.events"
		if e.TenantID > 0 {
			subject = fmt.Sprintf("p2pflow.tenant.%d.%s", e.TenantID, strings.ReplaceAll(e.Type, "_", "."))
		}
		return s.NATS.Publish(ctx, subject, b)
	}
	return nil
}
func (s *Service) RunNATSBridge(ctx context.Context) {
	if s.NATSSubscriber == nil || !s.NATSSubscriber.Enabled() {
		return
	}
	s.NATSSubscriber.Run(ctx, "p2pflow.>", func(_ string, payload []byte) {
		var e events.Event
		if json.Unmarshal(payload, &e) != nil || e.Type == "" || e.Source == s.Cfg.InstanceID {
			return
		}
		s.Hub.Publish(e)
	})
}
func (s *Service) Outbox(ctx context.Context, tenantID int64, topic, key string, payload any) {
	b, _ := json.Marshal(payload)
	q := `INSERT INTO outbox_events(tenant_id,topic,event_key,payload_json,status,available_at,created_at) VALUES(` + s.Store.Bind(1) + `,` + s.Store.Bind(2) + `,` + s.Store.Bind(3) + `,` + s.Store.Bind(4) + `,'pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
	_, _ = s.Store.DB.ExecContext(ctx, q, nullID(tenantID), topic, key, string(b))
}

func (s *Service) GetSetting(ctx context.Context, scope string, scopeID int64, key string, def any) any {
	q := `SELECT value_json FROM system_settings WHERE scope_type=` + s.Store.Bind(1) + ` AND scope_id=` + s.Store.Bind(2) + ` AND ` + s.Store.KeyColumn() + `=` + s.Store.Bind(3)
	var raw string
	if err := s.Store.DB.QueryRowContext(ctx, q, scope, scopeID, key).Scan(&raw); err != nil {
		return def
	}
	var out any
	if json.Unmarshal([]byte(raw), &out) != nil {
		return def
	}
	return out
}
func (s *Service) SetSetting(ctx context.Context, scope string, scopeID int64, key string, value any) error {
	b, _ := json.Marshal(value)
	if s.Store.Driver == "postgres" {
		_, err := s.Store.DB.ExecContext(ctx, `INSERT INTO system_settings(scope_type,scope_id,key,value_json,updated_at) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP) ON CONFLICT(scope_type,scope_id,key) DO UPDATE SET value_json=EXCLUDED.value_json,updated_at=CURRENT_TIMESTAMP`, scope, scopeID, key, string(b))
		return err
	}
	_, err := s.Store.DB.ExecContext(ctx, "INSERT INTO system_settings(scope_type,scope_id,`key`,value_json,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json),updated_at=CURRENT_TIMESTAMP", scope, scopeID, key, string(b))
	return err
}

func (s *Service) WithTx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := s.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}
func nullID(v int64) any {
	if v <= 0 {
		return nil
	}
	return v
}
func clientIP(r *http.Request) string {
	if x := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0]); x != "" {
		return x
	}
	x := r.RemoteAddr
	if i := strings.LastIndex(x, ":"); i > 0 {
		x = x[:i]
	}
	return strings.Trim(x, "[]")
}
func JSONString(v any) string { b, _ := json.Marshal(v); return string(b) }
func ScanJSON(raw string) any {
	var v any
	if json.Unmarshal([]byte(raw), &v) != nil {
		return map[string]any{}
	}
	return v
}
func TimeOrNil(v sql.NullTime) any {
	if v.Valid {
		return v.Time.UTC()
	}
	return nil
}
func Now() time.Time { return time.Now().UTC() }
