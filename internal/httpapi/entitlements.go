package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

type tenantAccessSnapshot struct {
	TenantID            int64
	TenantStatus        string
	SubscriptionID      int64
	SubscriptionStatus  string
	PlanID              int64
	PlanCode            string
	PlanName            string
	MaxUsers            int64
	MaxExchangeAccounts int64
	CurrentPeriodStart  sql.NullTime
	CurrentPeriodEnd    sql.NullTime
	GraceUntil          sql.NullTime
	Entitlements        map[string]any
}

func (s *Server) tenantAccess(ctx context.Context, tenantID int64) tenantAccessSnapshot {
	out := tenantAccessSnapshot{TenantID: tenantID, Entitlements: map[string]any{}}
	var raw string
	q := `SELECT t.status,COALESCE(s.id,0),COALESCE(s.status,''),COALESCE(p.id,0),COALESCE(p.code,''),COALESCE(p.name,''),COALESCE(p.max_users,0),COALESCE(p.max_exchange_accounts,0),s.current_period_start,s.current_period_end,s.grace_until,COALESCE(p.entitlements_json,'{}') FROM tenants t LEFT JOIN subscriptions s ON s.id=(SELECT s2.id FROM subscriptions s2 WHERE s2.tenant_id=t.id ORDER BY s2.id DESC LIMIT 1) LEFT JOIN plans p ON p.id=COALESCE(s.plan_id,t.plan_id) WHERE t.id=` + s.store.Bind(1)
	if err := s.store.DB.QueryRowContext(ctx, q, tenantID).Scan(&out.TenantStatus, &out.SubscriptionID, &out.SubscriptionStatus, &out.PlanID, &out.PlanCode, &out.PlanName, &out.MaxUsers, &out.MaxExchangeAccounts, &out.CurrentPeriodStart, &out.CurrentPeriodEnd, &out.GraceUntil, &raw); err != nil {
		return out
	}
	_ = json.Unmarshal([]byte(raw), &out.Entitlements)
	if out.Entitlements == nil {
		out.Entitlements = map[string]any{}
	}
	rows, err := s.store.DB.QueryContext(ctx, `SELECT entitlement_key,value_json FROM tenant_entitlement_overrides WHERE tenant_id=`+s.store.Bind(1), tenantID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var key, valueRaw string
			if rows.Scan(&key, &valueRaw) != nil {
				continue
			}
			var value any
			if json.Unmarshal([]byte(valueRaw), &value) == nil {
				out.Entitlements[key] = value
			}
		}
	}
	return out
}

func featureForPermission(code string) string {
	switch {
	case strings.HasPrefix(code, "orders."):
		return "orders"
	case strings.HasPrefix(code, "ads."):
		return "ads"
	case code == "binance.sync":
		return "orders"
	case code == "binance.chat":
		return "chat"
	case code == "p2p.profile.view" || code == "p2p.profile.sync":
		return "p2p_profile"
	case code == "credentials.manage":
		return "api_credentials"
	case strings.HasPrefix(code, "accounts."), code == "ledger.adjust":
		return "payment_accounts"
	case code == "routing.manage":
		return "routing"
	case strings.HasPrefix(code, "notifications."):
		return "notifications"
	case strings.HasPrefix(code, "reports."):
		return "reports"
	case strings.HasPrefix(code, "accounting."):
		return "accounting"
	case strings.HasPrefix(code, "approvals."):
		return "approvals"
	case strings.HasPrefix(code, "extension."):
		return "extension"
	case strings.HasPrefix(code, "market."):
		return "market"
	case strings.HasPrefix(code, "system.update"):
		return "system_update"
	default:
		return ""
	}
}

func entitlementBool(ent map[string]any, key string, def bool) bool {
	if key == "" {
		return true
	}
	v, ok := ent[key]
	if !ok {
		return def
	}
	switch x := v.(type) {
	case bool:
		return x
	case float64:
		return x != 0
	case json.Number:
		n, _ := x.Float64()
		return n != 0
	case string:
		x = strings.TrimSpace(strings.ToLower(x))
		return x == "true" || x == "1" || x == "yes" || x == "enabled"
	default:
		return def
	}
}

func entitlementInt(ent map[string]any, key string) int64 {
	v, ok := ent[key]
	if !ok {
		return 0
	}
	return asInt64(v)
}

func (s *Server) tenantOperationalAllowed(w http.ResponseWriter, r *http.Request, u ctxUser, permission string) bool {
	if u.IsSuperAdmin {
		return true
	}
	if strings.HasPrefix(permission, "billing.") || strings.HasPrefix(permission, "superadmin.") {
		return true
	}
	access := s.tenantAccess(r.Context(), u.TenantID)
	tenantStatus := strings.ToLower(access.TenantStatus)
	subStatus := strings.ToLower(access.SubscriptionStatus)
	switch tenantStatus {
	case "disabled", "suspended":
		writeJSON(w, http.StatusForbidden, envelope{"error": "workspace_suspended", "tenantStatus": tenantStatus})
		return false
	case "pending_payment":
		writeJSON(w, http.StatusPaymentRequired, envelope{"error": "subscription_payment_required", "tenantStatus": tenantStatus, "subscriptionStatus": subStatus})
		return false
	}
	switch subStatus {
	case "pending_setup", "pending_payment", "unpaid", "expired", "cancelled":
		writeJSON(w, http.StatusPaymentRequired, envelope{"error": "subscription_payment_required", "subscriptionStatus": subStatus})
		return false
	case "past_due":
		if !access.GraceUntil.Valid || time.Now().UTC().After(access.GraceUntil.Time) {
			writeJSON(w, http.StatusPaymentRequired, envelope{"error": "subscription_past_due", "subscriptionStatus": subStatus, "graceUntil": nullTime(access.GraceUntil)})
			return false
		}
		w.Header().Set("X-P2PFlow-Billing-Warning", "past_due_grace")
	case "suspended":
		writeJSON(w, http.StatusForbidden, envelope{"error": "subscription_suspended"})
		return false
	}
	feature := featureForPermission(permission)
	if feature != "" {
		allowed := true // backward-compatible for legacy plans with no entitlement map.
		if len(access.Entitlements) > 0 {
			allowed = entitlementBool(access.Entitlements, "all_features", false) || entitlementBool(access.Entitlements, feature, false)
		}
		if !allowed {
			writeJSON(w, http.StatusForbidden, envelope{"error": "plan_feature_not_included", "feature": feature, "plan": access.PlanCode})
			return false
		}
	}
	return true
}

func (s *Server) tenantUsage(ctx context.Context, tenantID int64) map[string]int64 {
	var users, accounts int64
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE tenant_id=`+s.store.Bind(1)+` AND status='active'`, tenantID).Scan(&users)
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND status<>'deleted'`, tenantID).Scan(&accounts)
	return map[string]int64{"users": users, "exchangeAccounts": accounts}
}
