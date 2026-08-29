package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"p2pflow/v2/internal/binance"
	"p2pflow/v2/internal/events"
	"p2pflow/v2/internal/service"
)

func (s *Server) registerCredentialRoutes() {
	s.mux.HandleFunc("GET /api/api-credentials", s.requirePerm("credentials.manage", s.credentialsList))
	s.mux.HandleFunc("POST /api/api-credentials", s.requirePerm("credentials.manage", s.credentialCreate))
	s.mux.HandleFunc("DELETE /api/api-credentials/{id}", s.requirePerm("credentials.manage", s.credentialDelete))
	s.mux.HandleFunc("POST /api/api-credentials/{id}/disable", s.requirePerm("credentials.manage", s.credentialDisable))
	s.mux.HandleFunc("POST /api/api-credentials/{id}/enable", s.requirePerm("credentials.manage", s.credentialEnable))
	s.mux.HandleFunc("PATCH /api/api-credentials/{id}/release-verification", s.requirePerm("credentials.manage", s.credentialReleaseVerification))
	s.mux.HandleFunc("POST /api/binance/sync/payment-methods", s.requirePerm("credentials.manage", s.paymentMethodsSync))
	s.mux.HandleFunc("GET /api/health/binance", s.requireUser(s.binanceHealth))
	s.mux.HandleFunc("GET /api/public-health/binance", s.publicBinanceHealth)
	s.mux.HandleFunc("GET /api/me/p2p-profile", s.requirePerm("p2p.profile.view", s.p2pProfile))
	s.mux.HandleFunc("POST /api/me/p2p-profile", s.requirePerm("p2p.profile.sync", s.p2pProfileSync))
	s.mux.HandleFunc("GET /api/tenants/{tenantID}/exchange-accounts", s.requireUser(s.exchangeAccounts))
}

