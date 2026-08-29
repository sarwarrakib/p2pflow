package httpapi

import (
	"context"
	"database/sql"
	"encoding/base64"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func (s *Server) registerPaymentRoutes() {
	s.mux.HandleFunc("GET /api/payment-methods", s.requireUser(s.paymentMethods))
	s.mux.HandleFunc("GET /api/payment-accounts", s.requirePerm("accounts.view", s.paymentAccountsList))
	s.mux.HandleFunc("POST /api/payment-accounts", s.requirePerm("accounts.manage", s.paymentAccountCreate))
	s.mux.HandleFunc("PATCH /api/payment-accounts/{id}", s.requirePerm("accounts.manage", s.paymentAccountPatch))
	s.mux.HandleFunc("DELETE /api/payment-accounts/{id}", s.requirePerm("accounts.manage", s.paymentAccountDelete))
	s.mux.HandleFunc("POST /api/payment-accounts/{id}/ledger", s.requirePerm("ledger.adjust", s.paymentAccountAdjust))
	s.mux.HandleFunc("POST /api/payment-accounts/bulk", s.requirePerm("accounts.manage", s.paymentAccountsBulkCreate))
	s.mux.HandleFunc("PATCH /api/payment-accounts/bulk", s.requirePerm("accounts.manage", s.paymentAccountsBulkPatch))
	s.mux.HandleFunc("DELETE /api/payment-accounts/bulk", s.requirePerm("accounts.manage", s.paymentAccountsBulkDelete))
	s.mux.HandleFunc("GET /api/ledgers", s.requirePerm("accounts.view", s.ledgersList))
	s.mux.HandleFunc("GET /api/routing", s.requirePerm("accounts.view", s.routingList))
	s.mux.HandleFunc("POST /api/routing", s.requirePerm("routing.manage", s.routingCreate))
	s.mux.HandleFunc("PATCH /api/routing/{id}", s.requirePerm("routing.manage", s.routingPatch))
	s.mux.HandleFunc("DELETE /api/routing/{id}", s.requirePerm("routing.manage", s.routingDelete))
	s.mux.HandleFunc("GET /api/offline-transactions", s.requirePerm("orders.view", s.offlineTransactions))
	s.mux.HandleFunc("GET /api/offline-transactions/candidates", s.requirePerm("accounts.view", s.offlineCandidates))
	s.mux.HandleFunc("POST /api/offline-transactions", s.requirePerm("orders.create", s.offlineCreate))
	s.mux.HandleFunc("POST /api/offline-transactions/{id}/receive", s.requirePerm("orders.manage", s.offlineReceive))
	s.mux.HandleFunc("POST /api/offline-transactions/{id}/finalize", s.requirePerm("orders.create", s.offlineFinalize))
	s.mux.HandleFunc("POST /api/offline-transactions/{id}/cancel", s.requirePerm("orders.manage", s.offlineCancel))
	s.mux.HandleFunc("GET /api/approvals", s.requirePerm("approvals.manage", s.approvalsList))
	s.mux.HandleFunc("POST /api/approvals/{id}/decision", s.requirePerm("approvals.manage", s.approvalDecision))
	s.mux.HandleFunc("GET /api/proofs/{id}", s.requireUser(s.proofGet))
}

func (s *Server) paymentMethods(w http.ResponseWriter, r *http.Request, u ctxUser) {
	seen := map[string]map[string]any{}
	rows, _ := s.store.DB.QueryContext(r.Context(), `SELECT DISTINCT identifier,name FROM exchange_payment_methods WHERE tenant_id=`+s.store.Bind(1)+` AND active=TRUE ORDER BY name`, u.TenantID)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id, name string
			if rows.Scan(&id, &name) == nil {
				key := strings.ToLower(firstNonEmpty(id, name))
				if key != "" {
					seen[key] = map[string]any{"id": stableMethodID(key), "code": id, "identifier": id, "name": firstNonEmpty(name, id)}
				}
			}
		}
	}
	local, _ := s.store.DB.QueryContext(r.Context(), `SELECT DISTINCT method_identifier FROM payment_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND status<>'deleted'`, u.TenantID)
	if local != nil {
		defer local.Close()
		for local.Next() {
			var id string
			if local.Scan(&id) == nil {
				key := strings.ToLower(strings.TrimSpace(id))
				if key != "" {
					if _, ok := seen[key]; !ok {
						seen[key] = map[string]any{"id": stableMethodID(key), "code": id, "identifier": id, "name": id}
					}
				}
			}
		}
	}
	out := make([]map[string]any, 0, len(seen))
	for _, m := range seen {
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool { return asString(out[i]["name"]) < asString(out[j]["name"]) })
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func stableMethodID(s string) int64 {
	var n int64 = 146959810
	for _, r := range s {
		n = (n * 16777619) ^ int64(r)
	}
	if n < 0 {
		n = -n
	}
	return n%2000000000 + 1
}

