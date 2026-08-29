package httpapi

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"p2pflow/v2/internal/binance"
)

func (s *Server) registerSystemRoutes() {
	s.mux.HandleFunc("GET /api/settings", s.requirePerm("settings.manage", s.settingsGet))
	s.mux.HandleFunc("PATCH /api/settings", s.requirePerm("settings.manage", s.settingsPatch))
	s.mux.HandleFunc("GET /api/audit-logs", s.requirePerm("audit.view", s.auditLogs))
	s.mux.HandleFunc("GET /api/reports", s.requirePerm("reports.view", s.reports))
	s.mux.HandleFunc("GET /api/p2p-market", s.requirePerm("market.view", s.p2pMarket))
	s.mux.HandleFunc("POST /api/health/mail-test", s.requirePerm("settings.manage", s.mailHealthTest))
	s.mux.HandleFunc("GET /api/system-update", s.requirePerm("settings.manage", s.systemUpdateStatus))
	s.mux.HandleFunc("GET /api/system-update/stage-status", s.requirePerm("settings.manage", s.systemUpdateStageStatus))
	s.mux.HandleFunc("POST /api/system-update/stage", s.requirePerm("settings.manage", s.systemUpdateStageUpload))
	s.mux.HandleFunc("POST /api/system-update/apply", s.requirePerm("settings.manage", s.systemUpdateApply))
	s.mux.HandleFunc("POST /api/system-update/rollback", s.requirePerm("settings.manage", s.systemUpdateRollback))
	s.mux.HandleFunc("POST /api/session-step", s.requirePerm("settings.manage", s.systemUpdateAction))
	s.mux.HandleFunc("POST /api/session-step/", s.requirePerm("settings.manage", s.systemUpdateAction))

	// Compatibility endpoints for the legacy setup UI. V2 is configured by env,
	// so these endpoints expose status/instructions instead of writing secrets.
	s.mux.HandleFunc("GET /setup/api/status", s.setupStatus)
	s.mux.HandleFunc("POST /setup/api/test-database", s.setupDatabaseTest)
	s.mux.HandleFunc("POST /setup/api/save", s.setupSave)
	s.mux.HandleFunc("GET /api/status", s.setupStatus)
	s.mux.HandleFunc("POST /api/test-database", s.setupDatabaseTest)
	s.mux.HandleFunc("POST /api/save", s.setupSave)
}

func (s *Server) publicSettings(ctx context.Context, tenantID int64) map[string]any {
	defaults := map[string]any{
		"mismatchTolerance":                              1.0,
		"highAmountApprovalThreshold":                    100000.0,
		"activeLockSeconds":                              120,
		"maxProofSizeBytes":                              s.cfg.MaxUploadBytes,
		"apiMode":                                        "live",
		"requirePaymentSplitForFinalAction":              true,
		"paymentSplitProofRequired":                      true,
		"requirePaymentAccountCapacityForAutoAssignment": false,
		"allowAgentFinalAction":                          true,
		"requireEmailOtp":                                false,
		"requireLoginSecretCode":                         false,
		"loginSecurityQuestionFallbackEnabled":           true,
		"sendLoginFailureEmail":                          true,
		"sendSecurityChangeEmail":                        true,
		"sendOrderEmail":                                 false,
		"sendNotificationEmail":                          false,
		"binanceUsdtAvailable":                           0.0,
		"defaultUsdtRate":                                1.0,
		"binanceAutoOrderSync":                           true,
		"binanceAutoSyncSeconds":                         int64(s.cfg.BinanceOrderSyncInterval / time.Second),
		"binanceAutoSyncRows":                            20,
		"binanceOpenOrderDetailRows":                     20,
		"activityHeartbeatSeconds":                       20,
		"activityIdleAfterSeconds":                       120,
		"activityOfflineAfterSeconds":                    180,
		"activityRetentionDays":                          90,
		"mailSendingSystem": func() string {
			if s.cfg.SMTPHost != "" {
				return "smtp"
			}
			return "auto"
		}(),
		"mailSendingSystemLabel": func() string {
			if s.cfg.SMTPHost != "" {
				return "Custom SMTP"
			}
			return "Hosting Auto"
		}(),
		"mailFrom":                 s.cfg.SMTPFrom,
		"mailFromName":             s.cfg.SMTPFromName,
		"mailReplyTo":              s.cfg.SMTPFrom,
		"smtpHost":                 s.cfg.SMTPHost,
		"smtpPort":                 s.cfg.SMTPPort,
		"smtpUser":                 s.cfg.SMTPUser,
		"smtpPasswordConfigured":   s.cfg.SMTPPassword != "",
		"smtpConfigured":           s.cfg.SMTPHost != "" && s.cfg.SMTPFrom != "",
		"smtpSecure":               s.cfg.SMTPPort == 465,
		"smtpStarttls":             s.cfg.SMTPPort != 465,
		"smtpHelo":                 "localhost",
		"mailFallbackRoutes":       []any{},
		"mailFailoverEnabledCount": 0,
		"mailDriver": func() string {
			if s.cfg.SMTPHost != "" {
				return "smtp"
			}
			return "disabled"
		}(),
	}
	v := s.svc.GetSetting(ctx, "tenant", tenantID, "general", map[string]any{})
	if m, ok := v.(map[string]any); ok {
		defaults = mergeMaps(defaults, m)
	}
	// SMTP credentials are deployment secrets. The UI may override non-secret
	// delivery preferences but never receives the password.
	defaults["smtpPasswordConfigured"] = s.cfg.SMTPPassword != "" || mapBool(defaults, "smtpPasswordConfigured")
	if _, ok := defaults["mailFallbackRoutes"]; !ok {
		defaults["mailFallbackRoutes"] = []any{}
	}
	return defaults
}

