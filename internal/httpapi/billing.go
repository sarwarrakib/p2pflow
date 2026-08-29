package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"
)

var (
	errBillingAmountMismatch    = errors.New("billing amount mismatch")
	errBillingCurrencyMismatch  = errors.New("billing currency mismatch")
	errBillingInvoiceNotPayable = errors.New("invoice is not payable")
)

func (s *Server) registerBillingRoutes() {
	s.mux.HandleFunc("GET /api/billing", s.requireUser(s.billingOverview))
	s.mux.HandleFunc("GET /api/billing/invoices", s.requireUser(s.billingInvoices))
	s.mux.HandleFunc("GET /api/billing/payments", s.requireUser(s.billingPayments))
	s.mux.HandleFunc("POST /api/billing/change-plan", s.requireUser(s.billingChangePlan))
	s.mux.HandleFunc("POST /api/billing/checkout", s.requireUser(s.billingCheckout))
	s.mux.HandleFunc("POST /api/billing/cancel", s.requireUser(s.billingCancel))
	s.mux.HandleFunc("POST /api/billing/resume", s.requireUser(s.billingResume))
	s.mux.HandleFunc("POST /api/billing/webhook/{provider}", s.billingWebhook)
	s.mux.HandleFunc("GET /api/superadmin/summary", s.requireUser(s.superSummary))
	s.mux.HandleFunc("GET /api/superadmin/tenants", s.requireUser(s.superTenants))
	s.mux.HandleFunc("GET /api/superadmin/invoices", s.requireUser(s.superInvoices))
	s.mux.HandleFunc("GET /api/superadmin/payments", s.requireUser(s.superPayments))
	s.mux.HandleFunc("PATCH /api/superadmin/tenants/{id}", s.requireUser(s.superTenantPatch))
	s.mux.HandleFunc("GET /api/superadmin/tenants/{id}", s.requireUser(s.superTenantDetail))
	s.mux.HandleFunc("PUT /api/superadmin/tenants/{id}/entitlements/{key}", s.requireUser(s.superEntitlementOverride))
	s.mux.HandleFunc("DELETE /api/superadmin/tenants/{id}/entitlements/{key}", s.requireUser(s.superEntitlementDelete))
	s.mux.HandleFunc("POST /api/superadmin/tenants/{id}/invoices", s.requireUser(s.superInvoiceCreate))
	s.mux.HandleFunc("GET /api/superadmin/reconciliation", s.requireUser(s.superReconciliation))
	s.mux.HandleFunc("POST /api/superadmin/reconciliation/{id}/resolve", s.requireUser(s.superReconciliationResolve))
	s.mux.HandleFunc("GET /api/superadmin/billing-events", s.requireUser(s.superBillingEvents))
	s.mux.HandleFunc("GET /api/superadmin/plans", s.requireUser(s.superPlans))
	s.mux.HandleFunc("POST /api/superadmin/plans", s.requireUser(s.superPlanCreate))
	s.mux.HandleFunc("PATCH /api/superadmin/plans/{id}", s.requireUser(s.superPlanPatch))
	s.mux.HandleFunc("POST /api/superadmin/invoices/{id}/mark-paid", s.requireUser(s.superInvoiceMarkPaid))
}
func (s *Server) requireSuper(w http.ResponseWriter, u ctxUser) bool {
	if !u.IsSuperAdmin {
		writeJSON(w, 403, envelope{"error": "superadmin_required"})
		return false
	}
	return true
}
func (s *Server) currentSubscription(ctx context.Context, tid int64) map[string]any {
	q := `SELECT s.id,s.status,s.provider,s.provider_subscription_id,s.current_period_start,s.current_period_end,s.cancel_at_period_end,s.setup_fee_paid_at,s.billing_cycle_anchor,s.next_invoice_at,s.past_due_since,s.grace_until,s.cancelled_at,p.id,p.code,p.name,p.monthly_price,p.setup_fee,p.max_users,p.max_exchange_accounts,p.entitlements_json FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.tenant_id=` + s.store.Bind(1) + ` ORDER BY s.id DESC LIMIT 1`
	var sid, pid, maxu, maxa int64
	var status, provider, psid, code, name, raw string
	var start, end, setupPaid, anchor, nextInvoice, pastDue, grace, cancelled sql.NullTime
	var cancel bool
	var monthly, setup float64
	if s.store.DB.QueryRowContext(ctx, q, tid).Scan(&sid, &status, &provider, &psid, &start, &end, &cancel, &setupPaid, &anchor, &nextInvoice, &pastDue, &grace, &cancelled, &pid, &code, &name, &monthly, &setup, &maxu, &maxa, &raw) != nil {
		return map[string]any{}
	}
	entitlements := jsonMap(raw)
	access := s.tenantAccess(ctx, tid)
	if access.Entitlements != nil {
		entitlements = access.Entitlements
	}
	return map[string]any{
		"id": sid, "status": status, "provider": provider, "providerSubscriptionId": psid,
		"currentPeriodStart": nullTime(start), "currentPeriodEnd": nullTime(end), "cancelAtPeriodEnd": cancel,
		"setupFeePaidAt": nullTime(setupPaid), "billingCycleAnchor": nullTime(anchor), "nextInvoiceAt": nullTime(nextInvoice),
		"pastDueSince": nullTime(pastDue), "graceUntil": nullTime(grace), "cancelledAt": nullTime(cancelled),
		"plan": map[string]any{"id": pid, "code": code, "name": name, "monthlyPrice": monthly, "setupFee": setup, "maxUsers": maxu, "maxExchangeAccounts": maxa, "entitlements": entitlements},
	}
}
func nullTime(v sql.NullTime) any {
	if v.Valid {
		return v.Time
	}
	return nil
}
func (s *Server) billingOverview(w http.ResponseWriter, r *http.Request, u ctxUser) {
	usage := s.tenantUsage(r.Context(), u.TenantID)
	var tenantName, status string
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT name,status FROM tenants WHERE id=`+s.store.Bind(1), u.TenantID).Scan(&tenantName, &status)
	sub := s.currentSubscription(r.Context(), u.TenantID)
	plan, _ := sub["plan"].(map[string]any)
	entitlements, _ := plan["entitlements"].(map[string]any)
	writeJSON(w, 200, map[string]any{
		"tenant":       map[string]any{"id": u.TenantID, "name": tenantName, "status": status},
		"subscription": sub,
		"usage": map[string]any{
			"users": usage["users"], "exchangeAccounts": usage["exchangeAccounts"],
			"maxUsers": asInt64(plan["maxUsers"]), "maxExchangeAccounts": asInt64(plan["maxExchangeAccounts"]),
		},
		"entitlements": entitlements,
		"invoices":     s.invoiceRows(r.Context(), u.TenantID, 50),
		"payments":     s.paymentRows(r.Context(), u.TenantID, 50),
		"checkout": map[string]any{
			"defaultProvider":  s.cfg.BillingDefaultProvider,
			"hostedConfigured": strings.TrimSpace(s.cfg.BillingCheckoutURL) != "",
			"currency":         s.cfg.BillingCurrency,
		},
	})
}
func (s *Server) invoiceRows(ctx context.Context, tid int64, limit int) []map[string]any {
	rows, e := s.store.DB.QueryContext(ctx, `SELECT id,COALESCE(subscription_id,0),invoice_type,currency,amount,status,due_at,paid_at,created_at FROM invoices WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY id DESC LIMIT `+fmt.Sprint(limit), tid)
	if e != nil {
		return nil
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, sid int64
		var typ, currency, status string
		var amount float64
		var due, paid sql.NullTime
		var created time.Time
		if rows.Scan(&id, &sid, &typ, &currency, &amount, &status, &due, &paid, &created) == nil {
			out = append(out, map[string]any{"id": id, "subscriptionId": sid, "type": typ, "invoiceType": typ, "currency": currency, "amount": amount, "status": status, "dueAt": nullTime(due), "paidAt": nullTime(paid), "createdAt": created})
		}
	}
	return out
}
func (s *Server) paymentRows(ctx context.Context, tid int64, limit int) []map[string]any {
	rows, e := s.store.DB.QueryContext(ctx, `SELECT id,COALESCE(invoice_id,0),provider,provider_payment_id,amount,currency,status,created_at,updated_at FROM payments WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY id DESC LIMIT `+fmt.Sprint(limit), tid)
	if e != nil {
		return nil
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, iid int64
		var provider, pid, currency, status string
		var amount float64
		var ca, ua time.Time
		if rows.Scan(&id, &iid, &provider, &pid, &amount, &currency, &status, &ca, &ua) == nil {
			out = append(out, map[string]any{"id": id, "invoiceId": iid, "provider": provider, "providerPaymentId": pid, "amount": amount, "currency": currency, "status": status, "createdAt": ca, "updatedAt": ua})
		}
	}
	return out
}
func (s *Server) billingInvoices(w http.ResponseWriter, r *http.Request, u ctxUser) {
	writeJSON(w, 200, map[string]any{"items": s.invoiceRows(r.Context(), u.TenantID, 200)})
}
func (s *Server) billingPayments(w http.ResponseWriter, r *http.Request, u ctxUser) {
	writeJSON(w, 200, map[string]any{"items": s.paymentRows(r.Context(), u.TenantID, 200)})
}
func (s *Server) billingChangePlan(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !u.IsOwner && !u.IsSuperAdmin && !s.hasPerm(u, "billing.manage") {
		writeJSON(w, 403, envelope{"error": "owner_required"})
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	code := strings.ToLower(strings.TrimSpace(mapString(in, "planCode")))
	var pid, maxUsers, maxAccounts int64
	var monthly, setupFee float64
	if s.store.DB.QueryRowContext(r.Context(), `SELECT id,monthly_price,setup_fee,max_users,max_exchange_accounts FROM plans WHERE code=`+s.store.Bind(1)+` AND status='active'`, code).Scan(&pid, &monthly, &setupFee, &maxUsers, &maxAccounts) != nil {
		writeJSON(w, 404, envelope{"error": "plan_not_found"})
		return
	}
	usage := s.tenantUsage(r.Context(), u.TenantID)
	if maxUsers > 0 && usage["users"] > maxUsers {
		writeJSON(w, 409, envelope{"error": "plan_user_limit_conflict", "used": usage["users"], "limit": maxUsers, "message": "Reduce active users before switching to this plan."})
		return
	}
	if maxAccounts > 0 && usage["exchangeAccounts"] > maxAccounts {
		writeJSON(w, 409, envelope{"error": "plan_exchange_account_limit_conflict", "used": usage["exchangeAccounts"], "limit": maxAccounts, "message": "Remove or disable API accounts before switching to this plan."})
		return
	}

	var sid int64
	err := s.svc.WithTx(r.Context(), func(tx *sql.Tx) error {
		var currentPlanID int64
		_ = tx.QueryRowContext(r.Context(), `SELECT id,plan_id FROM subscriptions WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY id DESC LIMIT 1 FOR UPDATE`, u.TenantID).Scan(&sid, &currentPlanID)
		if sid > 0 && currentPlanID == pid {
			return nil
		}
		if sid == 0 {
			if s.store.Driver == "postgres" {
				if err := tx.QueryRowContext(r.Context(), `INSERT INTO subscriptions(tenant_id,plan_id,status,provider,created_at,updated_at) VALUES($1,$2,'pending_payment',$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`, u.TenantID, pid, s.cfg.BillingDefaultProvider).Scan(&sid); err != nil {
					return err
				}
			} else {
				res, err := tx.ExecContext(r.Context(), `INSERT INTO subscriptions(tenant_id,plan_id,status,provider,created_at,updated_at) VALUES(?,?,'pending_payment',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, u.TenantID, pid, s.cfg.BillingDefaultProvider)
				if err != nil {
					return err
				}
				sid, _ = res.LastInsertId()
			}
		} else {
			if _, err := tx.ExecContext(r.Context(), `UPDATE subscriptions SET plan_id=`+s.store.Bind(1)+`,provider=`+s.store.Bind(2)+`,cancel_at_period_end=FALSE,cancelled_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3), pid, s.cfg.BillingDefaultProvider, sid); err != nil {
				return err
			}
			_, _ = tx.ExecContext(r.Context(), `UPDATE invoices SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=`+s.store.Bind(1)+` AND subscription_id=`+s.store.Bind(2)+` AND status IN ('pending','overdue')`, u.TenantID, sid)
		}
		var setupPaid int
		_ = tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM invoices WHERE tenant_id=`+s.store.Bind(1)+` AND invoice_type='setup' AND status='paid'`, u.TenantID).Scan(&setupPaid)
		now := time.Now().UTC()
		targetSubStatus := "active"
		tenantStatus := "active"
		if setupPaid == 0 && setupFee > 0 {
			targetSubStatus = "pending_setup"
			tenantStatus = "pending_payment"
			key := fmt.Sprintf("tenant:%d:setup", u.TenantID)
			if _, err := s.insertInvoiceTx(r.Context(), tx, u.TenantID, sid, "setup", s.cfg.BillingCurrency, setupFee, now, nil, nil, key); err != nil {
				return err
			}
		} else if monthly > 0 {
			targetSubStatus = "pending_payment"
			tenantStatus = "pending_payment"
			start := now
			end := now.AddDate(0, 1, 0)
			due := now.Add(s.cfg.BillingInvoiceLead)
			if due.After(end) {
				due = now
			}
			key := fmt.Sprintf("sub:%d:plan-change:%d:%s", sid, pid, now.Format("200601021504"))
			if _, err := s.insertInvoiceTx(r.Context(), tx, u.TenantID, sid, "monthly", s.cfg.BillingCurrency, monthly, due, &start, &end, key); err != nil {
				return err
			}
		}
		if _, err := tx.ExecContext(r.Context(), `UPDATE subscriptions SET status=`+s.store.Bind(1)+`,past_due_since=NULL,grace_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2), targetSubStatus, sid); err != nil {
			return err
		}
		_, err := tx.ExecContext(r.Context(), `UPDATE tenants SET plan_id=`+s.store.Bind(1)+`,status=`+s.store.Bind(2)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3), pid, tenantStatus, u.TenantID)
		return err
	})
	if err != nil {
		replyDBError(w, err)
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "subscription.plan_changed", "subscription", fmt.Sprint(sid), r, map[string]any{"planCode": code, "planId": pid})
	writeJSON(w, 200, map[string]any{"ok": true, "subscription": s.currentSubscription(r.Context(), u.TenantID), "invoices": s.invoiceRows(r.Context(), u.TenantID, 20)})
}

func (s *Server) billingCheckout(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !u.IsOwner && !u.IsSuperAdmin && !s.hasPerm(u, "billing.manage") {
		writeJSON(w, 403, envelope{"error": "owner_required"})
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	iid := mapInt64(in, "invoiceId")
	if iid <= 0 {
		writeJSON(w, 422, envelope{"error": "invoice_required"})
		return
	}
	var amount float64
	var currency, status string
	if s.store.DB.QueryRowContext(r.Context(), `SELECT amount,currency,status FROM invoices WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), iid, u.TenantID).Scan(&amount, &currency, &status) != nil {
		writeJSON(w, 404, envelope{"error": "invoice_not_found"})
		return
	}
	if status == "paid" {
		writeJSON(w, 200, map[string]any{"ok": true, "alreadyPaid": true})
		return
	}
	if status != "pending" && status != "overdue" {
		writeJSON(w, 409, envelope{"error": "invoice_not_payable", "status": status})
		return
	}
	provider := strings.ToLower(firstNonEmpty(mapString(in, "provider"), s.cfg.BillingDefaultProvider, "manual"))
	idempotency := firstNonEmpty(mapString(in, "idempotencyKey"), fmt.Sprintf("tenant:%d:invoice:%d:%s", u.TenantID, iid, provider))
	var existingID, existingURL, existingStatus string
	if s.store.DB.QueryRowContext(r.Context(), `SELECT id,checkout_url,status FROM billing_checkout_sessions WHERE tenant_id=`+s.store.Bind(1)+` AND idempotency_key=`+s.store.Bind(2)+` ORDER BY created_at DESC LIMIT 1`, u.TenantID, idempotency).Scan(&existingID, &existingURL, &existingStatus) == nil && existingID != "" && existingStatus != "expired" {
		writeJSON(w, 200, map[string]any{"ok": true, "invoiceId": iid, "amount": amount, "currency": currency, "provider": provider, "checkoutSessionId": existingID, "checkoutUrl": existingURL, "status": existingStatus, "reused": true})
		return
	}
	sessionID := randomID("checkout")
	checkoutURL := ""
	instructions := ""
	if provider == "manual" {
		instructions = "Manual payment selected. Complete the payment using the payment instructions configured by the platform owner; Super Admin can reconcile and confirm the invoice."
	} else {
		var err error
		checkoutURL, err = s.genericCheckoutURL(sessionID, iid, u.TenantID, amount, currency)
		if err != nil {
			writeJSON(w, 503, envelope{"error": "billing_provider_not_configured", "provider": provider, "message": err.Error()})
			return
		}
		instructions = "Continue to the configured hosted payment provider. The invoice activates only after a validated webhook is reconciled."
	}
	expires := time.Now().UTC().Add(30 * time.Minute)
	_, err := s.store.DB.ExecContext(r.Context(), `INSERT INTO billing_checkout_sessions(id,tenant_id,invoice_id,provider,idempotency_key,checkout_url,status,expires_at,metadata_json,created_at,updated_at) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`,`+s.store.Bind(3)+`,`+s.store.Bind(4)+`,`+s.store.Bind(5)+`,`+s.store.Bind(6)+`,'created',`+s.store.Bind(7)+`,`+s.store.Bind(8)+`,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, sessionID, u.TenantID, iid, provider, idempotency, checkoutURL, expires, rawJSON(map[string]any{"requestedBy": u.ID}))
	if err != nil {
		replyDBError(w, err)
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "billing.checkout_created", "invoice", fmt.Sprint(iid), r, map[string]any{"provider": provider, "sessionId": sessionID})
	writeJSON(w, 200, map[string]any{"ok": true, "invoiceId": iid, "amount": amount, "currency": currency, "provider": provider, "checkoutSessionId": sessionID, "checkoutUrl": checkoutURL, "status": "created", "expiresAt": expires, "instructions": instructions})
}

