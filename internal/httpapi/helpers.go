package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"p2pflow/v2/internal/binance"
	"p2pflow/v2/internal/service"
)

func (s *Server) insertID(ctx context.Context, pgQuery, myQuery string, args ...any) (int64, error) {
	var id int64
	if s.store.Driver == "postgres" {
		err := s.store.DB.QueryRowContext(ctx, pgQuery, args...).Scan(&id)
		return id, err
	}
	res, err := s.store.DB.ExecContext(ctx, myQuery, args...)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func mapString(m map[string]any, keys ...string) string {
	return strings.TrimSpace(asString(firstMapValue(m, keys...)))
}
func mapFloat(m map[string]any, keys ...string) float64 { return asFloat(firstMapValue(m, keys...)) }
func mapInt64(m map[string]any, keys ...string) int64   { return asInt64(firstMapValue(m, keys...)) }
func mapBool(m map[string]any, keys ...string) bool {
	v := firstMapValue(m, keys...)
	switch x := v.(type) {
	case bool:
		return x
	case string:
		b, _ := strconv.ParseBool(x)
		return b
	case float64:
		return x != 0
	case json.Number:
		n, _ := x.Int64()
		return n != 0
	default:
		return asInt64(x) != 0
	}
}

func responseDataMap(v map[string]any) map[string]any { return mapFromAny(binance.Data(v)) }
func responseDataSlice(v map[string]any) []any        { return extractSlice(binance.Data(v)) }
func rawJSON(v any) string {
	b, _ := json.Marshal(v)
	if len(b) == 0 {
		return "{}"
	}
	return string(b)
}
func mergeMaps(a, b map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range a {
		out[k] = v
	}
	for k, v := range b {
		out[k] = v
	}
	return out
}

func normalizeOrderStatus(v any) string {
	s := strings.ToUpper(strings.TrimSpace(fmt.Sprint(v)))
	switch s {
	case "", "<NIL>":
		return "active"
	case "1", "WAIT_PAY", "WAIT_PAYMENT", "UNPAID", "PENDING_PAYMENT", "TRADING", "PROCESSING":
		return "unpaid"
	case "2", "PAID", "BUYER_PAYED", "WAIT_RELEASE", "PENDING_RELEASE", "PAYED":
		return "paid"
	case "3", "APPEAL", "APPEALING", "IN_APPEAL":
		return "appeal"
	case "4", "COMPLETED", "COMPLETE", "FINISHED", "SUCCESS":
		return "completed"
	case "5", "EXPIRED":
		return "expired"
	case "6", "7", "CANCELLED", "CANCELED", "BUYER_CANCEL", "SYSTEM_CANCEL", "CANCEL":
		return "cancelled"
	default:
		return strings.ToLower(s)
	}
}
func normalizeAdStatus(v any) string {
	s := strings.ToUpper(strings.TrimSpace(fmt.Sprint(v)))
	switch s {
	case "1", "ONLINE", "ACTIVE":
		return "online"
	case "3", "OFFLINE", "BREAK":
		return "offline"
	case "4", "CLOSED", "DELETED":
		return "closed"
	default:
		if s == "" || s == "<NIL>" {
			return "offline"
		}
		return strings.ToLower(s)
	}
}
func parseAnyTime(v any) time.Time {
	switch x := v.(type) {
	case float64:
		if x > 1e12 {
			return time.UnixMilli(int64(x)).UTC()
		}
		if x > 1e9 {
			return time.Unix(int64(x), 0).UTC()
		}
	case json.Number:
		n, _ := x.Int64()
		return parseAnyTime(float64(n))
	case int64:
		return parseAnyTime(float64(x))
	case string:
		x = strings.TrimSpace(x)
		if n, err := strconv.ParseInt(x, 10, 64); err == nil {
			return parseAnyTime(float64(n))
		}
		for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05"} {
			if t, err := time.Parse(layout, x); err == nil {
				return t.UTC()
			}
		}
	}
	return time.Now().UTC()
}
func sqlNullInt64(v int64) any {
	if v <= 0 {
		return nil
	}
	return v
}
func sqlNullString(v string) any {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return v
}