func (s *Server) settingsGet(w http.ResponseWriter, r *http.Request, u ctxUser) {
	writeJSON(w, 200, map[string]any{"settings": s.publicSettings(r.Context(), u.TenantID)})
}

func (s *Server) settingsPatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	current := s.publicSettings(r.Context(), u.TenantID)
	delete(in, "smtpPassword")
	delete(in, "clearSmtpPassword")
	delete(in, "smtpPasswordConfigured")
	// Configuration that changes infrastructure/secrets remains environment-only.
	for _, k := range []string{"smtpHost", "smtpUser", "smtpPort", "mailFrom", "mailFromName"} {
		if strings.TrimSpace(asString(in[k])) != "" && (k == "smtpHost" || k == "smtpUser") {
			// Preserve the requested display value for compatibility, while sendMail
			// continues to use environment credentials.
		}
	}
	next := mergeMaps(current, in)
	if e := s.svc.SetSetting(r.Context(), "tenant", u.TenantID, "general", next); e != nil {
		replyDBError(w, e)
		return
	}
	ext := s.extensionSettings(r, u.TenantID)
	changedExt := false
	for _, k := range []string{"p2pExtensionEnabled", "extensionPollSeconds", "advertiserDetailUrlTemplate"} {
		if v, ok := in[k]; ok {
			changedExt = true
			switch k {
			case "p2pExtensionEnabled":
				ext["enabled"] = v
			case "extensionPollSeconds":
				ext["pollSeconds"] = v
			default:
				ext[k] = v
			}
		}
	}
	if changedExt {
		_ = s.svc.SetSetting(r.Context(), "tenant", u.TenantID, "p2p_extension", ext)
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "settings.update", "tenant", fmt.Sprint(u.TenantID), r, map[string]any{"fields": mapKeysAny(in)})
	writeJSON(w, 200, map[string]any{"ok": true, "settings": s.publicSettings(r.Context(), u.TenantID)})
}