func (s *Server) billingCancel(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !u.IsOwner && !u.IsSuperAdmin && !s.hasPerm(u, "billing.manage") {
		writeJSON(w, 403, envelope{"error": "owner_required"})
		return
	}
	res, err := s.store.DB.ExecContext(r.Context(), `UPDATE subscriptions SET cancel_at_period_end=TRUE,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=`+s.store.Bind(1)+` AND status IN ('active','past_due')`, u.TenantID)
	if err != nil {
		replyDBError(w, err)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, 409, envelope{"error": "subscription_not_cancellable"})
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "subscription.cancel_scheduled", "subscription", "", r, nil)
	writeJSON(w, 200, map[string]any{"ok": true, "subscription": s.currentSubscription(r.Context(), u.TenantID)})
}

func (s *Server) billingResume(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !u.IsOwner && !u.IsSuperAdmin && !s.hasPerm(u, "billing.manage") {
		writeJSON(w, 403, envelope{"error": "owner_required"})
		return
	}
	_, err := s.store.DB.ExecContext(r.Context(), `UPDATE subscriptions SET cancel_at_period_end=FALSE,cancelled_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=`+s.store.Bind(1)+` AND status IN ('active','past_due','cancelled')`, u.TenantID)
	if err != nil {
		replyDBError(w, err)
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "subscription.cancel_resumed", "subscription", "", r, nil)
	writeJSON(w, 200, map[string]any{"ok": true, "subscription": s.currentSubscription(r.Context(), u.TenantID)})
}

