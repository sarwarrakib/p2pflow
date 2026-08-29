package httpapi

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"
)

func (s *Server) superTenantDetail(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	tid := parseID(r.PathValue("id"))
	if tid <= 0 {
		writeJSON(w, 422, envelope{"error": "invalid_tenant"})
		return
	}
	var name, slug, status string
	var planID sql.NullInt64
	var created, updated time.Time
	if err := s.store.DB.QueryRowContext(r.Context(), `SELECT name,slug,status,plan_id,created_at,updated_at FROM tenants WHERE id=`+s.store.Bind(1), tid).Scan(&name, &slug, &status, &planID, &created, &updated); err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, 404, envelope{"error": "not_found"})
			return
		}
		replyDBError(w, err)
		return
	}
	access := s.tenantAccess(r.Context(), tid)
	writeJSON(w, 200, map[string]any{
		"tenant":       map[string]any{"id": tid, "name": name, "slug": slug, "status": status, "planId": nullInt64(planID), "createdAt": created, "updatedAt": updated},
		"subscription": s.currentSubscription(r.Context(), tid),
		"usage":        s.tenantUsage(r.Context(), tid),
		"entitlements": access.Entitlements,
		"invoices":     s.invoiceRows(r.Context(), tid, 100),
		"payments":     s.paymentRows(r.Context(), tid, 100),
	})
}

func nullInt64(v sql.NullInt64) any {
	if v.Valid {
		return v.Int64
	}
	return nil
}