func mapKeysAny(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func (s *Server) auditLogs(w http.ResponseWriter, r *http.Request, u ctxUser) {
	limit := 500
	if n, e := strconv.Atoi(r.URL.Query().Get("limit")); e == nil && n > 0 {
		if n > 2000 {
			n = 2000
		}
		limit = n
	}
	q := `SELECT a.id,COALESCE(a.user_id,0),COALESCE(u.name,''),COALESCE(u.role_code,''),a.action,a.entity_type,a.entity_id,a.ip_address,a.metadata_json,a.created_at FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.tenant_id=` + s.store.Bind(1) + ` ORDER BY a.id DESC LIMIT ` + strconv.Itoa(limit)
	rows, e := s.store.DB.QueryContext(r.Context(), q, u.TenantID)
	if e != nil {
		replyDBError(w, e)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, uid int64
		var name, role, action, etype, eid, ip, raw string
		var at time.Time
		if rows.Scan(&id, &uid, &name, &role, &action, &etype, &eid, &ip, &raw, &at) == nil {
			items = append(items, map[string]any{"id": id, "userId": uid, "userName": name, "role": role, "action": action, "entityType": etype, "entityId": eid, "ip": ip, "details": jsonMap(raw), "createdAt": at})
		}
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func reportRange(r *http.Request) (period, label string, start, end time.Time) {
	now := time.Now().UTC()
	period = strings.ToLower(strings.TrimSpace(r.URL.Query().Get("period")))
	if period == "" {
		period = "daily"
	}
	parse := func(x string) (time.Time, bool) {
		t, e := time.Parse("2006-01-02", strings.TrimSpace(x))
		return t, e == nil
	}
	switch period {
	case "monthly":
		start = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		end = start.AddDate(0, 1, 0)
		label = start.Format("January 2006")
	case "yearly":
		start = time.Date(now.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
		end = start.AddDate(1, 0, 0)
		label = fmt.Sprint(now.Year())
	case "lifetime":
		start = time.Unix(0, 0).UTC()
		end = now.Add(24 * time.Hour)
		label = "All time"
	case "custom":
		a, ok := parse(r.URL.Query().Get("start"))
		if !ok {
			a = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		}
		b, ok := parse(r.URL.Query().Get("end"))
		if !ok {
			b = a
		}
		start = a
		end = b.AddDate(0, 0, 1)
		label = a.Format("2006-01-02") + " – " + b.Format("2006-01-02")
	default:
		period = "daily"
		start = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		end = start.AddDate(0, 0, 1)
		label = start.Format("02 Jan 2006")
	}
	return
}

func (s *Server) reports(w http.ResponseWriter, r *http.Request, u ctxUser) {
	period, label, start, end := reportRange(r)
	ctx := r.Context()
	qb := ` FROM orders WHERE tenant_id=` + s.store.Bind(1) + ` AND created_at>=` + s.store.Bind(2) + ` AND created_at<` + s.store.Bind(3)
	var total, completed int64
	var buy, sell float64
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*),COALESCE(SUM(CASE WHEN LOWER(status) IN ('completed','complete','released') THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN UPPER(trade_type)='BUY' THEN total ELSE 0 END),0),COALESCE(SUM(CASE WHEN UPPER(trade_type)='SELL' THEN total ELSE 0 END),0)`+qb, u.TenantID, start, end).Scan(&total, &completed, &buy, &sell)
	var offline int64
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM offline_transactions WHERE tenant_id=`+s.store.Bind(1)+` AND created_at>=`+s.store.Bind(2)+` AND created_at<`+s.store.Bind(3), u.TenantID, start, end).Scan(&offline)
	var ledgerIn, ledgerOut float64
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COALESCE(SUM(CASE WHEN direction IN ('receive','topup','in') THEN ABS(amount) ELSE 0 END),0),COALESCE(SUM(CASE WHEN direction IN ('send','cashout','out') THEN ABS(amount) ELSE 0 END),0) FROM payment_account_ledger WHERE tenant_id=`+s.store.Bind(1)+` AND created_at>=`+s.store.Bind(2)+` AND created_at<`+s.store.Bind(3), u.TenantID, start, end).Scan(&ledgerIn, &ledgerOut)
	var current float64
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COALESCE(SUM(l.balance_after),0) FROM payment_account_ledger l JOIN (SELECT payment_account_id,MAX(id) AS max_id FROM payment_account_ledger WHERE tenant_id=`+s.store.Bind(1)+` GROUP BY payment_account_id) x ON x.max_id=l.id`, u.TenantID).Scan(&current)

	byAgent := []map[string]any{}
	ar, e := s.store.DB.QueryContext(ctx, `SELECT u.id,u.name,COUNT(DISTINCT oa.order_id),COALESCE(SUM(CASE WHEN UPPER(o.trade_type)='BUY' THEN oa.actual_amount ELSE 0 END),0),COALESCE(SUM(CASE WHEN UPPER(o.trade_type)='SELL' THEN oa.actual_amount ELSE 0 END),0) FROM users u LEFT JOIN order_assignments oa ON oa.user_id=u.id AND oa.created_at>=`+s.store.Bind(2)+` AND oa.created_at<`+s.store.Bind(3)+` LEFT JOIN orders o ON o.id=oa.order_id WHERE u.tenant_id=`+s.store.Bind(1)+` AND u.status='active' GROUP BY u.id,u.name ORDER BY u.name`, u.TenantID, start, end)
	if e == nil {
		for ar.Next() {
			var id, c int64
			var name string
			var b, se float64
			if ar.Scan(&id, &name, &c, &b, &se) == nil {
				var completeSplits, partial, leave int64
				_ = s.store.DB.QueryRowContext(ctx, `SELECT COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN status='partial' THEN 1 ELSE 0 END),0) FROM payment_splits WHERE tenant_id=`+s.store.Bind(1)+` AND assigned_user_id=`+s.store.Bind(2)+` AND created_at>=`+s.store.Bind(3)+` AND created_at<`+s.store.Bind(4), u.TenantID, id, start, end).Scan(&completeSplits, &partial)
				_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM order_assignments WHERE tenant_id=`+s.store.Bind(1)+` AND user_id=`+s.store.Bind(2)+` AND leave_reason<>'' AND updated_at>=`+s.store.Bind(3)+` AND updated_at<`+s.store.Bind(4), u.TenantID, id, start, end).Scan(&leave)
				byAgent = append(byAgent, map[string]any{"id": id, "name": name, "orders": c, "completedSplits": completeSplits, "partialSplits": partial, "buySent": b, "sellReceived": se, "ledgerVolume": b + se, "leaveCount": leave, "activity": map[string]any{"loginSeconds": 0, "openSeconds": 0, "activeSeconds": 0, "engagedSeconds": 0, "idleSeconds": 0, "hiddenSeconds": 0, "actions": 0, "engagementRate": 0}})
			}
		}
		ar.Close()
	}

	byMethod := []map[string]any{}
	methodAgg := map[string]map[string]any{}
	mr, e := s.store.DB.QueryContext(ctx, `SELECT id,method_identifier,details_json FROM payment_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND status='active' ORDER BY method_identifier,id`, u.TenantID)
	if e == nil {
		for mr.Next() {
			var id int64
			var name, raw string
			if mr.Scan(&id, &name, &raw) != nil {
				continue
			}
			name = firstNonEmpty(name, "Payment")
			m := methodAgg[name]
			if m == nil {
				m = map[string]any{"paymentMethodId": stableMethodID(name), "name": name, "accountCount": int64(0), "buySent": 0.0, "sellReceived": 0.0, "offlineIn": 0.0, "offlineOut": 0.0, "balance": 0.0, "buyCapacity": 0.0, "sellReceiveCapacity": 0.0}
				methodAgg[name] = m
			}
			details := jsonMap(raw)
			bal := s.currentPaymentBalance(ctx, id, details)
			received, sent := s.paymentTodayUsage(ctx, id)
			buyCap := max0(bal)
			if lim := asFloat(details["sendLimit"]); lim > 0 {
				buyCap = max0(lim - sent)
				if bal > 0 && buyCap > bal {
					buyCap = bal
				}
			}
			sellCap := 0.0
			if lim := asFloat(details["receiveLimit"]); lim > 0 {
				sellCap = max0(lim - received)
			}
			m["accountCount"] = asInt64(m["accountCount"]) + 1
			m["balance"] = asFloat(m["balance"]) + bal
			m["buyCapacity"] = asFloat(m["buyCapacity"]) + buyCap
			m["sellReceiveCapacity"] = asFloat(m["sellReceiveCapacity"]) + sellCap
		}
		mr.Close()
	}
	for _, m := range methodAgg {
		byMethod = append(byMethod, m)
	}

	orderItems := []map[string]any{}
	or, e := s.store.DB.QueryContext(ctx, `SELECT id,external_order_no,order_source,trade_type,total,status,COALESCE(assigned_user_id,0) FROM orders WHERE tenant_id=`+s.store.Bind(1)+` AND created_at>=`+s.store.Bind(2)+` AND created_at<`+s.store.Bind(3)+` ORDER BY id DESC LIMIT 1000`, u.TenantID, start, end)
	if e == nil {
		for or.Next() {
			var id, aid int64
			var no, src, typ, status string
			var amount float64
			if or.Scan(&id, &no, &src, &typ, &amount, &status, &aid) == nil {
				orderItems = append(orderItems, map[string]any{"id": id, "orderNo": no, "orderSource": src, "type": typ, "amount": amount, "status": status, "summary": map[string]any{"relevantActual": amount, "difference": 0}, "leadAgent": map[string]any{"id": aid, "name": s.listUserName(ctx, aid)}})
			}
		}
		or.Close()
	}
	writeJSON(w, 200, map[string]any{"range": map[string]any{"period": period, "label": label, "start": start.Format("2006-01-02"), "end": end.Add(-time.Nanosecond).Format("2006-01-02")}, "summary": map[string]any{"orders": total, "buySent": buy, "sellReceived": sell, "currentBalance": current, "completedOrders": completed, "offlineOrders": offline, "ledgerIn": ledgerIn, "ledgerOut": ledgerOut}, "byAgent": byAgent, "byMethod": byMethod, "orders": orderItems, "generatedAt": time.Now().UTC()})
}

func marketFirstString(sources []map[string]any, keys ...string) string {
	for _, src := range sources {
		if v := mapString(src, keys...); v != "" {
			return v
		}
	}
	return ""
}

func marketFirstNumber(sources []map[string]any, keys ...string) (float64, bool) {
	for _, src := range sources {
		for _, key := range keys {
			v, ok := src[key]
			if !ok || v == nil || strings.TrimSpace(asString(v)) == "" {
				continue
			}
			n := asFloat(v)
			return n, true
		}
	}
	return 0, false
}

func marketRate(sources []map[string]any, keys ...string) any {
	n, ok := marketFirstNumber(sources, keys...)
	if !ok {
		return nil
	}
	if n > 0 && n <= 1 {
		n *= 100
	}
	return float64(int64(n*100+0.5)) / 100
}

func marketTotal(v any) int64 {
	switch x := v.(type) {
	case map[string]any:
		for _, k := range []string{"total", "totalCount", "count"} {
			if raw, ok := x[k]; ok {
				if n := asInt64(raw); n >= 0 {
					return n
				}
			}
		}
		for _, k := range []string{"data", "result"} {
			if raw, ok := x[k]; ok {
				if n := marketTotal(raw); n > 0 {
					return n
				}
			}
		}
	}
	return 0
}

func marketPaymentMethods(ad, row map[string]any) []map[string]any {
	var source any
	for _, candidate := range []any{ad["tradeMethods"], ad["payMethodDtos"], ad["tradeMethodList"], row["tradeMethods"], row["payMethodDtos"]} {
		if len(extractSlice(candidate)) > 0 {
			source = candidate
			break
		}
	}
	methods := []map[string]any{}
	seen := map[string]bool{}
	for _, mv := range extractSlice(source) {
		mm := mapFromAny(mv)
		name := firstNonEmpty(mapString(mm, "tradeMethodName", "name", "shortName", "identifier", "payType"), "Payment")
		identifier := firstNonEmpty(mapString(mm, "identifier", "payType", "typeCode"), name)
		key := strings.ToLower(identifier + "|" + name)
		if seen[key] {
			continue
		}
		seen[key] = true
		methods = append(methods, map[string]any{"name": name, "identifier": identifier})
	}
	return methods
}

func (s *Server) p2pMarket(w http.ResponseWriter, r *http.Request, u ctxUser) {
	ctx := r.Context()
	accountID := int64(0)
	if n, e := strconv.ParseInt(r.URL.Query().Get("credentialId"), 10, 64); e == nil {
		accountID = n
	}
	if accountID == 0 {
		_ = s.store.DB.QueryRowContext(ctx, `SELECT id FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND status='active' ORDER BY id LIMIT 1`, u.TenantID).Scan(&accountID)
	}
	if accountID == 0 {
		writeJSON(w, 200, map[string]any{"items": []any{}, "paymentMethods": []any{}, "page": 1, "rows": 20, "total": 0, "rawCount": 0, "hasMore": false, "warnings": []string{"Connect a Binance API account to load the live P2P market."}, "source": "none", "readOnly": true})
		return
	}
	cred, e := s.svc.Credential(ctx, u.TenantID, accountID)
	if e != nil {
		writeJSON(w, 404, envelope{"error": "credential_not_found"})
		return
	}
	page := 1
	if n, e := strconv.Atoi(r.URL.Query().Get("page")); e == nil && n > 0 {
		page = n
		if page > 1000 {
			page = 1000
		}
	}
	rowsN := 20 // Binance documentation suggests 20 rows per page.
	trade := strings.ToUpper(firstNonEmpty(r.URL.Query().Get("tradeType"), "BUY"))
	if trade != "SELL" {
		trade = "BUY"
	}
	fiat := strings.ToUpper(firstNonEmpty(r.URL.Query().Get("fiat"), "BDT"))
	asset := strings.ToUpper(firstNonEmpty(r.URL.Query().Get("asset"), "USDT"))
	amount, _ := strconv.ParseFloat(firstNonEmpty(r.URL.Query().Get("amount"), r.URL.Query().Get("transAmount")), 64)
	payTypes := []string{}
	for _, v := range strings.Split(firstNonEmpty(r.URL.Query().Get("payTypes"), r.URL.Query().Get("payType")), ",") {
		v = strings.TrimSpace(v)
		if v != "" && len(payTypes) < 10 {
			payTypes = append(payTypes, v)
		}
	}
	publisherType := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("publisherType")))
	if publisherType != "merchant" && publisherType != "user" {
		publisherType = ""
	}
	country := strings.TrimSpace(r.URL.Query().Get("country"))
	sortBy := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("sort")))
	paymentTime, _ := strconv.Atoi(r.URL.Query().Get("paymentTime"))
	localTradable := r.URL.Query().Get("tradableOnly") == "1"
	localMerchant := r.URL.Query().Get("merchantOnly") == "1" || publisherType == "merchant"
	localVerified := r.URL.Query().Get("verifiedMerchantOnly") == "1"
	localNoVerification := r.URL.Query().Get("noVerificationRequired") == "1"

	body := map[string]any{
		"page": page, "rows": rowsN, "tradeType": trade, "fiat": fiat, "asset": asset,
		"payTypes": payTypes, "filterType": "all", "order": "", "sort": sortBy,
		"additionalKycVerifyFilter": 0,
	}
	if amount > 0 {
		body["transAmount"] = amount
	}
	if publisherType != "" {
		body["publisherType"] = publisherType
	}
	if country != "" && !strings.EqualFold(country, "ALL") {
		body["countries"] = []string{country}
	} else {
		body["countries"] = []string{}
	}

	res, e := s.svc.Binance.Call(ctx, s.svc.BinanceCredential(cred), "searchAds", nil, body, false)
	if e != nil {
		writeJSON(w, 502, envelope{"error": "binance_market_failed", "message": friendlyBinanceError(e)})
		return
	}
	rawItems := responseDataSlice(res)
	items := make([]map[string]any, 0, len(rawItems))
	methodSet := map[string]bool{}
	for _, v := range rawItems {
		row, ok := v.(map[string]any)
		if !ok {
			continue
		}
		ad := row
		if x, ok := row["adv"].(map[string]any); ok {
			ad = x
		} else if x, ok := row["advertisement"].(map[string]any); ok {
			ad = x
		}
		advertiser := row
		if x, ok := row["advertiser"].(map[string]any); ok {
			advertiser = x
		} else if x, ok := row["publisher"].(map[string]any); ok {
			advertiser = x
		}
		sources := []map[string]any{advertiser, row, ad}
		methods := marketPaymentMethods(ad, row)
		for _, method := range methods {
			methodSet[mapString(method, "name")] = true
		}
		rawUserType := marketFirstString([]map[string]any{advertiser}, "userType", "type")
		verified := mapBool(advertiser, "verified", "isVerified") || len(extractSlice(advertiser["tagIconUrls"])) > 0
		isMerchant := strings.Contains(strings.ToLower(rawUserType), "merchant") || mapBool(advertiser, "isMerchant", "merchant") || verified
		minAmount, _ := marketFirstNumber([]map[string]any{ad, row}, "minSingleTransAmount", "minOrderPrice", "minAmount", "minSingleTransQuantity")
		maxAmount, _ := marketFirstNumber([]map[string]any{ad, row}, "dynamicMaxSingleTransAmount", "maxSingleTransAmount", "maxOrderPrice", "maxAmount")
		available, _ := marketFirstNumber([]map[string]any{ad, row}, "tradableQuantity", "surplusAmount", "dynamicMaxSingleTransQuantity", "maxSingleTransQuantity", "initAmount")
		price, _ := marketFirstNumber([]map[string]any{ad, row}, "price", "advPrice", "unitPrice")
		tradeCount, _ := marketFirstNumber(sources, "monthOrderCount", "orderCount", "tradeCount", "completedOrderCount", "totalOrderCount")
		isTradable := true
		if x, exists := ad["isTradable"]; exists {
			isTradable = mapBool(map[string]any{"v": x}, "v")
		}
		requiresVerification := asInt64(firstMapValue(ad, "takerAdditionalKycRequired", "additionalKycRequired")) == 1
		item := map[string]any{
			"advNo":        marketFirstString([]map[string]any{ad, row}, "advNo", "advOrderNumber", "adOrderNo", "id"),
			"advertiserNo": marketFirstString([]map[string]any{advertiser, row}, "userNo", "merchantNo", "userId", "uid"),
			"nickname":     firstNonEmpty(marketFirstString(sources, "nickName", "nickname", "userName", "merchantName", "name"), "P2P Advertiser"),
			"userType":     rawUserType, "verified": verified, "isMerchant": isMerchant,
			"merchantBadgeType": func() string {
				if verified {
					return "gold"
				}
				if isMerchant {
					return "blue"
				}
				return ""
			}(),
			"tradeCount": int64(tradeCount + 0.5), "completionRate": marketRate(sources, "monthFinishRate", "finishRate", "completionRate", "monthCompletionRate"),
			"positiveRate": marketRate(sources, "positiveRate", "positiveFeedbackRate", "positiveRate30d", "feedbackRate"),
			"price":        max0(price), "asset": firstNonEmpty(marketFirstString([]map[string]any{ad, row}, "asset", "coin"), asset), "fiat": firstNonEmpty(marketFirstString([]map[string]any{ad, row}, "fiatUnit", "fiat", "currency"), fiat), "tradeType": trade,
			"minAmount": max0(minAmount), "maxAmount": max0(maxAmount), "available": max0(available),
			"payTimeLimit": mapInt64(ad, "payTimeLimit", "paymentTimeLimit"), "paymentMethods": methods,
			"tags": func() []string {
				if requiresVerification {
					return []string{"Verification"}
				}
				return []string{}
			}(),
			"requiresVerification": requiresVerification, "isTradable": isTradable,
			"countryCode": marketFirstString([]map[string]any{ad, row, advertiser}, "countryCode", "country", "countryShortName"),
			"countryName": marketFirstString([]map[string]any{ad, row, advertiser}, "countryName", "countryFullName", "countryDisplayName"),
			"priceScale":  mapInt64(ad, "priceScale"), "fiatScale": mapInt64(ad, "fiatScale"), "raw": row,
		}
		if item["priceScale"].(int64) <= 0 {
			item["priceScale"] = int64(2)
		}
		if item["fiatScale"].(int64) <= 0 {
			item["fiatScale"] = int64(2)
		}
		if len(payTypes) > 0 {
			wanted := map[string]bool{}
			for _, x := range payTypes {
				wanted[strings.ToLower(x)] = true
			}
			matched := false
			for _, method := range methods {
				if wanted[strings.ToLower(mapString(method, "name"))] || wanted[strings.ToLower(mapString(method, "identifier"))] {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}
		if localTradable && !isTradable {
			continue
		}
		if localMerchant && !isMerchant {
			continue
		}
		if localVerified && !verified && !isMerchant {
			continue
		}
		if localNoVerification && requiresVerification {
			continue
		}
		if paymentTime > 0 && int(item["payTimeLimit"].(int64)) != paymentTime {
			continue
		}
		if country != "" && !strings.EqualFold(country, "ALL") {
			if !strings.EqualFold(asString(item["countryCode"]), country) && !strings.EqualFold(asString(item["countryName"]), country) {
				continue
			}
		}
		items = append(items, item)
	}
	if sortBy == "trades" {
		sort.SliceStable(items, func(i, j int) bool { return asInt64(items[i]["tradeCount"]) > asInt64(items[j]["tradeCount"]) })
	} else if sortBy == "completion" {
		sort.SliceStable(items, func(i, j int) bool { return asFloat(items[i]["completionRate"]) > asFloat(items[j]["completionRate"]) })
	} else {
		sort.SliceStable(items, func(i, j int) bool {
			if trade == "SELL" {
				return asFloat(items[i]["price"]) > asFloat(items[j]["price"])
			}
			return asFloat(items[i]["price"]) < asFloat(items[j]["price"])
		})
	}
	pms := make([]string, 0, len(methodSet))
	for k := range methodSet {
		if k != "" {
			pms = append(pms, k)
		}
	}
	sort.Strings(pms)
	total := marketTotal(res)
	if total == 0 {
		total = int64(len(rawItems))
	}
	hasMore := len(rawItems) >= rowsN && (total <= int64(len(rawItems)) || int64(page*rowsN) < total)
	writeJSON(w, 200, map[string]any{
		"source": "binance_sapi", "endpoint": "/sapi/v1/c2c/ads/search", "documentedEndpoint": "/sapi/v1/c2c/ads/search", "readOnly": true,
		"fetchedAt": time.Now().UTC(), "cached": false, "credentialId": accountID,
		"page": page, "rows": rowsN, "total": total, "rawCount": len(rawItems), "hasMore": hasMore,
		"filters": body, "paymentMethods": pms, "items": items, "warnings": []string{},
	})
}

func (s *Server) mailHealthTest(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	_ = decode(w, r, &in)
	to := firstNonEmpty(mapString(in, "email"), u.Email)
	if to == "" {
		writeJSON(w, 422, envelope{"error": "email_required"})
		return
	}
	if e := s.sendMail(to, "P2PFlow mail test", "P2PFlow v"+s.cfg.Version+" email delivery is working."); e != nil {
		writeJSON(w, 503, map[string]any{"error": "mail_test_failed", "detail": e.Error(), "smtpStage": "delivery"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "message": "Test email sent successfully.", "to": to, "driver": "smtp", "system": "smtp", "systemLabel": "Custom SMTP"})
}

func (s *Server) systemUpdateStatus(w http.ResponseWriter, r *http.Request, u ctxUser) {
	s.handleSystemUpdateStatus(w, r, u)
}
func (s *Server) systemUpdateStageStatus(w http.ResponseWriter, r *http.Request, u ctxUser) {
	s.handleSystemUpdateStageStatus(w, r, u)
}
func (s *Server) systemUpdateAction(w http.ResponseWriter, r *http.Request, u ctxUser) {
	s.handleSystemUpdateCompatibilityAction(w, r, u)
}

// extendedHealth is used by future clients. The legacy /api/health endpoint is
// intentionally small and cheap; these helpers let it expose richer information.
func (s *Server) healthPayload(ctx context.Context, u ctxUser) map[string]any {
	var sessions, creds int64
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM sessions WHERE tenant_id=`+s.store.Bind(1)+` AND expires_at>CURRENT_TIMESTAMP`, u.TenantID).Scan(&sessions)
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND status='active'`, u.TenantID).Scan(&creds)
	settings := map[string]any{"apiMode": "live", "mailDriver": func() string {
		if s.cfg.SMTPHost != "" {
			return "smtp"
		}
		return "disabled"
	}()}

	credential := map[string]any{"savedCredentialCount": creds}
	var cid int64
	var label, keyCipher, status, nick string
	var last sql.NullTime
	if s.store.DB.QueryRowContext(ctx, `SELECT id,label,api_key_ciphertext,status,p2p_nickname,last_sync_at FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,id LIMIT 1`, u.TenantID).Scan(&cid, &label, &keyCipher, &status, &nick, &last) == nil {
		key, _ := s.svc.Vault.Decrypt(keyCipher)
		credential["activeCredential"] = map[string]any{"id": cid, "name": firstNonEmpty(nick, label), "apiKeyMasked": mask(key), "status": status, "lastTestedAt": nullTime(last), "liveTestMessage": func() string {
			if last.Valid {
				return "Binance C2C account synchronized"
			}
			return "Not synchronized yet"
		}()}
	}

	dbStart := time.Now()
	dbOK := s.store.DB.PingContext(ctx) == nil
	storageOK := os.MkdirAll(s.cfg.UploadDir, 0750) == nil
	storageSteps := []any{
		map[string]any{"name": "Database", "ok": dbOK, "host": s.cfg.DBDriver, "ms": time.Since(dbStart).Milliseconds(), "detail": "normalized relational storage"},
		map[string]any{"name": "Uploads directory", "ok": storageOK, "path": s.cfg.UploadDir, "detail": "filesystem"},
	}
	mailOK := s.cfg.SMTPHost != "" && s.cfg.SMTPFrom != ""
	mailSteps := []any{map[string]any{"name": "SMTP configuration", "ok": mailOK, "host": s.cfg.SMTPHost, "statusCode": func() int {
		if mailOK {
			return 200
		}
		return 0
	}(), "detail": func() string {
		if mailOK {
			return "configured"
		}
		return "SMTP is optional; configure SMTP_* variables for email delivery"
	}()}}

	return map[string]any{
		"ok":           dbOK && storageOK,
		"version":      s.cfg.Version,
		"service":      "p2pflow",
		"architecture": "multi-tenant-relational",
		"workers":      s.cfg.WorkerEnabled,
		"app":          map[string]any{"version": s.cfg.Version, "node": "Go " + runtime.Version(), "platform": runtime.GOOS + "/" + runtime.GOARCH, "uptimeSeconds": int64(time.Since(s.startedAt).Seconds()), "sessionCount": sessions},
		"settings":     settings,
		"credential":   credential,
		"binance":      map[string]any{"ok": true, "steps": []any{}, "diagnosis": "Use Binance Network Only for an authenticated live account test."},
		"mail":         map[string]any{"ok": mailOK, "steps": mailSteps},
		"storage":      map[string]any{"ok": dbOK && storageOK, "steps": storageSteps},
	}
}

// Keep database/sql imported and checked on all supported drivers.
var _ = sql.ErrNoRows
var _ = binance.Data