func (s *Server) billingWebhook(w http.ResponseWriter, r *http.Request) {
	if s.cfg.Env == "production" && strings.TrimSpace(s.cfg.BillingWebhookSecret) == "" {
		writeJSON(w, 503, envelope{"error": "billing_webhook_disabled", "message": "BILLING_WEBHOOK_SECRET must be configured before provider webhooks are accepted in production."})
		return
	}
	body, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 2<<20))
	if e != nil {
		writeJSON(w, 400, envelope{"error": "invalid_body"})
		return
	}
	if s.cfg.BillingWebhookSecret != "" {
		sig := firstNonEmpty(r.Header.Get("X-P2PFlow-Signature"), r.Header.Get("X-Webhook-Signature"))
		sig = strings.TrimPrefix(strings.TrimSpace(sig), "sha256=")
		mac := hmac.New(sha256.New, []byte(s.cfg.BillingWebhookSecret))
		_, _ = mac.Write(body)
		want := hex.EncodeToString(mac.Sum(nil))
		if !hmac.Equal([]byte(want), []byte(sig)) {
			writeJSON(w, 401, envelope{"error": "invalid_signature"})
			return
		}
	}
	var in map[string]any
	if json.Unmarshal(body, &in) != nil {
		writeJSON(w, 400, envelope{"error": "invalid_json"})
		return
	}
	provider := strings.ToLower(strings.TrimSpace(r.PathValue("provider")))
	if provider == "" {
		provider = s.cfg.BillingDefaultProvider
	}
	eventID := firstNonEmpty(mapString(in, "eventId", "id"), hashToken(string(body)))
	eventType := firstNonEmpty(mapString(in, "type", "eventType"), "payment.updated")
	tenantID := mapInt64(in, "tenantId")
	inserted := false
	if s.store.Driver == "postgres" {
		res, err := s.store.DB.ExecContext(r.Context(), `INSERT INTO billing_webhook_events(provider,provider_event_id,tenant_id,event_type,payload_json,status,attempt_count,last_error,created_at) VALUES($1,$2,$3,$4,$5,'received',1,'',CURRENT_TIMESTAMP) ON CONFLICT(provider,provider_event_id) DO NOTHING`, provider, eventID, sqlNullInt64(tenantID), eventType, rawJSON(in))
		if err != nil {
			replyDBError(w, err)
			return
		}
		n, _ := res.RowsAffected()
		inserted = n > 0
	} else {
		res, err := s.store.DB.ExecContext(r.Context(), `INSERT IGNORE INTO billing_webhook_events(provider,provider_event_id,tenant_id,event_type,payload_json,status,attempt_count,last_error,created_at) VALUES(?,?,?,?,?,'received',1,'',CURRENT_TIMESTAMP)`, provider, eventID, sqlNullInt64(tenantID), eventType, rawJSON(in))
		if err != nil {
			replyDBError(w, err)
			return
		}
		n, _ := res.RowsAffected()
		inserted = n > 0
	}
	if !inserted {
		var existingStatus string
		if err := s.store.DB.QueryRowContext(r.Context(), `SELECT status FROM billing_webhook_events WHERE provider=`+s.store.Bind(1)+` AND provider_event_id=`+s.store.Bind(2), provider, eventID).Scan(&existingStatus); err == nil && existingStatus == "processed" {
			writeJSON(w, 200, map[string]any{"ok": true, "duplicate": true})
			return
		}
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE billing_webhook_events SET attempt_count=attempt_count+1 WHERE provider=`+s.store.Bind(1)+` AND provider_event_id=`+s.store.Bind(2), provider, eventID)
	}

	invoiceID := mapInt64(in, "invoiceId")
	status := strings.ToLower(firstNonEmpty(mapString(in, "status", "paymentStatus"), "paid"))
	amount := mapFloat(in, "amount")
	currency := strings.ToUpper(firstNonEmpty(mapString(in, "currency"), s.cfg.BillingCurrency))
	paymentID := firstNonEmpty(mapString(in, "paymentId", "providerPaymentId"), eventID)
	if tenantID <= 0 || invoiceID <= 0 {
		s.recordReconciliationIssue(r.Context(), tenantID, invoiceID, provider, eventID, "missing_invoice_identity", map[string]any{"tenantId": ">0", "invoiceId": ">0"}, in)
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE billing_webhook_events SET status='rejected',last_error='missing tenantId/invoiceId',processed_at=CURRENT_TIMESTAMP WHERE provider=`+s.store.Bind(1)+` AND provider_event_id=`+s.store.Bind(2), provider, eventID)
		writeJSON(w, 422, envelope{"error": "billing_identity_required"})
		return
	}

	if status == "paid" || status == "success" || status == "completed" {
		if err := s.markInvoicePaid(r.Context(), tenantID, invoiceID, provider, paymentID, eventID, amount, currency, in); err != nil {
			issue := "payment_processing_error"
			if errors.Is(err, errBillingAmountMismatch) {
				issue = "amount_mismatch"
			}
			if errors.Is(err, errBillingCurrencyMismatch) {
				issue = "currency_mismatch"
			}
			if errors.Is(err, errBillingInvoiceNotPayable) {
				issue = "invoice_not_payable"
			}
			var expected map[string]any
			var expAmount float64
			var expCurrency, expStatus string
			if s.store.DB.QueryRowContext(r.Context(), `SELECT amount,currency,status FROM invoices WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), invoiceID, tenantID).Scan(&expAmount, &expCurrency, &expStatus) == nil {
				expected = map[string]any{"amount": expAmount, "currency": expCurrency, "status": expStatus}
			}
			s.recordReconciliationIssue(r.Context(), tenantID, invoiceID, provider, eventID, issue, expected, in)
			_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE billing_webhook_events SET status='rejected',last_error=`+s.store.Bind(1)+`,processed_at=CURRENT_TIMESTAMP WHERE provider=`+s.store.Bind(2)+` AND provider_event_id=`+s.store.Bind(3), err.Error(), provider, eventID)
			if errors.Is(err, errBillingAmountMismatch) || errors.Is(err, errBillingCurrencyMismatch) || errors.Is(err, errBillingInvoiceNotPayable) {
				writeJSON(w, 422, envelope{"error": "payment_validation_failed", "message": err.Error()})
				return
			}
			replyDBError(w, err)
			return
		}
	} else if status == "failed" || status == "cancelled" || status == "canceled" {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO payments(tenant_id,invoice_id,provider,provider_payment_id,provider_event_id,amount,currency,status,raw_json,failure_code,failure_message,created_at,updated_at) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`,`+s.store.Bind(3)+`,`+s.store.Bind(4)+`,`+s.store.Bind(5)+`,`+s.store.Bind(6)+`,`+s.store.Bind(7)+`,`+s.store.Bind(8)+`,`+s.store.Bind(9)+`,`+s.store.Bind(10)+`,`+s.store.Bind(11)+`,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, tenantID, invoiceID, provider, paymentID, eventID, amount, currency, "failed", rawJSON(in), mapString(in, "failureCode", "code"), mapString(in, "failureMessage", "message"))
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE billing_checkout_sessions SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE invoice_id=`+s.store.Bind(1)+` AND provider=`+s.store.Bind(2)+` AND status='created'`, invoiceID, provider)
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE billing_webhook_events SET status='processed',last_error='',processed_at=CURRENT_TIMESTAMP WHERE provider=`+s.store.Bind(1)+` AND provider_event_id=`+s.store.Bind(2), provider, eventID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) markInvoicePaid(ctx context.Context, tenantID, invoiceID int64, provider, paymentID, eventID string, amount float64, currency string, raw map[string]any) error {
	provider = strings.TrimSpace(strings.ToLower(provider))
	paymentID = strings.TrimSpace(paymentID)
	eventID = strings.TrimSpace(eventID)
	currency = strings.ToUpper(strings.TrimSpace(currency))
	if provider == "" || paymentID == "" {
		return errors.New("billing provider/payment id required")
	}
	return s.svc.WithTx(ctx, func(tx *sql.Tx) error {
		invoice, err := s.loadInvoiceTx(ctx, tx, tenantID, invoiceID, true)
		if err != nil {
			return err
		}
		if invoice.Status == "paid" {
			return nil
		}
		if invoice.Status != "pending" && invoice.Status != "overdue" {
			return errBillingInvoiceNotPayable
		}
		if amount <= 0 {
			amount = invoice.Amount
		}
		if math.Abs(amount-invoice.Amount) > 0.01 {
			return errBillingAmountMismatch
		}
		if currency == "" {
			currency = strings.ToUpper(invoice.Currency)
		}
		if !strings.EqualFold(currency, invoice.Currency) {
			return errBillingCurrencyMismatch
		}
		var existing int64
		if tx.QueryRowContext(ctx, `SELECT id FROM payments WHERE tenant_id=`+s.store.Bind(1)+` AND provider=`+s.store.Bind(2)+` AND provider_payment_id=`+s.store.Bind(3)+` LIMIT 1`, tenantID, provider, paymentID).Scan(&existing) == nil && existing > 0 {
			return nil
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO payments(tenant_id,invoice_id,provider,provider_payment_id,provider_event_id,amount,currency,status,raw_json,failure_code,failure_message,created_at,updated_at) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`,`+s.store.Bind(3)+`,`+s.store.Bind(4)+`,`+s.store.Bind(5)+`,`+s.store.Bind(6)+`,`+s.store.Bind(7)+`,'paid',`+s.store.Bind(8)+`,'','',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, tenantID, invoiceID, provider, paymentID, eventID, invoice.Amount, strings.ToUpper(invoice.Currency), rawJSON(raw))
		if err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE invoices SET status='paid',paid_at=CURRENT_TIMESTAMP,provider=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2)+` AND tenant_id=`+s.store.Bind(3), provider, invoiceID, tenantID); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE billing_checkout_sessions SET status='completed',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE invoice_id=`+s.store.Bind(1)+` AND status IN ('created','pending')`, invoiceID); err != nil {
			return err
		}
		return s.applyPaidInvoiceLifecycleTx(ctx, tx, invoice)
	})
}

func (s *Server) superSummary(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	var tenants, activeTenants, suspendedTenants, users, accounts, activeSubs, pastDueSubs, pendingInvoices, overdueInvoices, openRecon int64
	var mrr, setupRevenue, recurringRevenue, totalRevenue float64
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM tenants`).Scan(&tenants)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM tenants WHERE status='active'`).Scan(&activeTenants)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM tenants WHERE status IN ('suspended','disabled')`).Scan(&suspendedTenants)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM users WHERE status='active'`).Scan(&users)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM exchange_accounts WHERE status<>'deleted'`).Scan(&accounts)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM subscriptions WHERE status='active'`).Scan(&activeSubs)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM subscriptions WHERE status IN ('past_due','suspended')`).Scan(&pastDueSubs)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM invoices WHERE status='pending'`).Scan(&pendingInvoices)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM invoices WHERE status='overdue'`).Scan(&overdueInvoices)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM billing_reconciliation_issues WHERE status='open'`).Scan(&openRecon)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COALESCE(SUM(p.monthly_price),0) FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.status='active'`).Scan(&mrr)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COALESCE(SUM(amount),0) FROM invoices WHERE invoice_type='setup' AND status='paid'`).Scan(&setupRevenue)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COALESCE(SUM(amount),0) FROM invoices WHERE invoice_type IN ('monthly','renewal') AND status='paid'`).Scan(&recurringRevenue)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='paid'`).Scan(&totalRevenue)
	writeJSON(w, 200, map[string]any{
		"tenants": tenants, "activeTenants": activeTenants, "suspendedTenants": suspendedTenants,
		"users": users, "exchangeAccounts": accounts, "activeSubscriptions": activeSubs, "pastDueSubscriptions": pastDueSubs,
		"pendingInvoices": pendingInvoices, "overdueInvoices": overdueInvoices, "openReconciliationIssues": openRecon,
		"mrr": mrr, "arr": mrr * 12, "setupRevenue": setupRevenue, "monthlyRevenue": recurringRevenue, "totalRevenue": totalRevenue,
		"version": s.cfg.Version,
	})
}
func (s *Server) superTenants(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	rows, e := s.store.DB.QueryContext(r.Context(), `SELECT t.id,t.name,t.slug,t.status,t.created_at,COALESCE(p.name,''),COALESCE((SELECT COUNT(*) FROM users u WHERE u.tenant_id=t.id),0),COALESCE((SELECT COUNT(*) FROM exchange_accounts a WHERE a.tenant_id=t.id),0),COALESCE((SELECT status FROM subscriptions s WHERE s.tenant_id=t.id ORDER BY s.id DESC LIMIT 1),'none') FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id ORDER BY t.id DESC LIMIT 2000`)
	if e != nil {
		replyDBError(w, e)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, users, accounts int64
		var name, slug, status, plan, sub string
		var ca time.Time
		if rows.Scan(&id, &name, &slug, &status, &ca, &plan, &users, &accounts, &sub) == nil {
			items = append(items, map[string]any{"id": id, "name": name, "slug": slug, "status": status, "createdAt": ca, "plan": plan, "users": users, "exchangeAccounts": accounts, "subscriptionStatus": sub})
		}
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func (s *Server) superInvoices(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	rows, e := s.store.DB.QueryContext(r.Context(), `SELECT i.id,i.tenant_id,t.name,COALESCE(i.subscription_id,0),i.invoice_type,i.currency,i.amount,i.status,i.due_at,i.paid_at,i.created_at FROM invoices i JOIN tenants t ON t.id=i.tenant_id ORDER BY i.id DESC LIMIT 1000`)
	if e != nil {
		replyDBError(w, e)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, tid, sid int64
		var tenant, typ, currency, status string
		var amount float64
		var due, paid sql.NullTime
		var created time.Time
		if rows.Scan(&id, &tid, &tenant, &sid, &typ, &currency, &amount, &status, &due, &paid, &created) == nil {
			items = append(items, map[string]any{"id": id, "tenantId": tid, "tenant": tenant, "subscriptionId": sid, "type": typ, "invoiceType": typ, "currency": currency, "amount": amount, "status": status, "dueAt": nullTime(due), "paidAt": nullTime(paid), "createdAt": created})
		}
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func (s *Server) superPayments(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	rows, e := s.store.DB.QueryContext(r.Context(), `SELECT p.id,p.tenant_id,t.name,COALESCE(p.invoice_id,0),p.provider,p.provider_payment_id,p.amount,p.currency,p.status,p.created_at,p.updated_at FROM payments p JOIN tenants t ON t.id=p.tenant_id ORDER BY p.id DESC LIMIT 1000`)
	if e != nil {
		replyDBError(w, e)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, tid, iid int64
		var tenant, provider, pid, currency, status string
		var amount float64
		var ca, ua time.Time
		if rows.Scan(&id, &tid, &tenant, &iid, &provider, &pid, &amount, &currency, &status, &ca, &ua) == nil {
			items = append(items, map[string]any{"id": id, "tenantId": tid, "tenant": tenant, "invoiceId": iid, "provider": provider, "providerPaymentId": pid, "amount": amount, "currency": currency, "status": status, "createdAt": ca, "updatedAt": ua})
		}
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func (s *Server) superTenantPatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	id := parseID(r.PathValue("id"))
	if id <= 0 {
		writeJSON(w, 422, envelope{"error": "invalid_tenant"})
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	var currentStatus string
	var currentPlan sql.NullInt64
	if err := s.store.DB.QueryRowContext(r.Context(), `SELECT status,plan_id FROM tenants WHERE id=`+s.store.Bind(1), id).Scan(&currentStatus, &currentPlan); err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, 404, envelope{"error": "not_found"})
			return
		}
		replyDBError(w, err)
		return
	}
	status := strings.ToLower(strings.TrimSpace(mapString(in, "status")))
	if status != "" && status != "active" && status != "past_due" && status != "pending_payment" && status != "suspended" && status != "disabled" {
		writeJSON(w, 422, envelope{"error": "invalid_status"})
		return
	}
	planID := currentPlan.Int64
	planCode := strings.ToLower(strings.TrimSpace(mapString(in, "planCode")))
	if planCode != "" {
		if err := s.store.DB.QueryRowContext(r.Context(), `SELECT id FROM plans WHERE code=`+s.store.Bind(1)+` AND status='active'`, planCode).Scan(&planID); err != nil {
			writeJSON(w, 404, envelope{"error": "plan_not_found"})
			return
		}
	}
	if status == "" {
		status = currentStatus
	}
	if _, err := s.store.DB.ExecContext(r.Context(), `UPDATE tenants SET status=`+s.store.Bind(1)+`,plan_id=`+s.store.Bind(2)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3), status, sqlNullInt64(planID), id); err != nil {
		replyDBError(w, err)
		return
	}
	if planCode != "" {
		var latestSubscriptionID int64
		if s.store.DB.QueryRowContext(r.Context(), `SELECT id FROM subscriptions WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY id DESC LIMIT 1`, id).Scan(&latestSubscriptionID) == nil && latestSubscriptionID > 0 {
			_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE subscriptions SET plan_id=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2), planID, latestSubscriptionID)
		}
	}
	// Deliberately do not mutate user.status here. Workspace suspension is
	// enforced at the tenant/subscription gate so intentionally disabled users
	// are never re-enabled when the workspace is restored.
	s.svc.Audit(r.Context(), id, u.ID, "superadmin.tenant_updated", "tenant", fmt.Sprint(id), r, map[string]any{"status": status, "planCode": planCode})
	writeJSON(w, 200, map[string]any{"ok": true, "tenant": map[string]any{"id": id, "status": status, "planId": planID}})
}
func (s *Server) superPlans(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	s.plans(w, r)
}
func (s *Server) superPlanCreate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	code := strings.ToLower(strings.TrimSpace(mapString(in, "code")))
	name := mapString(in, "name")
	if code == "" || name == "" {
		writeJSON(w, 422, envelope{"error": "code_name_required"})
		return
	}
	monthly, setup := mapFloat(in, "monthlyPrice"), mapFloat(in, "setupFee")
	maxUsers, maxAccounts := mapInt64(in, "maxUsers"), mapInt64(in, "maxExchangeAccounts")
	if monthly < 0 || setup < 0 || maxUsers < 0 || maxAccounts < 0 {
		writeJSON(w, 422, envelope{"error": "invalid_plan_limits"})
		return
	}
	pg := `INSERT INTO plans(code,name,monthly_price,setup_fee,max_users,max_exchange_accounts,entitlements_json,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,'active',CURRENT_TIMESTAMP) RETURNING id`
	my := `INSERT INTO plans(code,name,monthly_price,setup_fee,max_users,max_exchange_accounts,entitlements_json,status,created_at) VALUES(?,?,?,?,?,?,?,'active',CURRENT_TIMESTAMP)`
	id, e := s.insertID(r.Context(), pg, my, code, name, monthly, setup, maxUsers, maxAccounts, rawJSON(firstMapValue(in, "entitlements")))
	if e != nil {
		writeJSON(w, 409, envelope{"error": "plan_save_failed"})
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "superadmin.plan_created", "plan", fmt.Sprint(id), r, map[string]any{"code": code, "monthlyPrice": monthly, "setupFee": setup})
	writeJSON(w, 201, map[string]any{"ok": true, "id": id})
}
func (s *Server) superPlanPatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	id := parseID(r.PathValue("id"))
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	var name, status, raw string
	var monthly, setup float64
	var maxu, maxa int64
	if s.store.DB.QueryRowContext(r.Context(), `SELECT name,monthly_price,setup_fee,max_users,max_exchange_accounts,status,entitlements_json FROM plans WHERE id=`+s.store.Bind(1), id).Scan(&name, &monthly, &setup, &maxu, &maxa, &status, &raw) != nil {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	if v := mapString(in, "name"); v != "" {
		name = v
	}
	if _, ok := in["monthlyPrice"]; ok {
		monthly = mapFloat(in, "monthlyPrice")
	}
	if _, ok := in["setupFee"]; ok {
		setup = mapFloat(in, "setupFee")
	}
	if _, ok := in["maxUsers"]; ok {
		maxu = mapInt64(in, "maxUsers")
	}
	if _, ok := in["maxExchangeAccounts"]; ok {
		maxa = mapInt64(in, "maxExchangeAccounts")
	}
	if monthly < 0 || setup < 0 || maxu < 0 || maxa < 0 {
		writeJSON(w, 422, envelope{"error": "invalid_plan_limits"})
		return
	}
	if v := strings.ToLower(strings.TrimSpace(mapString(in, "status"))); v != "" {
		if v != "active" && v != "inactive" && v != "archived" {
			writeJSON(w, 422, envelope{"error": "invalid_plan_status"})
			return
		}
		status = v
	}
	if v, ok := in["entitlements"]; ok {
		raw = rawJSON(v)
	}
	_, e := s.store.DB.ExecContext(r.Context(), `UPDATE plans SET name=`+s.store.Bind(1)+`,monthly_price=`+s.store.Bind(2)+`,setup_fee=`+s.store.Bind(3)+`,max_users=`+s.store.Bind(4)+`,max_exchange_accounts=`+s.store.Bind(5)+`,status=`+s.store.Bind(6)+`,entitlements_json=`+s.store.Bind(7)+` WHERE id=`+s.store.Bind(8), name, monthly, setup, maxu, maxa, status, raw, id)
	if e != nil {
		replyDBError(w, e)
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "superadmin.plan_updated", "plan", fmt.Sprint(id), r, map[string]any{"status": status, "maxUsers": maxu, "maxExchangeAccounts": maxa})
	writeJSON(w, 200, map[string]any{"ok": true})
}
func (s *Server) superInvoiceMarkPaid(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	id := parseID(r.PathValue("id"))
	var tid int64
	var amount float64
	var currency string
	if s.store.DB.QueryRowContext(r.Context(), `SELECT tenant_id,amount,currency FROM invoices WHERE id=`+s.store.Bind(1), id).Scan(&tid, &amount, &currency) != nil {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	if e := s.markInvoicePaid(r.Context(), tid, id, "manual", "manual-"+fmt.Sprint(time.Now().UnixMilli()), "manual-"+fmt.Sprint(time.Now().UnixNano()), amount, currency, map[string]any{"markedBy": u.ID}); e != nil {
		if errors.Is(e, errBillingInvoiceNotPayable) {
			writeJSON(w, 409, envelope{"error": "invoice_not_payable"})
			return
		}
		replyDBError(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