func (s *Server) superEntitlementOverride(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	tid := parseID(r.PathValue("id"))
	key := strings.ToLower(strings.TrimSpace(r.PathValue("key")))
	if tid <= 0 || !validEntitlementKey(key) {
		writeJSON(w, 422, envelope{"error": "invalid_entitlement"})
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	value, ok := in["value"]
	if !ok {
		writeJSON(w, 422, envelope{"error": "value_required"})
		return
	}
	reason := strings.TrimSpace(mapString(in, "reason"))
	valueRaw := rawJSON(value)
	var err error
	if s.store.Driver == "postgres" {
		_, err = s.store.DB.ExecContext(r.Context(), `INSERT INTO tenant_entitlement_overrides(tenant_id,entitlement_key,value_json,reason,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,entitlement_key) DO UPDATE SET value_json=EXCLUDED.value_json,reason=EXCLUDED.reason,updated_by=EXCLUDED.updated_by,updated_at=CURRENT_TIMESTAMP`, tid, key, valueRaw, reason, u.ID)
	} else {
		_, err = s.store.DB.ExecContext(r.Context(), `INSERT INTO tenant_entitlement_overrides(tenant_id,entitlement_key,value_json,reason,updated_by,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json),reason=VALUES(reason),updated_by=VALUES(updated_by),updated_at=CURRENT_TIMESTAMP`, tid, key, valueRaw, reason, u.ID)
	}
	if err != nil {
		replyDBError(w, err)
		return
	}
	s.svc.Audit(r.Context(), tid, u.ID, "superadmin.entitlement_override", "tenant", fmt.Sprint(tid), r, map[string]any{"key": key, "value": value, "reason": reason})
	writeJSON(w, 200, map[string]any{"ok": true, "entitlements": s.tenantAccess(r.Context(), tid).Entitlements})
}

func (s *Server) superEntitlementDelete(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	tid := parseID(r.PathValue("id"))
	key := strings.ToLower(strings.TrimSpace(r.PathValue("key")))
	if tid <= 0 || !validEntitlementKey(key) {
		writeJSON(w, 422, envelope{"error": "invalid_entitlement"})
		return
	}
	if _, err := s.store.DB.ExecContext(r.Context(), `DELETE FROM tenant_entitlement_overrides WHERE tenant_id=`+s.store.Bind(1)+` AND entitlement_key=`+s.store.Bind(2), tid, key); err != nil {
		replyDBError(w, err)
		return
	}
	s.svc.Audit(r.Context(), tid, u.ID, "superadmin.entitlement_override_removed", "tenant", fmt.Sprint(tid), r, map[string]any{"key": key})
	writeJSON(w, 200, map[string]any{"ok": true, "entitlements": s.tenantAccess(r.Context(), tid).Entitlements})
}

func validEntitlementKey(key string) bool {
	if key == "" || len(key) > 140 {
		return false
	}
	for _, ch := range key {
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '-' || ch == '.' {
			continue
		}
		return false
	}
	return true
}

func (s *Server) superInvoiceCreate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	tid := parseID(r.PathValue("id"))
	if tid <= 0 {
		writeJSON(w, 422, envelope{"error": "invalid_tenant"})
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	amount := mapFloat(in, "amount")
	if amount <= 0 {
		writeJSON(w, 422, envelope{"error": "amount_required"})
		return
	}
	typ := strings.ToLower(strings.TrimSpace(mapString(in, "type")))
	if typ == "" {
		typ = "manual"
	}
	currency := strings.ToUpper(strings.TrimSpace(mapString(in, "currency")))
	if currency == "" {
		currency = s.cfg.BillingCurrency
	}
	dueDays := mapInt64(in, "dueDays")
	if dueDays < 0 || dueDays > 365 {
		writeJSON(w, 422, envelope{"error": "invalid_due_days"})
		return
	}
	if dueDays == 0 {
		dueDays = 7
	}
	var sid int64
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT id FROM subscriptions WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY id DESC LIMIT 1`, tid).Scan(&sid)
	var invoiceID int64
	err := s.svc.WithTx(r.Context(), func(tx *sql.Tx) error {
		key := fmt.Sprintf("super:%d:%d:%d", tid, u.ID, time.Now().UTC().UnixNano())
		id, err := s.insertInvoiceTx(r.Context(), tx, tid, sid, typ, currency, amount, time.Now().UTC().Add(time.Duration(dueDays)*24*time.Hour), nil, nil, key)
		if err != nil {
			return err
		}
		invoiceID = id
		return nil
	})
	if err != nil {
		replyDBError(w, err)
		return
	}
	s.svc.Audit(r.Context(), tid, u.ID, "superadmin.invoice_created", "invoice", fmt.Sprint(invoiceID), r, map[string]any{"type": typ, "amount": amount, "currency": currency})
	writeJSON(w, 201, map[string]any{"ok": true, "id": invoiceID})
}

func (s *Server) superReconciliation(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	status := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status")))
	q := `SELECT x.id,COALESCE(x.tenant_id,0),COALESCE(t.name,''),COALESCE(x.invoice_id,0),COALESCE(x.payment_id,0),x.provider,x.provider_event_id,x.issue_type,x.expected_json,x.actual_json,x.status,x.resolution_note,COALESCE(x.resolved_by,0),x.resolved_at,x.created_at,x.updated_at FROM billing_reconciliation_issues x LEFT JOIN tenants t ON t.id=x.tenant_id`
	args := []any{}
	if status != "" && status != "all" {
		q += ` WHERE x.status=` + s.store.Bind(1)
		args = append(args, status)
	}
	q += ` ORDER BY x.id DESC LIMIT 1000`
	rows, err := s.store.DB.QueryContext(r.Context(), q, args...)
	if err != nil {
		replyDBError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, tid, iid, pid, resolvedBy int64
		var tenant, provider, eventID, issue, expected, actual, st, note string
		var resolved sql.NullTime
		var created, updated time.Time
		if rows.Scan(&id, &tid, &tenant, &iid, &pid, &provider, &eventID, &issue, &expected, &actual, &st, &note, &resolvedBy, &resolved, &created, &updated) == nil {
			items = append(items, map[string]any{"id": id, "tenantId": tid, "tenant": tenant, "invoiceId": iid, "paymentId": pid, "provider": provider, "providerEventId": eventID, "issueType": issue, "expected": jsonMap(expected), "actual": jsonMap(actual), "status": st, "resolutionNote": note, "resolvedBy": resolvedBy, "resolvedAt": nullTime(resolved), "createdAt": created, "updatedAt": updated})
		}
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func (s *Server) superReconciliationResolve(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	id := parseID(r.PathValue("id"))
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	note := strings.TrimSpace(mapString(in, "note"))
	status := strings.ToLower(strings.TrimSpace(mapString(in, "status")))
	if status == "" {
		status = "resolved"
	}
	if status != "resolved" && status != "ignored" {
		writeJSON(w, 422, envelope{"error": "invalid_status"})
		return
	}
	var tid sql.NullInt64
	if err := s.store.DB.QueryRowContext(r.Context(), `SELECT tenant_id FROM billing_reconciliation_issues WHERE id=`+s.store.Bind(1), id).Scan(&tid); err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, 404, envelope{"error": "not_found"})
			return
		}
		replyDBError(w, err)
		return
	}
	if _, err := s.store.DB.ExecContext(r.Context(), `UPDATE billing_reconciliation_issues SET status=`+s.store.Bind(1)+`,resolution_note=`+s.store.Bind(2)+`,resolved_by=`+s.store.Bind(3)+`,resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(4), status, note, u.ID, id); err != nil {
		replyDBError(w, err)
		return
	}
	s.svc.Audit(r.Context(), tid.Int64, u.ID, "superadmin.billing_reconciliation_resolved", "billing_reconciliation", fmt.Sprint(id), r, map[string]any{"status": status, "note": note})
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) superBillingEvents(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	rows, err := s.store.DB.QueryContext(r.Context(), `SELECT id,provider,provider_event_id,COALESCE(tenant_id,0),event_type,payload_json,status,attempt_count,last_error,processed_at,created_at FROM billing_webhook_events ORDER BY id DESC LIMIT 1000`)
	if err != nil {
		replyDBError(w, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, tid, attempts int64
		var provider, eventID, eventType, raw, status, lastError string
		var processed sql.NullTime
		var created time.Time
		if rows.Scan(&id, &provider, &eventID, &tid, &eventType, &raw, &status, &attempts, &lastError, &processed, &created) == nil {
			items = append(items, map[string]any{"id": id, "provider": provider, "providerEventId": eventID, "tenantId": tid, "eventType": eventType, "payload": jsonMap(raw), "status": status, "attemptCount": attempts, "lastError": lastError, "processedAt": nullTime(processed), "createdAt": created})
		}
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