func (s *Server) canViewPaymentAccount(u ctxUser, owner int64, details map[string]any) bool {
	if u.IsOwner || u.IsSuperAdmin || s.hasPerm(u, "accounts.manage") || u.Role == "manager" || u.Role == "admin" {
		return true
	}
	if owner == 0 || owner == u.ID {
		return true
	}
	for _, id := range extractIntArray(details["allowedAgentIds"]) {
		if id == u.ID {
			return true
		}
	}
	return false
}
func (s *Server) currentPaymentBalance(ctx context.Context, id int64, details map[string]any) float64 {
	var b sql.NullFloat64
	_ = s.store.DB.QueryRowContext(ctx, `SELECT balance FROM payment_account_runtime WHERE payment_account_id=`+s.store.Bind(1), id).Scan(&b)
	if b.Valid {
		return b.Float64
	}
	_ = s.store.DB.QueryRowContext(ctx, `SELECT balance_after FROM payment_account_ledger WHERE payment_account_id=`+s.store.Bind(1)+` ORDER BY id DESC LIMIT 1`, id).Scan(&b)
	if b.Valid {
		return b.Float64
	}
	return asFloat(details["openingBalance"])
}
func (s *Server) paymentAccountMap(ctx context.Context, u ctxUser, id, owner int64, name, method, accountName, number, bank, status, raw string, created, updated time.Time) map[string]any {
	d := jsonMap(raw)
	balance := s.currentPaymentBalance(ctx, id, d)
	accountType := firstNonEmpty(mapString(d, "accountType"), func() string {
		if owner > 0 {
			return "agent"
		}
		return "personal"
	}())
	viewManage := u.IsOwner || u.IsSuperAdmin || s.hasPerm(u, "accounts.manage") || (owner == u.ID && s.hasPerm(u, "accounts.manage"))
	var ownerObj any
	if owner > 0 {
		var n, un string
		if s.store.DB.QueryRowContext(ctx, `SELECT name,username FROM users WHERE id=`+s.store.Bind(1), owner).Scan(&n, &un) == nil {
			ownerObj = map[string]any{"id": owner, "name": n, "username": un}
		}
	}
	allowed := []map[string]any{}
	for _, uid := range extractIntArray(d["allowedAgentIds"]) {
		var n string
		if s.store.DB.QueryRowContext(ctx, `SELECT name FROM users WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), uid, u.TenantID).Scan(&n) == nil {
			allowed = append(allowed, map[string]any{"id": uid, "name": n})
		}
	}
	dailyReceived, dailySent := s.paymentTodayUsage(ctx, id)
	receiveLimit := asFloat(d["receiveLimit"])
	sendLimit := asFloat(d["sendLimit"])
	recvAvail := func() float64 {
		if receiveLimit <= 0 {
			return 999999999999
		}
		return max0(receiveLimit - dailyReceived)
	}()
	sendAvail := func() float64 {
		if sendLimit <= 0 {
			return max0(balance)
		}
		v := max0(sendLimit - dailySent)
		if balance > 0 && v > balance {
			return balance
		}
		return v
	}()
	return map[string]any{"id": id, "name": name, "label": mapString(d, "label"), "serialNumber": mapString(d, "serialNumber"), "methodIdentifier": method, "paymentMethodId": stableMethodID(strings.ToLower(method)), "method": map[string]any{"id": stableMethodID(strings.ToLower(method)), "name": method, "code": method}, "accountName": accountName, "accountNumber": number, "bankName": bank, "details": d, "status": status, "accountType": accountType, "ownerUserId": func() any {
		if owner > 0 {
			return owner
		}
		return nil
	}(), "ownerUser": ownerObj, "allowedAgents": allowed, "viewerCanManage": viewManage, "viewerCanDelete": viewManage, "viewerCanAdjust": viewManage || owner == u.ID, "viewerCanManageAccess": u.IsOwner || s.hasPerm(u, "accounts.manage"), "currentBalance": balance, "balance": balance, "receiveAvailable": recvAvail, "sendAvailable": sendAvail, "usage": map[string]any{"todayReceived": dailyReceived, "todaySent": dailySent}, "rules": firstMapValue(d, "rules", "chargeRules"), "createdAt": created, "updatedAt": updated}
}
func (s *Server) paymentTodayUsage(ctx context.Context, id int64) (float64, float64) {
	start := time.Now().UTC().Format("2006-01-02")
	var in, out sql.NullFloat64
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COALESCE(SUM(CASE WHEN direction IN ('receive','topup','in') THEN ABS(amount) ELSE 0 END),0),COALESCE(SUM(CASE WHEN direction IN ('send','cashout','out') THEN ABS(amount) ELSE 0 END),0) FROM payment_account_ledger WHERE payment_account_id=`+s.store.Bind(1)+` AND created_at>=`+s.store.Bind(2), id, start).Scan(&in, &out)
	return in.Float64, out.Float64
}
func (s *Server) paymentAccountsList(w http.ResponseWriter, r *http.Request, u ctxUser) {
	rows, e := s.store.DB.QueryContext(r.Context(), `SELECT id,COALESCE(user_id,0),name,method_identifier,account_name,account_number,bank_name,status,details_json,created_at,updated_at FROM payment_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND status<>'deleted' ORDER BY id DESC`, u.TenantID)
	if e != nil {
		replyDBError(w, e)
		return
	}
	defer rows.Close()
	pmFilter := asInt64(requestString(r, "paymentMethodId"))
	var items []map[string]any
	labels := map[string]bool{}
	types := map[string]bool{}
	methods := map[string]bool{}
	for rows.Next() {
		var id, owner int64
		var name, method, an, num, bank, status, raw string
		var ca, ua time.Time
		if rows.Scan(&id, &owner, &name, &method, &an, &num, &bank, &status, &raw, &ca, &ua) != nil {
			continue
		}
		d := jsonMap(raw)
		if !s.canViewPaymentAccount(u, owner, d) {
			continue
		}
		m := s.paymentAccountMap(r.Context(), u, id, owner, name, method, an, num, bank, status, raw, ca, ua)
		if pmFilter > 0 && asInt64(m["paymentMethodId"]) != pmFilter {
			continue
		}
		items = append(items, m)
		labels[asString(m["label"])] = true
		types[asString(m["accountType"])] = true
		methods[method] = true
	}
	methodOpts := []map[string]any{}
	for m := range methods {
		methodOpts = append(methodOpts, map[string]any{"id": stableMethodID(strings.ToLower(m)), "name": m})
	}
	writeJSON(w, 200, map[string]any{"items": items, "scope": map[string]any{"manageAll": u.IsOwner || u.IsSuperAdmin || s.hasPerm(u, "accounts.manage"), "ownOnly": u.Role == "agent" && !s.hasPerm(u, "accounts.manage")}, "filterOptions": map[string]any{"paymentMethods": methodOpts, "accountTypes": mapKeys(types), "labels": mapKeys(labels)}})
}
func (s *Server) paymentAccountCreate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	item, e := s.createPaymentAccount(r.Context(), u, in)
	if e != nil {
		writeJSON(w, 422, envelope{"error": "payment_account_invalid", "message": e.Error()})
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "payment_account_created", "payment_account", asString(item["id"]), r, nil)
	writeJSON(w, 201, item)
}
func (s *Server) createPaymentAccount(ctx context.Context, u ctxUser, in map[string]any) (map[string]any, error) {
	number := mapString(in, "accountNumber")
	method := firstNonEmpty(mapString(in, "methodIdentifier", "method", "paymentMethod", "paymentMethodCode"), "Other")
	if number == "" {
		return nil, fmt.Errorf("accountNumber required")
	}
	owner := mapInt64(in, "ownerUserId", "userId")
	if owner == 0 {
		owner = u.ID
	}
	name := firstNonEmpty(mapString(in, "name", "label"), number)
	d := map[string]any{}
	for k, v := range in {
		switch k {
		case "name", "methodIdentifier", "method", "paymentMethod", "paymentMethodCode", "accountName", "accountNumber", "bankName", "status", "ownerUserId", "userId":
		default:
			d[k] = v
		}
	}
	if _, ok := d["accountType"]; !ok {
		d["accountType"] = "personal"
	}
	accountType := strings.ToLower(firstNonEmpty(mapString(d, "accountType"), "personal"))
	if accountType != "personal" && accountType != "merchant" && accountType != "agent" {
		return nil, fmt.Errorf("invalid accountType")
	}
	opening := mapFloat(d, "openingBalance")
	receiveDaily := mapFloat(d, "receiveDailyLimit", "receiveLimit")
	sendDaily := mapFloat(d, "sendDailyLimit", "sendLimit")
	receiveMonthly := mapFloat(d, "receiveMonthlyLimit")
	sendMonthly := mapFloat(d, "sendMonthlyLimit")
	chargeRules := rawJSON(firstMapValue(d, "chargeRules", "rules"))
	commissionRules := rawJSON(firstMapValue(d, "commissionRules"))
	pg := `INSERT INTO payment_accounts(tenant_id,user_id,name,method_identifier,account_name,account_number,bank_name,details_json,status,account_type,opening_balance,receive_daily_limit,send_daily_limit,receive_monthly_limit,send_monthly_limit,charge_rules_json,commission_rules_json,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`
	my := `INSERT INTO payment_accounts(tenant_id,user_id,name,method_identifier,account_name,account_number,bank_name,details_json,status,account_type,opening_balance,receive_daily_limit,send_daily_limit,receive_monthly_limit,send_monthly_limit,charge_rules_json,commission_rules_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
	id, e := s.insertID(ctx, pg, my, u.TenantID, sqlNullInt64(owner), name, method, mapString(in, "accountName"), number, mapString(in, "bankName"), rawJSON(d), firstNonEmpty(mapString(in, "status"), "active"), accountType, opening, receiveDaily, sendDaily, receiveMonthly, sendMonthly, chargeRules, commissionRules)
	if e != nil {
		return nil, e
	}
	if open := opening; open != 0 {
		// Seed runtime at zero first so the explicit opening ledger entry is the
		// single source of the initial balance rather than being counted twice.
		if s.store.Driver == "postgres" {
			_, _ = s.store.DB.ExecContext(ctx, `INSERT INTO payment_account_runtime(payment_account_id,tenant_id,balance,version,updated_at) VALUES($1,$2,0,0,CURRENT_TIMESTAMP) ON CONFLICT(payment_account_id) DO NOTHING`, id, u.TenantID)
		} else {
			_, _ = s.store.DB.ExecContext(ctx, `INSERT IGNORE INTO payment_account_runtime(payment_account_id,tenant_id,balance,version,updated_at) VALUES(?,?,0,0,CURRENT_TIMESTAMP)`, id, u.TenantID)
		}
		if err := s.appendPaymentLedger(ctx, u.TenantID, id, u.ID, 0, "opening", func() string {
			if open >= 0 {
				return "receive"
			}
			return "send"
		}(), open, "opening", "Opening balance", nil); err != nil {
			return nil, err
		}
	}
	var ca, ua time.Time
	var raw string
	var oid int64
	var n, me, an, num, b, st string
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COALESCE(user_id,0),name,method_identifier,account_name,account_number,bank_name,status,details_json,created_at,updated_at FROM payment_accounts WHERE id=`+s.store.Bind(1), id).Scan(&oid, &n, &me, &an, &num, &b, &st, &raw, &ca, &ua)
	return s.paymentAccountMap(ctx, u, id, oid, n, me, an, num, b, st, raw, ca, ua), nil
}
func (s *Server) paymentAccountPatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	if e := s.patchPaymentAccount(r.Context(), u, id, in); e != nil {
		replyDBError(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
func (s *Server) patchPaymentAccount(ctx context.Context, u ctxUser, id int64, in map[string]any) error {
	var owner int64
	var raw string
	if e := s.store.DB.QueryRowContext(ctx, `SELECT COALESCE(user_id,0),details_json FROM payment_accounts WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), id, u.TenantID).Scan(&owner, &raw); e != nil {
		return e
	}
	d := jsonMap(raw)
	for k, v := range in {
		switch k {
		case "name", "methodIdentifier", "accountName", "accountNumber", "bankName", "status", "ownerUserId", "userId":
		default:
			d[k] = v
		}
	}
	newOwner := mapInt64(in, "ownerUserId", "userId")
	if newOwner == 0 {
		newOwner = owner
	}
	q := `UPDATE payment_accounts SET user_id=` + s.store.Bind(1) + `,name=CASE WHEN ` + s.store.Bind(2) + `<>'' THEN ` + s.store.Bind(2) + ` ELSE name END,method_identifier=CASE WHEN ` + s.store.Bind(3) + `<>'' THEN ` + s.store.Bind(3) + ` ELSE method_identifier END,account_name=CASE WHEN ` + s.store.Bind(4) + `<>'' THEN ` + s.store.Bind(4) + ` ELSE account_name END,account_number=CASE WHEN ` + s.store.Bind(5) + `<>'' THEN ` + s.store.Bind(5) + ` ELSE account_number END,bank_name=CASE WHEN ` + s.store.Bind(6) + `<>'' THEN ` + s.store.Bind(6) + ` ELSE bank_name END,status=CASE WHEN ` + s.store.Bind(7) + `<>'' THEN ` + s.store.Bind(7) + ` ELSE status END,details_json=` + s.store.Bind(8) + `,updated_at=CURRENT_TIMESTAMP WHERE id=` + s.store.Bind(9) + ` AND tenant_id=` + s.store.Bind(10)
	_, e := s.store.DB.ExecContext(ctx, q, sqlNullInt64(newOwner), mapString(in, "name", "label"), mapString(in, "methodIdentifier"), mapString(in, "accountName"), mapString(in, "accountNumber"), mapString(in, "bankName"), mapString(in, "status"), rawJSON(d), id, u.TenantID)
	if e != nil {
		return e
	}
	accountType := strings.ToLower(firstNonEmpty(mapString(d, "accountType"), "personal"))
	if accountType != "personal" && accountType != "merchant" && accountType != "agent" {
		return fmt.Errorf("invalid accountType")
	}
	_, e = s.store.DB.ExecContext(ctx, `UPDATE payment_accounts SET account_type=`+s.store.Bind(1)+`,receive_daily_limit=`+s.store.Bind(2)+`,send_daily_limit=`+s.store.Bind(3)+`,receive_monthly_limit=`+s.store.Bind(4)+`,send_monthly_limit=`+s.store.Bind(5)+`,charge_rules_json=`+s.store.Bind(6)+`,commission_rules_json=`+s.store.Bind(7)+` WHERE id=`+s.store.Bind(8)+` AND tenant_id=`+s.store.Bind(9), accountType, mapFloat(d, "receiveDailyLimit", "receiveLimit"), mapFloat(d, "sendDailyLimit", "sendLimit"), mapFloat(d, "receiveMonthlyLimit"), mapFloat(d, "sendMonthlyLimit"), rawJSON(firstMapValue(d, "chargeRules", "rules")), rawJSON(firstMapValue(d, "commissionRules")), id, u.TenantID)
	return e
}
func (s *Server) paymentAccountDelete(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	var raw string
	if err := s.store.DB.QueryRowContext(r.Context(), `SELECT details_json FROM payment_accounts WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` AND status<>'deleted'`, id, u.TenantID).Scan(&raw); err != nil {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	balance := s.currentPaymentBalance(r.Context(), id, jsonMap(raw))
	if balance > 0.0000001 || balance < -0.0000001 {
		writeJSON(w, 409, envelope{"error": "payment_account_nonzero_balance", "balance": balance})
		return
	}
	var pending int64
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM payment_splits WHERE tenant_id=`+s.store.Bind(1)+` AND payment_account_id=`+s.store.Bind(2)+` AND status NOT IN ('completed','cancelled','deleted')`, u.TenantID, id).Scan(&pending)
	if pending > 0 {
		writeJSON(w, 409, envelope{"error": "payment_account_has_pending_splits", "count": pending})
		return
	}
	_, e := s.store.DB.ExecContext(r.Context(), `UPDATE payment_accounts SET status='deleted',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), id, u.TenantID)
	if e != nil {
		replyDBError(w, e)
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "payment_account_deleted", "payment_account", fmt.Sprint(id), r, nil)
	writeJSON(w, 200, map[string]any{"ok": true})
}
func (s *Server) paymentAccountsBulkCreate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	common, _ := in["common"].(map[string]any)
	arr := extractSlice(in["accounts"])
	var items []map[string]any
	for _, v := range arr {
		m, ok := v.(map[string]any)
		if !ok {
			continue
		}
		merged := mergeMaps(common, m)
		item, e := s.createPaymentAccount(r.Context(), u, merged)
		if e != nil {
			writeJSON(w, 422, envelope{"error": "bulk_create_failed", "message": e.Error()})
			return
		}
		items = append(items, item)
	}
	writeJSON(w, 201, map[string]any{"ok": true, "items": items, "created": len(items)})
}
func idsFromPayload(in map[string]any) []int64 { return extractIntArray(in["ids"]) }
func (s *Server) paymentAccountsBulkPatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	changes, _ := in["changes"].(map[string]any)
	ids := idsFromPayload(in)
	for _, id := range ids {
		_ = s.patchPaymentAccount(r.Context(), u, id, changes)
	}
	writeJSON(w, 200, map[string]any{"ok": true, "updated": len(ids)})
}
func (s *Server) paymentAccountsBulkDelete(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	ids := idsFromPayload(in)
	deleted := 0
	blocked := []map[string]any{}
	for _, id := range ids {
		var raw string
		if err := s.store.DB.QueryRowContext(r.Context(), `SELECT details_json FROM payment_accounts WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` AND status<>'deleted'`, id, u.TenantID).Scan(&raw); err != nil {
			blocked = append(blocked, map[string]any{"id": id, "error": "not_found"})
			continue
		}
		balance := s.currentPaymentBalance(r.Context(), id, jsonMap(raw))
		if balance > 0.0000001 || balance < -0.0000001 {
			blocked = append(blocked, map[string]any{"id": id, "error": "payment_account_nonzero_balance", "balance": balance})
			continue
		}
		var pending int64
		_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM payment_splits WHERE tenant_id=`+s.store.Bind(1)+` AND payment_account_id=`+s.store.Bind(2)+` AND status NOT IN ('completed','cancelled','deleted')`, u.TenantID, id).Scan(&pending)
		if pending > 0 {
			blocked = append(blocked, map[string]any{"id": id, "error": "payment_account_has_pending_splits", "count": pending})
			continue
		}
		res, err := s.store.DB.ExecContext(r.Context(), `UPDATE payment_accounts SET status='deleted',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` AND status<>'deleted'`, id, u.TenantID)
		if err != nil {
			blocked = append(blocked, map[string]any{"id": id, "error": "database"})
			continue
		}
		n, _ := res.RowsAffected()
		if n > 0 {
			deleted++
			s.svc.Audit(r.Context(), u.TenantID, u.ID, "payment_account_deleted", "payment_account", fmt.Sprint(id), r, map[string]any{"bulk": true})
		}
	}
	writeJSON(w, 200, map[string]any{"ok": len(blocked) == 0, "deleted": deleted, "blocked": blocked})
}

func (s *Server) paymentAccountAdjust(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	var tenant int64
	if s.store.DB.QueryRowContext(r.Context(), `SELECT tenant_id FROM payment_accounts WHERE id=`+s.store.Bind(1), id).Scan(&tenant) != nil || tenant != u.TenantID {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	amount := mapFloat(in, "amount")
	if amount == 0 {
		writeJSON(w, 422, envelope{"error": "amount required"})
		return
	}
	dir := strings.ToLower(firstNonEmpty(mapString(in, "direction"), func() string {
		if amount >= 0 {
			return "receive"
		}
		return "send"
	}()))
	e := s.appendPaymentLedger(r.Context(), u.TenantID, id, u.ID, mapInt64(in, "orderId"), firstNonEmpty(mapString(in, "type"), "manual_adjustment"), dir, amount, mapString(in, "reference"), mapString(in, "note"), in)
	if e != nil {
		replyDBError(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
func (s *Server) ledgersList(w http.ResponseWriter, r *http.Request, u ctxUser) {
	accountID := asInt64(requestString(r, "accountId"))
	q := `SELECT l.id,l.payment_account_id,l.user_id,COALESCE(u.name,''),l.order_id,l.entry_type,l.direction,l.amount,l.balance_before,l.balance_after,l.reference,l.note,l.created_at,COALESCE(p.account_number,''),COALESCE(o.external_order_no,'') FROM payment_account_ledger l JOIN payment_accounts p ON p.id=l.payment_account_id LEFT JOIN users u ON u.id=l.user_id LEFT JOIN orders o ON o.id=l.order_id WHERE l.tenant_id=` + s.store.Bind(1)
	args := []any{u.TenantID}
	if accountID > 0 {
		q += ` AND l.payment_account_id=` + s.store.Bind(2)
		args = append(args, accountID)
	}
	q += ` ORDER BY l.id DESC LIMIT 500`
	rows, e := s.store.DB.QueryContext(r.Context(), q, args...)
	if e != nil {
		replyDBError(w, e)
		return
	}
	defer rows.Close()
	var items []map[string]any
	for rows.Next() {
		var id, pa, uid, oid int64
		var un, typ, dir, ref, note, num, ono string
		var amt, bf, af float64
		var at time.Time
		if rows.Scan(&id, &pa, &uid, &un, &oid, &typ, &dir, &amt, &bf, &af, &ref, &note, &at, &num, &ono) == nil {
			items = append(items, map[string]any{"id": id, "paymentAccountId": pa, "account": map[string]any{"id": pa, "accountNumber": num}, "agent": func() any {
				if uid <= 0 {
					return nil
				}
				return map[string]any{"id": uid, "name": un}
			}(), "orderId": func() any {
				if oid <= 0 {
					return nil
				}
				return oid
			}(), "order": func() any {
				if oid <= 0 {
					return nil
				}
				return map[string]any{"id": oid, "orderNo": ono}
			}(), "type": typ, "direction": dir, "amount": amt, "balanceBefore": bf, "balanceAfter": af, "reference": ref, "note": note, "createdAt": at})
		}
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func (s *Server) routingList(w http.ResponseWriter, r *http.Request, u ctxUser) {
	rows, e := s.store.DB.QueryContext(r.Context(), `SELECT id,name,priority,enabled,conditions_json,actions_json,created_at,updated_at FROM routing_rules WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY priority,id`, u.TenantID)
	if e != nil {
		replyDBError(w, e)
		return
	}
	defer rows.Close()
	var items []map[string]any
	for rows.Next() {
		var id int64
		var name, craw, araw string
		var pri int
		var en bool
		var ca, ua time.Time
		if rows.Scan(&id, &name, &pri, &en, &craw, &araw, &ca, &ua) == nil {
			c := jsonMap(craw)
			a := jsonMap(araw)
			agentID := mapInt64(a, "agentId", "userId")
			methodName := mapString(c, "paymentMethodName", "method")
			items = append(items, map[string]any{"id": id, "name": name, "priority": pri, "enabled": en, "conditions": c, "actions": a, "method": map[string]any{"id": mapInt64(c, "paymentMethodId"), "name": methodName}, "agent": func() any {
				if agentID <= 0 {
					return nil
				}
				return map[string]any{"id": agentID, "name": s.listUserName(r.Context(), agentID)}
			}(), "minOrderAmount": mapFloat(c, "minOrderAmount"), "maxOrderAmount": mapFloat(c, "maxOrderAmount"), "capacityGuard": mapBool(c, "capacityGuard"), "maxActiveOrders": mapInt64(c, "maxActiveOrders"), "note": mapString(a, "note"), "createdAt": ca, "updatedAt": ua})
		}
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func routeData(in map[string]any) (string, int, bool, map[string]any, map[string]any) {
	name := firstNonEmpty(mapString(in, "name"), "Routing Rule")
	pri := int(mapInt64(in, "priority"))
	if pri <= 0 {
		pri = 100
	}
	en := true
	if _, ok := in["enabled"]; ok {
		en = mapBool(in, "enabled")
	}
	c := map[string]any{"paymentMethodId": mapInt64(in, "paymentMethodId"), "paymentMethodName": mapString(in, "paymentMethodName", "methodName"), "minOrderAmount": mapFloat(in, "minOrderAmount"), "maxOrderAmount": mapFloat(in, "maxOrderAmount"), "capacityGuard": mapBool(in, "capacityGuard"), "maxActiveOrders": mapInt64(in, "maxActiveOrders")}
	a := map[string]any{"agentId": mapInt64(in, "agentId", "userId"), "note": mapString(in, "note")}
	if x, ok := in["conditions"].(map[string]any); ok {
		c = mergeMaps(c, x)
	}
	if x, ok := in["actions"].(map[string]any); ok {
		a = mergeMaps(a, x)
	}
	return name, pri, en, c, a
}
func (s *Server) routingCreate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	n, p, e, c, a := routeData(in)
	pg := `INSERT INTO routing_rules(tenant_id,name,priority,enabled,conditions_json,actions_json,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`
	my := `INSERT INTO routing_rules(tenant_id,name,priority,enabled,conditions_json,actions_json,created_at,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
	id, err := s.insertID(r.Context(), pg, my, u.TenantID, n, p, e, rawJSON(c), rawJSON(a))
	if err != nil {
		replyDBError(w, err)
		return
	}
	writeJSON(w, 201, map[string]any{"ok": true, "id": id})
}
func (s *Server) routingPatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	n, p, e, c, a := routeData(in)
	_, err := s.store.DB.ExecContext(r.Context(), `UPDATE routing_rules SET name=`+s.store.Bind(1)+`,priority=`+s.store.Bind(2)+`,enabled=`+s.store.Bind(3)+`,conditions_json=`+s.store.Bind(4)+`,actions_json=`+s.store.Bind(5)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(6)+` AND tenant_id=`+s.store.Bind(7), n, p, e, rawJSON(c), rawJSON(a), id, u.TenantID)
	if err != nil {
		replyDBError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
func (s *Server) routingDelete(w http.ResponseWriter, r *http.Request, u ctxUser) {
	_, _ = s.store.DB.ExecContext(r.Context(), `DELETE FROM routing_rules WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), parseID(r.PathValue("id")), u.TenantID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) offlineCandidates(w http.ResponseWriter, r *http.Request, u ctxUser) {
	wanted := asFloat(requestString(r, "amount"))
	per := asFloat(requestString(r, "perAccountLimit"))
	if per <= 0 {
		per = wanted
	}
	methodID := asInt64(requestString(r, "paymentMethodId"))
	search := strings.ToLower(requestString(r, "search"))
	rows, e := s.store.DB.QueryContext(r.Context(), `SELECT id,COALESCE(user_id,0),name,method_identifier,account_name,account_number,bank_name,status,details_json,created_at,updated_at FROM payment_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND status='active' ORDER BY id`, u.TenantID)
	if e != nil {
		replyDBError(w, e)
		return
	}
	defer rows.Close()
	remaining := wanted
	var items []map[string]any
	total := 0.0
	for rows.Next() {
		var id, owner int64
		var name, method, an, num, bank, status, raw string
		var ca, ua time.Time
		if rows.Scan(&id, &owner, &name, &method, &an, &num, &bank, &status, &raw, &ca, &ua) != nil {
			continue
		}
		d := jsonMap(raw)
		if !s.canViewPaymentAccount(u, owner, d) {
			continue
		}
		if methodID > 0 && stableMethodID(strings.ToLower(method)) != methodID {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(strings.Join([]string{name, num, mapString(d, "label"), mapString(d, "serialNumber"), an}, " ")), search) {
			continue
		}
		var reserved int
		_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM offline_transaction_allocations a JOIN offline_transactions t ON t.id=a.offline_transaction_id WHERE t.tenant_id=`+s.store.Bind(1)+` AND t.status IN ('pending','partially_received','ready') AND t.payment_account_id=`+s.store.Bind(2), u.TenantID, id).Scan(&reserved)
		if reserved > 0 {
			continue
		}
		view := s.paymentAccountMap(r.Context(), u, id, owner, name, method, an, num, bank, status, raw, ca, ua)
		avail := asFloat(view["receiveAvailable"])
		suggest := minFloat(per, remaining, avail)
		if suggest < 0.01 {
			continue
		}
		view["suggestedAmount"] = suggest
		items = append(items, view)
		total += suggest
		remaining -= suggest
		if remaining <= 0 {
			break
		}
	}
	writeJSON(w, 200, map[string]any{"items": items, "suggestedTotal": total, "uncoveredAmount": max0(wanted - total)})
}
func minFloat(vs ...float64) float64 {
	if len(vs) == 0 {
		return 0
	}
	m := vs[0]
	for _, v := range vs[1:] {
		if v < m {
			m = v
		}
	}
	return m
}
func (s *Server) offlineCreate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	requested := mapFloat(in, "requestedAmount", "amount")
	if requested <= 0 {
		writeJSON(w, 422, envelope{"error": "requestedAmount required"})
		return
	}
	ids := extractIntArray(in["paymentAccountIds"])
	if len(ids) == 0 {
		writeJSON(w, 422, envelope{"error": "paymentAccountIds required"})
		return
	}
	ref := firstNonEmpty(mapString(in, "referenceNo"), fmt.Sprintf("OFF-%d", time.Now().UnixMilli()))
	payload := map[string]any{"requestedAmount": requested, "paymentMethodId": mapInt64(in, "paymentMethodId"), "counterpartyName": mapString(in, "counterpartyName"), "perAccountLimit": mapFloat(in, "perAccountLimit")}
	pg := `INSERT INTO offline_transactions(tenant_id,amount,currency,reference,note,status,payload_json,created_by,created_at,updated_at) VALUES($1,$2,'BDT',$3,$4,'pending',$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`
	my := `INSERT INTO offline_transactions(tenant_id,amount,currency,reference,note,status,payload_json,created_by,created_at,updated_at) VALUES(?,?,'BDT',?,?,'pending',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
	id, e := s.insertID(r.Context(), pg, my, u.TenantID, requested, ref, mapString(in, "note"), rawJSON(payload), u.ID)
	if e != nil {
		replyDBError(w, e)
		return
	}
	per := mapFloat(in, "perAccountLimit")
	if per <= 0 {
		per = requested
	}
	rem := requested
	for _, pa := range ids {
		amt := minFloat(per, rem)
		if amt <= 0 {
			break
		}
		// Allocation rows reference the child transaction; the child carries the payment-account id.
		// Create one child transaction per account to keep reservations indexed without changing the original feature contract.
		childPayload := map[string]any{"parentId": id, "plannedAmount": amt, "paymentAccountId": pa}
		pgc := `INSERT INTO offline_transactions(tenant_id,payment_account_id,amount,currency,reference,note,status,payload_json,created_by,created_at,updated_at) VALUES($1,$2,$3,'BDT',$4,'','pending',$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`
		myc := `INSERT INTO offline_transactions(tenant_id,payment_account_id,amount,currency,reference,note,status,payload_json,created_by,created_at,updated_at) VALUES(?,?,?,'BDT',?,'','pending',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
		child, _ := s.insertID(r.Context(), pgc, myc, u.TenantID, pa, amt, ref+fmt.Sprintf("-%d", pa), rawJSON(childPayload), u.ID)
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO offline_transaction_allocations(tenant_id,offline_transaction_id,amount,status,created_at) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`,`+s.store.Bind(3)+`,'reserved',CURRENT_TIMESTAMP)`, u.TenantID, child, amt)
		rem -= amt
	}
	writeJSON(w, 201, map[string]any{"ok": true, "id": id, "referenceNo": ref})
}

// offlineTransactionView folds reservation child rows back into the legacy UI shape.
func (s *Server) offlineTransactionView(ctx context.Context, u ctxUser, id int64, amount float64, ref, note, status, raw string, created time.Time) map[string]any {
	p := jsonMap(raw)
	rows, _ := s.store.DB.QueryContext(ctx, `SELECT t.id,t.payment_account_id,t.amount,t.status,t.payload_json,COALESCE(a.id,0),COALESCE(a.amount,0),COALESCE(a.status,'') FROM offline_transactions t LEFT JOIN offline_transaction_allocations a ON a.offline_transaction_id=t.id WHERE t.tenant_id=`+s.store.Bind(1)+` AND t.payload_json LIKE `+s.store.Bind(2)+` ORDER BY t.id`, u.TenantID, "%\"parentId\":"+fmt.Sprint(id)+"%")
	var alloc []map[string]any
	received := 0.0
	planned := 0.0
	if rows != nil {
		for rows.Next() {
			var child, pa, aid int64
			var plan, aamt float64
			var st, cr, ast string
			if rows.Scan(&child, &pa, &plan, &st, &cr, &aid, &aamt, &ast) != nil {
				continue
			}
			var name, method, an, num, bank, pstatus, praw string
			var owner int64
			var ca, ua time.Time
			_ = s.store.DB.QueryRowContext(ctx, `SELECT COALESCE(user_id,0),name,method_identifier,account_name,account_number,bank_name,status,details_json,created_at,updated_at FROM payment_accounts WHERE id=`+s.store.Bind(1), pa).Scan(&owner, &name, &method, &an, &num, &bank, &pstatus, &praw, &ca, &ua)
			account := s.paymentAccountMap(ctx, u, pa, owner, name, method, an, num, bank, pstatus, praw, ca, ua)
			rec := 0.0
			if ast == "received" {
				rec = aamt
			}
			planned += plan
			received += rec
			alloc = append(alloc, map[string]any{"id": aid, "childTransactionId": child, "paymentAccountId": pa, "plannedAmount": plan, "receivedAmount": rec, "remainingAmount": max0(plan - rec), "status": func() string {
				if rec >= plan {
					return "received"
				}
				return "reserved"
			}(), "account": account})
		}
		rows.Close()
	}
	methodID := mapInt64(p, "paymentMethodId")
	return map[string]any{"id": id, "referenceNo": ref, "requestedAmount": amount, "counterpartyName": mapString(p, "counterpartyName"), "paymentMethod": map[string]any{"id": methodID, "name": func() string {
		if len(alloc) > 0 {
			return asString(alloc[0]["account"].(map[string]any)["method"].(map[string]any)["name"])
		}
		return ""
	}()}, "note": note, "status": status, "allocations": alloc, "totalPlanned": planned, "totalReceived": received, "canCancel": status != "finalized" && status != "cancelled", "finalizedOrderId": mapInt64(p, "finalizedOrderId"), "createdAt": created}
}
func (s *Server) offlineTransactions(w http.ResponseWriter, r *http.Request, u ctxUser) {
	rows, e := s.store.DB.QueryContext(r.Context(), `SELECT id,amount,reference,note,status,payload_json,created_at FROM offline_transactions WHERE tenant_id=`+s.store.Bind(1)+` AND payment_account_id IS NULL ORDER BY id DESC LIMIT 300`, u.TenantID)
	if e != nil {
		replyDBError(w, e)
		return
	}
	defer rows.Close()
	var items []map[string]any
	for rows.Next() {
		var id int64
		var amt float64
		var ref, note, st, raw string
		var ca time.Time
		if rows.Scan(&id, &amt, &ref, &note, &st, &raw, &ca) == nil {
			items = append(items, s.offlineTransactionView(r.Context(), u, id, amt, ref, note, st, raw, ca))
		}
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func (s *Server) offlineReceive(w http.ResponseWriter, r *http.Request, u ctxUser) {
	parent := parseID(r.PathValue("id"))
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	aid := mapInt64(in, "allocationId")
	amt := mapFloat(in, "amount")
	var child, pa int64
	var planned float64
	var st string
	e := s.store.DB.QueryRowContext(r.Context(), `SELECT a.offline_transaction_id,t.payment_account_id,t.amount,a.status FROM offline_transaction_allocations a JOIN offline_transactions t ON t.id=a.offline_transaction_id WHERE a.id=`+s.store.Bind(1)+` AND a.tenant_id=`+s.store.Bind(2), aid, u.TenantID).Scan(&child, &pa, &planned, &st)
	if e != nil {
		replyDBError(w, e)
		return
	}
	var childRaw string
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT payload_json FROM offline_transactions WHERE id=`+s.store.Bind(1), child).Scan(&childRaw)
	if mapInt64(jsonMap(childRaw), "parentId") != parent {
		writeJSON(w, 409, envelope{"error": "allocation_mismatch"})
		return
	}
	if amt <= 0 || amt > planned+0.00001 {
		writeJSON(w, 422, envelope{"error": "invalid_received_amount"})
		return
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE offline_transaction_allocations SET amount=`+s.store.Bind(1)+`,status='received' WHERE id=`+s.store.Bind(2), amt, aid)
	_ = s.appendPaymentLedger(r.Context(), u.TenantID, pa, u.ID, 0, "offline_receive", "receive", amt, fmt.Sprintf("offline:%d", parent), "Offline receipt", map[string]any{"allocationId": aid})
	writeJSON(w, 200, map[string]any{"ok": true})
}
func (s *Server) offlineFinalize(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	var requested float64
	var ref, note, status, raw string
	if s.store.DB.QueryRowContext(r.Context(), `SELECT amount,reference,note,status,payload_json FROM offline_transactions WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` AND payment_account_id IS NULL`, id, u.TenantID).Scan(&requested, &ref, &note, &status, &raw) != nil {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	view := s.offlineTransactionView(r.Context(), u, id, requested, ref, note, status, raw, time.Now())
	received := asFloat(view["totalReceived"])
	if received <= 0 {
		writeJSON(w, 422, envelope{"error": "nothing_received"})
		return
	}
	if received < requested && !mapBool(in, "allowPartial") {
		writeJSON(w, 409, envelope{"error": "partial_receipt", "received": received, "requested": requested})
		return
	}
	p := jsonMap(raw)
	no := "OFFLINE-" + fmt.Sprint(time.Now().UnixMilli())
	pg := `INSERT INTO orders(tenant_id,exchange_account_id,external_order_no,status,trade_type,asset,fiat,price,amount,total,counterparty_name,raw_json,order_source,external_status,payment_method_id,created_at,updated_at) VALUES($1,NULL,$2,'completed','SELL','LOCAL_GOODS','BDT',1,$3,$3,$4,$5,'offline','OFFLINE_LOCAL',$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`
	my := `INSERT INTO orders(tenant_id,exchange_account_id,external_order_no,status,trade_type,asset,fiat,price,amount,total,counterparty_name,raw_json,order_source,external_status,payment_method_id,created_at,updated_at) VALUES(?,NULL,?,'completed','SELL','LOCAL_GOODS','BDT',1,?,?,?,'offline','OFFLINE_LOCAL',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
	oid, e := s.insertID(r.Context(), pg, my, u.TenantID, no, received, mapString(p, "counterpartyName"), rawJSON(map[string]any{"offlineTransactionId": id}), mapInt64(p, "paymentMethodId"))
	if e != nil {
		replyDBError(w, e)
		return
	}
	p["finalizedOrderId"] = oid
	newSt := "finalized"
	if received < requested {
		newSt = "finalized_partial"
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE offline_transactions SET status=`+s.store.Bind(1)+`,payload_json=`+s.store.Bind(2)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3), newSt, rawJSON(p), id)
	o, _ := s.getOrder(r.Context(), u, oid, "orders.view")
	writeJSON(w, 200, map[string]any{"ok": true, "order": s.orderMap(r.Context(), u, o, true)})
}
func (s *Server) offlineCancel(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE offline_transactions SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), id, u.TenantID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) approvalsList(w http.ResponseWriter, r *http.Request, u ctxUser) {
	status := firstNonEmpty(requestString(r, "status"), "pending")
	rows, e := s.store.DB.QueryContext(r.Context(), `SELECT a.id,a.requested_by,COALESCE(ru.name,''),a.approved_by,COALESCE(au.name,''),a.kind,a.payload_json,a.status,a.created_at,a.updated_at FROM approvals a LEFT JOIN users ru ON ru.id=a.requested_by LEFT JOIN users au ON au.id=a.approved_by WHERE a.tenant_id=`+s.store.Bind(1)+` AND a.status=`+s.store.Bind(2)+` ORDER BY a.id DESC`, u.TenantID, status)
	if e != nil {
		replyDBError(w, e)
		return
	}
	defer rows.Close()
	var items []map[string]any
	for rows.Next() {
		var id, rb, ab int64
		var rn, an, kind, raw, st string
		var ca, ua time.Time
		if rows.Scan(&id, &rb, &rn, &ab, &an, &kind, &raw, &st, &ca, &ua) == nil {
			p := jsonMap(raw)
			oid := mapInt64(p, "orderId")
			var order any
			if oid > 0 {
				if o, e := s.getOrder(r.Context(), u, oid, "orders.view"); e == nil {
					order = s.orderMap(r.Context(), u, o, false)
				}
			}
			items = append(items, map[string]any{"id": id, "kind": kind, "action": firstNonEmpty(mapString(p, "action"), kind), "orderId": oid, "order": order, "orderNo": func() string {
				if m, ok := order.(map[string]any); ok {
					return asString(m["orderNo"])
				}
				return ""
			}(), "issues": firstMapValue(p, "issues"), "summarySnapshot": firstMapValue(p, "summarySnapshot"), "requestedBy": rb, "requestedByName": rn, "requestedByUser": map[string]any{"id": rb, "name": rn}, "approvedBy": ab, "approvedByName": an, "status": st, "requestedAt": ca, "updatedAt": ua, "payload": p})
		}
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func (s *Server) approvalDecision(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	decision := strings.ToLower(firstNonEmpty(mapString(in, "decision", "status"), "approved"))
	if decision != "approved" && decision != "rejected" {
		writeJSON(w, 422, envelope{"error": "invalid_decision"})
		return
	}
	var requestedBy int64
	var raw, current string
	if err := s.store.DB.QueryRowContext(r.Context(), `SELECT COALESCE(requested_by,0),payload_json,status FROM approvals WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), id, u.TenantID).Scan(&requestedBy, &raw, &current); err != nil {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	if current != "pending" {
		writeJSON(w, 409, envelope{"error": "approval_already_decided", "status": current})
		return
	}
	if requestedBy == u.ID && !u.IsOwner && !u.IsSuperAdmin {
		writeJSON(w, 403, envelope{"error": "self_approval_not_allowed"})
		return
	}
	payload := jsonMap(raw)
	payload["decisionNote"] = strings.TrimSpace(mapString(in, "note", "decisionNote"))
	payload["decisionAt"] = time.Now().UTC()
	res, e := s.store.DB.ExecContext(r.Context(), `UPDATE approvals SET status=`+s.store.Bind(1)+`,approved_by=`+s.store.Bind(2)+`,payload_json=`+s.store.Bind(3)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(4)+` AND tenant_id=`+s.store.Bind(5)+` AND status='pending'`, decision, u.ID, rawJSON(payload), id, u.TenantID)
	if e != nil {
		replyDBError(w, e)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, 409, envelope{"error": "approval_already_decided_or_missing"})
		return
	}
	if requestedBy > 0 {
		s.svc.Notify(r.Context(), u.TenantID, requestedBy, "approval", "Approval "+decision, fmt.Sprintf("Your request #%d was %s.", id, decision), map[string]any{"approvalId": id, "orderId": mapInt64(payload, "orderId"), "category": "accounting"})
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "approval."+decision, "approval", fmt.Sprint(id), r, map[string]any{"requestedBy": requestedBy})
	writeJSON(w, 200, map[string]any{"ok": true, "status": decision})
}

func (s *Server) saveProofDataURL(ctx context.Context, u ctxUser, orderID int64, dataURL, name string) (int64, error) {
	comma := strings.Index(dataURL, ",")
	header := ""
	enc := dataURL
	if comma >= 0 {
		header = dataURL[:comma]
		enc = dataURL[comma+1:]
	}
	b, e := base64.StdEncoding.DecodeString(enc)
	if e != nil {
		return 0, e
	}
	if int64(len(b)) > s.cfg.MaxUploadBytes {
		return 0, fmt.Errorf("proof too large")
	}
	mimeType := "image/jpeg"
	if strings.HasPrefix(header, "data:") {
		mimeType = strings.TrimPrefix(strings.Split(header, ";")[0], "data:")
	}
	ext, _ := mime.ExtensionsByType(mimeType)
	suffix := ".bin"
	if len(ext) > 0 {
		suffix = ext[0]
	}
	if name == "" {
		name = "proof" + suffix
	}
	dir := filepath.Join(s.cfg.UploadDir, fmt.Sprint(u.TenantID), "proofs")
	if e = os.MkdirAll(dir, 0750); e != nil {
		return 0, e
	}
	key := fmt.Sprintf("%d-%d%s", orderID, time.Now().UnixNano(), suffix)
	path := filepath.Join(dir, key)
	if e = os.WriteFile(path, b, 0640); e != nil {
		return 0, e
	}
	pg := `INSERT INTO proofs(tenant_id,order_id,uploaded_by,file_key,file_name,mime_type,size_bytes,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP) RETURNING id`
	my := `INSERT INTO proofs(tenant_id,order_id,uploaded_by,file_key,file_name,mime_type,size_bytes,created_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`
	id, e := s.insertID(ctx, pg, my, u.TenantID, orderID, u.ID, path, name, mimeType, len(b))
	if e == nil {
		s.updateUsage(ctx, u.TenantID, "storage_bytes", int64(len(b)))
	}
	return id, e
}
func (s *Server) proofGet(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	var tid, oid int64
	var key, name, mimeType string
	if s.store.DB.QueryRowContext(r.Context(), `SELECT tenant_id,COALESCE(order_id,0),file_key,file_name,mime_type FROM proofs WHERE id=`+s.store.Bind(1), id).Scan(&tid, &oid, &key, &name, &mimeType) != nil || tid != u.TenantID {
		http.NotFound(w, r)
		return
	}
	if oid > 0 {
		if _, e := s.getOrder(r.Context(), u, oid, "orders.view"); e != nil {
			http.Error(w, "forbidden", 403)
			return
		}
	}
	w.Header().Set("Content-Type", firstNonEmpty(mimeType, "application/octet-stream"))
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", name))
	http.ServeFile(w, r, key)
}