func mask(v string) string {
	if len(v) <= 8 {
		return "****"
	}
	return v[:4] + "********" + v[len(v)-4:]
}
func (s *Server) credentialsList(w http.ResponseWriter, r *http.Request, u ctxUser) {
	rows, err := s.store.DB.QueryContext(r.Context(), `SELECT id,label,api_key_ciphertext,status,account_uid,p2p_nickname,last_sync_at,created_at,updated_at FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY id`, u.TenantID)
	if err != nil {
		writeJSON(w, 500, envelope{"error": "database"})
		return
	}
	defer rows.Close()
	var items []map[string]any
	for rows.Next() {
		var id int64
		var label, enc, status, uid, nick string
		var last sql.NullTime
		var created, updated time.Time
		if rows.Scan(&id, &label, &enc, &status, &uid, &nick, &last, &created, &updated) != nil {
			continue
		}
		apiKey, _ := s.svc.Vault.Decrypt(enc)
		policy := s.releaseVerificationPolicy(r.Context(), u, id)
		items = append(items, map[string]any{"id": id, "name": label, "displayName": firstNonEmpty(nick, label, fmt.Sprintf("Binance Account %d", id)), "apiKeyMasked": mask(apiKey), "secretHidden": true, "clientType": "web", "status": status, "disabled": status == "disabled", "lastTestedAt": service.TimeOrNil(last), "lastLiveTestedAt": service.TimeOrNil(last), "lastTestMessage": func() string {
			if last.Valid {
				return "Connected"
			}
			return "Not tested"
		}(), "liveTestMessage": func() string {
			if last.Valid {
				return "Binance C2C connection verified"
			}
			return ""
		}(), "ownerP2pUserNo": uid, "ownerP2pNickname": nick, "ownerP2pProfileLastSyncAt": service.TimeOrNil(last), "releaseVerificationPolicy": policy, "createdAt": created, "updatedAt": updated})
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func firstNonEmpty(v ...string) string {
	for _, x := range v {
		if strings.TrimSpace(x) != "" {
			return x
		}
	}
	return ""
}

func (s *Server) credentialCreate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in struct{ Name, APIKey, SecretKey, ClientType string }
	if !decode(w, r, &in) {
		return
	}
	in.APIKey = strings.TrimSpace(in.APIKey)
	in.SecretKey = strings.TrimSpace(in.SecretKey)
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		in.Name = "Binance Account"
	}
	if in.ClientType == "" {
		in.ClientType = "web"
	}
	if in.APIKey == "" || in.SecretKey == "" {
		writeJSON(w, 422, envelope{"error": "API Key and Secret Key are required."})
		return
	}
	if !s.subscriptionAllowsAccount(r.Context(), u.TenantID) {
		writeJSON(w, 402, envelope{"error": "plan_exchange_account_limit", "message": "Current subscription plan exchange-account limit reached."})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 22*time.Second)
	defer cancel()
	_, err := s.svc.Binance.Call(ctx, binance.Credential{APIKey: in.APIKey, SecretKey: in.SecretKey, ClientType: in.ClientType}, "listOrders", nil, map[string]any{"page": 1, "rows": 1}, false)
	if err != nil {
		writeJSON(w, 502, envelope{"error": "binance_connection_failed", "message": friendlyBinanceError(err)})
		return
	}
	ek, err := s.svc.Vault.Encrypt(in.APIKey)
	if err != nil {
		writeJSON(w, 500, envelope{"error": "encrypt"})
		return
	}
	es, err := s.svc.Vault.Encrypt(in.SecretKey)
	if err != nil {
		writeJSON(w, 500, envelope{"error": "encrypt"})
		return
	}
	var id int64
	if s.store.Driver == "postgres" {
		err = s.store.DB.QueryRowContext(r.Context(), `INSERT INTO exchange_accounts(tenant_id,exchange,label,api_key_ciphertext,api_secret_ciphertext,status,last_sync_at,created_at,updated_at) VALUES($1,'binance',$2,$3,$4,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`, u.TenantID, in.Name, ek, es).Scan(&id)
	} else {
		var res sql.Result
		res, err = s.store.DB.ExecContext(r.Context(), `INSERT INTO exchange_accounts(tenant_id,exchange,label,api_key_ciphertext,api_secret_ciphertext,status,last_sync_at,created_at,updated_at) VALUES(?,'binance',?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, u.TenantID, in.Name, ek, es)
		if err == nil {
			id, _ = res.LastInsertId()
		}
	}
	if err != nil {
		writeJSON(w, 409, envelope{"error": "credential_save_failed", "detail": safeErr(err)})
		return
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO chat_account_controls(tenant_id,exchange_account_id,enabled,auto_sync,auto_assign,updated_at) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`,TRUE,TRUE,TRUE,CURRENT_TIMESTAMP)`, u.TenantID, id)
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "api_credential_connected", "exchange_account", asString(id), r, map[string]any{"name": in.Name, "apiKeyMasked": mask(in.APIKey)})
	profile, _ := s.syncCredentialProfile(r.Context(), u, id, true)
	pmCreated, pmUpdated, _ := s.syncCredentialPaymentMethods(r.Context(), u, id, true)
	s.svc.Publish(r.Context(), events.Event{TenantID: u.TenantID, Type: "credential.updated", Data: map[string]any{"id": id}})
	writeJSON(w, 201, map[string]any{"ok": true, "saved": true, "id": id, "profile": profile, "paymentMethodSync": map[string]any{"created": pmCreated, "updated": pmUpdated}})
}
func friendlyBinanceError(err error) string {
	msg := err.Error()
	switch {
	case strings.Contains(strings.ToLower(msg), "timestamp") || strings.Contains(msg, "-1021"):
		return "Binance live check failed: server time/timestamp drift. Sync server clock/NTP. Raw: " + msg
	case strings.Contains(strings.ToLower(msg), "signature") || strings.Contains(msg, "-1022"):
		return "Binance live check failed: signature invalid. Re-save the exact Secret Key. Raw: " + msg
	case strings.Contains(msg, "-2015") || strings.Contains(strings.ToLower(msg), "invalid api"):
		return "Binance live check failed: API key, IP whitelist, permission, or merchant API access is not allowed. Raw: " + msg
	default:
		return "Binance live check failed: " + msg
	}
}
func (s *Server) credentialDelete(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	res, err := s.store.DB.ExecContext(r.Context(), `DELETE FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND id=`+s.store.Bind(2), u.TenantID, id)
	if err != nil {
		writeJSON(w, 409, envelope{"error": "credential_delete_failed"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "api_credential_deleted", "exchange_account", asString(id), r, nil)
	writeJSON(w, 200, map[string]any{"ok": true, "message": "Credential deleted"})
}
func (s *Server) credentialDisable(w http.ResponseWriter, r *http.Request, u ctxUser) {
	s.setCredentialStatus(w, r, u, "disabled")
}
func (s *Server) credentialEnable(w http.ResponseWriter, r *http.Request, u ctxUser) {
	s.setCredentialStatus(w, r, u, "active")
}
func (s *Server) setCredentialStatus(w http.ResponseWriter, r *http.Request, u ctxUser, status string) {
	id := parseID(r.PathValue("id"))
	res, err := s.store.DB.ExecContext(r.Context(), `UPDATE exchange_accounts SET status=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=`+s.store.Bind(2)+` AND id=`+s.store.Bind(3), status, u.TenantID, id)
	if err != nil {
		writeJSON(w, 500, envelope{"error": "database"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	s.svc.Publish(r.Context(), events.Event{TenantID: u.TenantID, Type: "credential.updated", Data: map[string]any{"id": id, "status": status}})
	writeJSON(w, 200, map[string]any{"ok": true, "message": "Credential " + status})
}
func releaseMethodLabel(method string) string {
	return map[string]string{"AUTO": "Binance Auto", "FIDO2": "FIDO2 / Fingerprint", "FUND_PWD": "Fund Transfer Password", "GOOGLE": "Google Authenticator", "SMS": "SMS / Mobile OTP", "EMAIL": "Email OTP", "YUBIKEY": "YubiKey"}[method]
}
func localReleaseMethodLabel(method string) string {
	return map[string]string{"USER_PASSWORD": "User Password", "SECRET_CODE": "6-digit Secret Code", "EMAIL_OTP": "Email OTP", "NONE": "None"}[method]
}
func validReleaseMethod(method string) bool {
	switch method {
	case "AUTO", "FIDO2", "FUND_PWD", "GOOGLE", "SMS", "EMAIL", "YUBIKEY":
		return true
	}
	return false
}
func validLocalReleaseMethod(method string, allowNone bool) bool {
	if allowNone && method == "NONE" {
		return true
	}
	return method == "USER_PASSWORD" || method == "SECRET_CODE" || method == "EMAIL_OTP"
}
func (s *Server) releaseVerificationPolicy(ctx context.Context, u ctxUser, id int64) map[string]any {
	raw := s.jsonSetting(ctx, "credential", id, "release_verification")
	method := strings.ToUpper(firstNonEmpty(mapString(raw, "binanceMethod", "method"), "AUTO"))
	if !validReleaseMethod(method) {
		method = "AUTO"
	}
	primary := strings.ToUpper(firstNonEmpty(mapString(raw, "localPrimary"), "USER_PASSWORD"))
	if !validLocalReleaseMethod(primary, false) {
		primary = "USER_PASSWORD"
	}
	secondary := strings.ToUpper(firstNonEmpty(mapString(raw, "localSecondary"), "NONE"))
	if !validLocalReleaseMethod(secondary, true) || secondary == primary {
		secondary = "NONE"
	}
	cipher := mapString(raw, "fundPasswordCiphertext")
	var label, nick, status string
	_ = s.store.DB.QueryRowContext(ctx, `SELECT label,p2p_nickname,status FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND id=`+s.store.Bind(2), u.TenantID, id).Scan(&label, &nick, &status)
	var secretHash string
	if u.ID > 0 {
		_ = s.store.DB.QueryRowContext(ctx, `SELECT secret_code_hash FROM user_security WHERE user_id=`+s.store.Bind(1), u.ID).Scan(&secretHash)
	}
	fundConfigured := cipher != ""
	return map[string]any{
		"credentialId": id, "credentialName": firstNonEmpty(nick, label), "p2pUsername": nick, "disabled": status == "disabled",
		"binanceMethod": method, "binanceMethodLabel": releaseMethodLabel(method), "fundPasswordConfigured": fundConfigured, "autoFundPassword": method == "FUND_PWD" && fundConfigured,
		"localVerificationEnabled": mapBool(raw, "localVerificationEnabled"), "localPrimary": primary, "localPrimaryLabel": localReleaseMethodLabel(primary), "localSecondary": secondary, "localSecondaryLabel": localReleaseMethodLabel(secondary),
		"localAvailability": map[string]any{"USER_PASSWORD": true, "SECRET_CODE": secretHash != "", "EMAIL_OTP": strings.TrimSpace(u.Email) != "" && s.cfg.SMTPHost != "" && s.cfg.SMTPFrom != ""},
	}
}
func (s *Server) releaseFundPassword(ctx context.Context, credentialID int64) string {
	raw := s.jsonSetting(ctx, "credential", credentialID, "release_verification")
	cipher := mapString(raw, "fundPasswordCiphertext")
	if cipher == "" {
		return ""
	}
	plain, err := s.svc.Vault.Decrypt(cipher)
	if err != nil {
		return ""
	}
	return plain
}
func (s *Server) credentialReleaseVerification(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	if !s.accountExists(r.Context(), u.TenantID, id) {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	var payload map[string]any
	if !decode(w, r, &payload) {
		return
	}
	method := strings.ToUpper(firstNonEmpty(mapString(payload, "binanceMethod", "method"), "AUTO"))
	if !validReleaseMethod(method) {
		writeJSON(w, 422, envelope{"error": "invalid_binance_verification_method"})
		return
	}
	primary := strings.ToUpper(firstNonEmpty(mapString(payload, "localPrimary"), "USER_PASSWORD"))
	secondary := strings.ToUpper(firstNonEmpty(mapString(payload, "localSecondary"), "NONE"))
	if !validLocalReleaseMethod(primary, false) || !validLocalReleaseMethod(secondary, true) || (secondary != "NONE" && secondary == primary) {
		writeJSON(w, 422, envelope{"error": "invalid_local_verification_policy"})
		return
	}
	existing := s.jsonSetting(r.Context(), "credential", id, "release_verification")
	cipher := mapString(existing, "fundPasswordCiphertext")
	if mapBool(payload, "clearFundPassword") {
		cipher = ""
	}
	if fund := asString(payload["fundPassword"]); fund != "" {
		if len(fund) > 180 {
			writeJSON(w, 422, envelope{"error": "fund_password_too_long"})
			return
		}
		enc, err := s.svc.Vault.Encrypt(fund)
		if err != nil {
			writeJSON(w, 500, envelope{"error": "encrypt"})
			return
		}
		cipher = enc
	}
	stored := map[string]any{"binanceMethod": method, "localVerificationEnabled": mapBool(payload, "localVerificationEnabled"), "localPrimary": primary, "localSecondary": secondary, "fundPasswordCiphertext": cipher}
	if err := s.svc.SetSetting(r.Context(), "credential", id, "release_verification", stored); err != nil {
		writeJSON(w, 500, envelope{"error": "database"})
		return
	}
	policy := s.releaseVerificationPolicy(r.Context(), u, id)
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "release_verification_updated", "exchange_account", asString(id), r, map[string]any{"binanceMethod": method, "localVerificationEnabled": stored["localVerificationEnabled"], "fundPasswordConfigured": policy["fundPasswordConfigured"]})
	writeJSON(w, 200, map[string]any{"ok": true, "releaseVerificationPolicy": policy})
}

func (s *Server) subscriptionAllowsAccount(ctx context.Context, tenantID int64) bool {
	var limit, count int64
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COALESCE(p.max_exchange_accounts,2) FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id WHERE t.id=`+s.store.Bind(1), tenantID).Scan(&limit)
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND status<>'deleted'`, tenantID).Scan(&count)
	return limit <= 0 || count < limit
}
func (s *Server) credentialOptions(ctx context.Context, u ctxUser) []map[string]any {
	rows, err := s.store.DB.QueryContext(ctx, `SELECT id,label,p2p_nickname,status FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY id`, u.TenantID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	type option struct {
		id                  int64
		label, nick, status string
	}
	var options []option
	for rows.Next() {
		var o option
		if rows.Scan(&o.id, &o.label, &o.nick, &o.status) == nil {
			options = append(options, o)
		}
	}
	grants := map[int64][]string{}
	if !u.IsOwner && !u.IsSuperAdmin {
		rs, qerr := s.store.DB.QueryContext(ctx, `SELECT eap.exchange_account_id,eap.permission_code FROM exchange_account_permissions eap JOIN exchange_accounts ea ON ea.id=eap.exchange_account_id WHERE eap.tenant_id=`+s.store.Bind(1)+` AND eap.user_id=`+s.store.Bind(2)+` AND ea.tenant_id=eap.tenant_id ORDER BY eap.exchange_account_id,eap.permission_code`, u.TenantID, u.ID)
		if qerr == nil {
			for rs.Next() {
				var id int64
				var code string
				if rs.Scan(&id, &code) == nil && isAccountScopedPermission(code) && s.hasPerm(u, code) {
					grants[id] = append(grants[id], code)
				}
			}
			rs.Close()
		}
	}
	out := make([]map[string]any, 0, len(options))
	for _, o := range options {
		perms := append([]string(nil), accountScopedPermissionCodes...)
		if !u.IsOwner && !u.IsSuperAdmin {
			perms = grants[o.id]
			if len(perms) == 0 {
				continue
			}
		}
		out = append(out, map[string]any{"id": o.id, "name": o.label, "displayName": firstNonEmpty(o.nick, o.label), "accountName": o.label, "p2pUsername": o.nick, "status": o.status, "disabled": o.status == "disabled", "permissions": perms})
	}
	return out
}

func (s *Server) exchangeAccounts(w http.ResponseWriter, r *http.Request, u ctxUser) {
	tid := parseID(r.PathValue("tenantID"))
	if tid != u.TenantID && !u.IsSuperAdmin {
		writeJSON(w, 403, envelope{"error": "forbidden"})
		return
	}
	writeJSON(w, 200, map[string]any{"items": s.credentialOptions(r.Context(), ctxUser{ID: u.ID, TenantID: tid, IsOwner: u.IsOwner, IsSuperAdmin: u.IsSuperAdmin})})
}

func (s *Server) paymentMethodsSync(w http.ResponseWriter, r *http.Request, u ctxUser) {
	rows, err := s.store.DB.QueryContext(r.Context(), `SELECT id FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND status='active'`, u.TenantID)
	if err != nil {
		writeJSON(w, 500, envelope{"error": "database"})
		return
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	created, updated := 0, 0
	var errs []string
	for _, id := range ids {
		c, up, e := s.syncCredentialPaymentMethods(r.Context(), u, id, true)
		created += c
		updated += up
		if e != nil {
			errs = append(errs, e.Error())
		}
	}
	writeJSON(w, 200, map[string]any{"ok": len(errs) == 0, "created": created, "updated": updated, "errors": errs})
}
func (s *Server) syncCredentialPaymentMethods(ctx context.Context, u ctxUser, id int64, background bool) (int, int, error) {
	cred, err := s.svc.Credential(ctx, u.TenantID, id)
	if err != nil {
		return 0, 0, err
	}
	if cred.Status == "disabled" {
		return 0, 0, fmt.Errorf("credential disabled")
	}
	res, err := s.svc.Binance.Call(ctx, s.svc.BinanceCredential(cred), "listAllPaymentMethods", nil, nil, background)
	if err != nil {
		return 0, 0, err
	}
	items := extractSlice(binance.Data(res))
	created, updated := 0, 0
	for _, it := range items {
		m, ok := it.(map[string]any)
		if !ok {
			continue
		}
		payID := asInt64(firstMapValue(m, "id", "payId"))
		identifier := asString(firstMapValue(m, "identifier", "payType", "tradeMethodIdentifier"))
		name := asString(firstMapValue(m, "tradeMethodName", "name", "identifier"))
		raw := service.JSONString(m)
		if s.store.Driver == "postgres" {
			var inserted bool
			err = s.store.DB.QueryRowContext(ctx, `INSERT INTO exchange_payment_methods(tenant_id,exchange_account_id,external_pay_id,identifier,name,detail_json,active,updated_at) VALUES($1,$2,$3,$4,$5,$6,TRUE,CURRENT_TIMESTAMP) ON CONFLICT(exchange_account_id,external_pay_id,identifier) DO UPDATE SET name=EXCLUDED.name,detail_json=EXCLUDED.detail_json,active=TRUE,updated_at=CURRENT_TIMESTAMP RETURNING (xmax=0)`, u.TenantID, id, payID, identifier, name, raw).Scan(&inserted)
			if err == nil {
				if inserted {
					created++
				} else {
					updated++
				}
			}
		} else {
			res, er := s.store.DB.ExecContext(ctx, `INSERT INTO exchange_payment_methods(tenant_id,exchange_account_id,external_pay_id,identifier,name,detail_json,active,updated_at) VALUES(?,?,?,?,?,?,TRUE,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE name=VALUES(name),detail_json=VALUES(detail_json),active=TRUE,updated_at=CURRENT_TIMESTAMP`, u.TenantID, id, payID, identifier, name, raw)
			if er != nil {
				err = er
			} else {
				n, _ := res.RowsAffected()
				if n == 1 {
					created++
				} else {
					updated++
				}
			}
		}
	}
	return created, updated, err
}

func (s *Server) syncCredentialProfile(ctx context.Context, u ctxUser, id int64, background bool) (map[string]any, error) {
	cred, err := s.svc.Credential(ctx, u.TenantID, id)
	if err != nil {
		return nil, err
	}
	if cred.Status == "disabled" {
		return nil, fmt.Errorf("credential disabled")
	}
	type result struct {
		name string
		v    map[string]any
		err  error
	}
	ch := make(chan result, 3)
	var wg sync.WaitGroup
	calls := []struct {
		name, ep string
		body     any
	}{{"profile", "getUserBaseDetail", nil}, {"summary", "getOrderSummary", nil}, {"payments", "getPaymentMethodByUserId", nil}}
	for _, c := range calls {
		wg.Add(1)
		go func(c struct {
			name, ep string
			body     any
		}) {
			defer wg.Done()
			v, e := s.svc.Binance.Call(ctx, s.svc.BinanceCredential(cred), c.ep, nil, c.body, background)
			ch <- result{c.name, v, e}
		}(c)
	}
	go func() { wg.Wait(); close(ch) }()
	profile := map[string]any{}
	summary := map[string]any{}
	var warnings []string
	for x := range ch {
		if x.err != nil {
			warnings = append(warnings, x.name+": "+x.err.Error())
			continue
		}
		switch x.name {
		case "profile":
			profile = mapFromAny(binance.Data(x.v))
		case "summary":
			summary = mapFromAny(binance.Data(x.v))
		}
	}
	nick := findStringDeep(profile, "nickName", "nickname", "userNickName")
	uid := findStringDeep(profile, "userNo", "userId", "userID")
	merchant := findStringDeep(profile, "merchantNo", "merchantId")
	if merchant != "" {
		profile["merchantNo"] = merchant
	}
	if nick != "" || uid != "" {
		_, _ = s.store.DB.ExecContext(ctx, `UPDATE exchange_accounts SET p2p_nickname=`+s.store.Bind(1)+`,account_uid=`+s.store.Bind(2)+`,last_sync_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=`+s.store.Bind(3)+` AND id=`+s.store.Bind(4), nick, uid, u.TenantID, id)
	}
	pr := service.JSONString(profile)
	sr := service.JSONString(summary)
	wr := service.JSONString(warnings)
	if s.store.Driver == "postgres" {
		_, err = s.store.DB.ExecContext(ctx, `INSERT INTO exchange_account_profiles(exchange_account_id,tenant_id,profile_json,order_summary_json,warning_json,synced_at,updated_at) VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(exchange_account_id) DO UPDATE SET profile_json=EXCLUDED.profile_json,order_summary_json=EXCLUDED.order_summary_json,warning_json=EXCLUDED.warning_json,synced_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`, id, u.TenantID, pr, sr, wr)
	} else {
		_, err = s.store.DB.ExecContext(ctx, `INSERT INTO exchange_account_profiles(exchange_account_id,tenant_id,profile_json,order_summary_json,warning_json,synced_at,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE profile_json=VALUES(profile_json),order_summary_json=VALUES(order_summary_json),warning_json=VALUES(warning_json),synced_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`, id, u.TenantID, pr, sr, wr)
	}
	return map[string]any{"credentialId": id, "profile": profile, "orderSummary": summary, "warnings": warnings, "nickname": nick, "userNo": uid}, err
}
func (s *Server) p2pProfile(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := asInt64(requestString(r, "credentialId"))
	if id == 0 {
		opts := s.credentialOptions(r.Context(), u)
		if len(opts) > 0 {
			id = asInt64(opts[0]["id"])
		}
	}
	if id == 0 {
		writeJSON(w, 200, map[string]any{"profile": map[string]any{}, "credentials": []any{}, "selectedCredentialId": 0})
		return
	}
	if !s.accountPerm(r.Context(), u, id, "p2p.profile.view") {
		writeJSON(w, 403, envelope{"error": "forbidden"})
		return
	}
	var pr, sr, wr string
	var synced sql.NullTime
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT profile_json,order_summary_json,warning_json,synced_at FROM exchange_account_profiles WHERE exchange_account_id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), id, u.TenantID).Scan(&pr, &sr, &wr, &synced)
	var warnings any = []any{}
	_ = json.Unmarshal([]byte(wr), &warnings)
	writeJSON(w, 200, map[string]any{"profile": jsonMap(pr), "orderSummary": jsonMap(sr), "warnings": warnings, "credentials": s.credentialOptions(r.Context(), u), "selectedCredentialId": id, "syncedAt": service.TimeOrNil(synced)})
}
func (s *Server) p2pProfileSync(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in struct {
		CredentialID int64 `json:"credentialId"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.CredentialID == 0 {
		writeJSON(w, 422, envelope{"error": "credentialId required"})
		return
	}
	if !s.accountPerm(r.Context(), u, in.CredentialID, "p2p.profile.sync") {
		writeJSON(w, 403, envelope{"error": "forbidden"})
		return
	}
	out, err := s.syncCredentialProfile(r.Context(), u, in.CredentialID, false)
	if err != nil {
		writeJSON(w, 502, envelope{"error": "binance_sync_failed", "message": friendlyBinanceError(err)})
		return
	}
	s.svc.Publish(r.Context(), events.Event{TenantID: u.TenantID, Type: "p2p.profile.updated", Data: map[string]any{"credentialId": in.CredentialID}})
	writeJSON(w, 200, out)
}

func (s *Server) binanceHealth(w http.ResponseWriter, r *http.Request, u ctxUser) {
	opts := s.credentialOptions(r.Context(), u)
	var accounts []map[string]any
	for _, o := range opts {
		id := asInt64(o["id"])
		ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		cred, err := s.svc.Credential(ctx, u.TenantID, id)
		var latency time.Duration
		start := time.Now()
		if err == nil && cred.Status != "disabled" {
			_, err = s.svc.Binance.Call(ctx, s.svc.BinanceCredential(cred), "getApiKeyPermission", nil, nil, false)
			latency = time.Since(start)
		}
		cancel()
		accounts = append(accounts, map[string]any{"id": id, "name": o["displayName"], "ok": err == nil && cred.Status != "disabled", "latencyMs": latency.Milliseconds(), "error": func() string {
			if err != nil {
				return err.Error()
			}
			return ""
		}()})
	}
	writeJSON(w, 200, map[string]any{"ok": true, "accounts": accounts, "baseUrl": s.cfg.BinanceAPIBaseURL})
}
func (s *Server) publicBinanceHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", strings.TrimRight(s.cfg.BinanceAPIBaseURL, "/")+"/api/v3/time", nil)
	if err != nil {
		writeJSON(w, 500, envelope{"ok": false})
		return
	}
	start := time.Now()
	res, err := s.svc.Binance.HTTP.Do(req)
	if err != nil {
		writeJSON(w, 503, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	res.Body.Close()
	writeJSON(w, 200, map[string]any{"ok": res.StatusCode >= 200 && res.StatusCode < 300, "latencyMs": time.Since(start).Milliseconds()})
}

func extractSlice(v any) []any {
	switch x := v.(type) {
	case []any:
		return x
	case map[string]any:
		for _, k := range []string{"data", "rows", "list", "items", "records"} {
			if a, ok := x[k].([]any); ok {
				return a
			}
			if child, ok := x[k].(map[string]any); ok {
				if a := extractSlice(child); len(a) > 0 {
					return a
				}
			}
		}
	}
	return nil
}
func mapFromAny(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{"value": v}
}
func firstMapValue(m map[string]any, keys ...string) any {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			return v
		}
	}
	return nil
}
func findStringDeep(v any, keys ...string) string {
	set := map[string]bool{}
	for _, k := range keys {
		set[strings.ToLower(k)] = true
	}
	var walk func(any) string
	walk = func(x any) string {
		switch m := x.(type) {
		case map[string]any:
			for k, v := range m {
				if set[strings.ToLower(k)] {
					s := strings.TrimSpace(fmt.Sprint(v))
					if s != "" && s != "<nil>" {
						return s
					}
				}
			}
			for _, v := range m {
				if s := walk(v); s != "" {
					return s
				}
			}
		case []any:
			for _, v := range m {
				if s := walk(v); s != "" {
					return s
				}
			}
		}
		return ""
	}
	return walk(v)
}