func (s *Server) accountAllowed(ctx context.Context, u ctxUser, accountID int64, perm string) bool {
	if accountID <= 0 {
		return false
	}
	return s.accountPerm(ctx, u, accountID, perm)
}
func (s *Server) accountExists(ctx context.Context, tenantID, accountID int64) bool {
	var n int
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND id=`+s.store.Bind(2), tenantID, accountID).Scan(&n)
	return n > 0
}

func (s *Server) jsonSetting(ctx context.Context, scope string, scopeID int64, key string) map[string]any {
	v := s.svc.GetSetting(ctx, scope, scopeID, key, map[string]any{})
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}
func replyDBError(w http.ResponseWriter, err error) {
	if err == sql.ErrNoRows {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	writeJSON(w, 500, envelope{"error": "database", "detail": safeErr(err)})
}

func (s *Server) listUserName(ctx context.Context, id int64) string {
	if id <= 0 {
		return ""
	}
	var n string
	_ = s.store.DB.QueryRowContext(ctx, `SELECT name FROM users WHERE id=`+s.store.Bind(1), id).Scan(&n)
	return n
}
func (s *Server) exchangeDisplayName(ctx context.Context, id int64) string {
	var label, nick string
	_ = s.store.DB.QueryRowContext(ctx, `SELECT label,p2p_nickname FROM exchange_accounts WHERE id=`+s.store.Bind(1), id).Scan(&label, &nick)
	return firstNonEmpty(nick, label)
}

func (s *Server) updateUsage(ctx context.Context, tenantID int64, field string, delta int64) {
	allowed := map[string]bool{"api_requests": true, "orders_synced": true, "chat_messages": true, "storage_bytes": true}
	if !allowed[field] || tenantID <= 0 || delta == 0 {
		return
	}
	// Dedicated workers generate the overwhelming majority of usage increments.
	// Buffer those counters and batch them every few seconds instead of issuing a
	// relational upsert for every Binance poll/message. Web-only processes keep
	// direct writes so usage never depends on a worker that is not running there.
	if s.cfg.WorkerEnabled {
		key := fmt.Sprintf("%d|%s|%s", tenantID, time.Now().UTC().Format("2006-01"), field)
		s.usageMu.Lock()
		s.usage[key] += delta
		s.usageMu.Unlock()
		return
	}
	_ = s.writeUsage(ctx, tenantID, time.Now().UTC().Format("2006-01"), field, delta)
}

func (s *Server) writeUsage(ctx context.Context, tenantID int64, period, field string, delta int64) error {
	if delta == 0 {
		return nil
	}
	if s.store.Driver == "postgres" {
		q := fmt.Sprintf(`INSERT INTO subscription_usage(tenant_id,period_key,%s,updated_at) VALUES($1,$2,$3,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,period_key) DO UPDATE SET %s=subscription_usage.%s+EXCLUDED.%s,updated_at=CURRENT_TIMESTAMP`, field, field, field, field)
		_, err := s.store.DB.ExecContext(ctx, q, tenantID, period, delta)
		return err
	} else {
		q := fmt.Sprintf("INSERT INTO subscription_usage(tenant_id,period_key,%s,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE %s=%s+VALUES(%s),updated_at=CURRENT_TIMESTAMP", field, field, field, field)
		_, err := s.store.DB.ExecContext(ctx, q, tenantID, period, delta)
		return err
	}
}

func (s *Server) flushUsage(ctx context.Context) {
	s.usageMu.Lock()
	pending := s.usage
	s.usage = map[string]int64{}
	s.usageMu.Unlock()
	for key, delta := range pending {
		parts := strings.SplitN(key, "|", 3)
		if len(parts) != 3 {
			continue
		}
		tid, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil || tid <= 0 {
			continue
		}
		if err := s.writeUsage(ctx, tid, parts[1], parts[2], delta); err != nil {
			// Preserve counters across transient database failures.
			s.usageMu.Lock()
			s.usage[key] += delta
			s.usageMu.Unlock()
		}
	}
}

// serviceJSON is deliberately tiny to keep all external payloads normalized before they are persisted.
func serviceJSON(v any) string { return service.JSONString(v) }

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
