package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type invoiceRecord struct {
	ID             int64
	TenantID       int64
	SubscriptionID sql.NullInt64
	InvoiceType    string
	Currency       string
	Amount         float64
	Status         string
	DueAt          sql.NullTime
	PeriodStart    sql.NullTime
	PeriodEnd      sql.NullTime
}

func (s *Server) loadInvoiceTx(ctx context.Context, tx *sql.Tx, tenantID, invoiceID int64, lock bool) (invoiceRecord, error) {
	q := `SELECT id,tenant_id,subscription_id,invoice_type,currency,amount,status,due_at,period_start,period_end FROM invoices WHERE id=` + s.store.Bind(1) + ` AND tenant_id=` + s.store.Bind(2)
	if lock {
		q += ` FOR UPDATE`
	}
	var x invoiceRecord
	err := tx.QueryRowContext(ctx, q, invoiceID, tenantID).Scan(&x.ID, &x.TenantID, &x.SubscriptionID, &x.InvoiceType, &x.Currency, &x.Amount, &x.Status, &x.DueAt, &x.PeriodStart, &x.PeriodEnd)
	return x, err
}

func (s *Server) insertInvoiceTx(ctx context.Context, tx *sql.Tx, tenantID, subscriptionID int64, invoiceType, currency string, amount float64, due time.Time, periodStart, periodEnd *time.Time, idempotencyKey string) (int64, error) {
	if currency == "" {
		currency = s.cfg.BillingCurrency
	}
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	if idempotencyKey != "" {
		var existing int64
		if err := tx.QueryRowContext(ctx, `SELECT id FROM invoices WHERE tenant_id=`+s.store.Bind(1)+` AND idempotency_key=`+s.store.Bind(2)+` LIMIT 1`, tenantID, idempotencyKey).Scan(&existing); err == nil && existing > 0 {
			return existing, nil
		}
	}
	pStart, pEnd := any(nil), any(nil)
	if periodStart != nil {
		pStart = periodStart.UTC()
	}
	if periodEnd != nil {
		pEnd = periodEnd.UTC()
	}
	if s.store.Driver == "postgres" {
		var id int64
		err := tx.QueryRowContext(ctx, `INSERT INTO invoices(tenant_id,subscription_id,invoice_type,currency,amount,status,due_at,period_start,period_end,idempotency_key,provider,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`, tenantID, sqlNullInt64(subscriptionID), invoiceType, currency, amount, due.UTC(), pStart, pEnd, idempotencyKey, s.cfg.BillingDefaultProvider).Scan(&id)
		return id, err
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO invoices(tenant_id,subscription_id,invoice_type,currency,amount,status,due_at,period_start,period_end,idempotency_key,provider,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, tenantID, sqlNullInt64(subscriptionID), invoiceType, currency, amount, due.UTC(), pStart, pEnd, idempotencyKey, s.cfg.BillingDefaultProvider)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Server) subscriptionPlanTx(ctx context.Context, tx *sql.Tx, subscriptionID int64) (monthly, setup float64, planID int64, err error) {
	err = tx.QueryRowContext(ctx, `SELECT p.monthly_price,p.setup_fee,p.id FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.id=`+s.store.Bind(1), subscriptionID).Scan(&monthly, &setup, &planID)
	return
}

func (s *Server) applyPaidInvoiceLifecycleTx(ctx context.Context, tx *sql.Tx, invoice invoiceRecord) error {
	if !invoice.SubscriptionID.Valid {
		_, err := tx.ExecContext(ctx, `UPDATE tenants SET status='active',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1)+` AND status='pending_payment'`, invoice.TenantID)
		return err
	}
	sid := invoice.SubscriptionID.Int64
	monthly, _, _, err := s.subscriptionPlanTx(ctx, tx, sid)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	switch strings.ToLower(invoice.InvoiceType) {
	case "setup":
		if _, err := tx.ExecContext(ctx, `UPDATE subscriptions SET setup_fee_paid_at=COALESCE(setup_fee_paid_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), sid); err != nil {
			return err
		}
		if monthly > 0 {
			start := now
			end := now.AddDate(0, 1, 0)
			due := now.Add(s.cfg.BillingInvoiceLead)
			if due.After(end) {
				due = now
			}
			key := fmt.Sprintf("sub:%d:first-month:%s", sid, start.Format("20060102"))
			if _, err := s.insertInvoiceTx(ctx, tx, invoice.TenantID, sid, "monthly", invoice.Currency, monthly, due, &start, &end, key); err != nil {
				return err
			}
			_, err = tx.ExecContext(ctx, `UPDATE subscriptions SET status='pending_payment',billing_cycle_anchor=COALESCE(billing_cycle_anchor,`+s.store.Bind(1)+`),next_invoice_at=`+s.store.Bind(2)+`,current_period_start=NULL,current_period_end=NULL,past_due_since=NULL,grace_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3), start, end.Add(-s.cfg.BillingInvoiceLead), sid)
			if err != nil {
				return err
			}
			_, err = tx.ExecContext(ctx, `UPDATE tenants SET status='pending_payment',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), invoice.TenantID)
			return err
		}
		_, err = tx.ExecContext(ctx, `UPDATE subscriptions SET status='active',billing_cycle_anchor=COALESCE(billing_cycle_anchor,CURRENT_TIMESTAMP),past_due_since=NULL,grace_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), sid)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `UPDATE tenants SET status='active',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), invoice.TenantID)
		return err
	case "monthly", "renewal":
		start := now
		end := now.AddDate(0, 1, 0)
		if invoice.PeriodStart.Valid {
			start = invoice.PeriodStart.Time.UTC()
		}
		if invoice.PeriodEnd.Valid && invoice.PeriodEnd.Time.After(start) {
			end = invoice.PeriodEnd.Time.UTC()
		}
		next := end.Add(-s.cfg.BillingInvoiceLead)
		_, err = tx.ExecContext(ctx, `UPDATE subscriptions SET status='active',current_period_start=`+s.store.Bind(1)+`,current_period_end=`+s.store.Bind(2)+`,billing_cycle_anchor=COALESCE(billing_cycle_anchor,`+s.store.Bind(1)+`),next_invoice_at=`+s.store.Bind(3)+`,past_due_since=NULL,grace_until=NULL,cancelled_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(4), start, end, next, sid)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `UPDATE tenants SET status='active',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1)+` AND status<>'disabled'`, invoice.TenantID)
		return err
	default:
		_, err = tx.ExecContext(ctx, `UPDATE tenants SET status='active',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1)+` AND status='pending_payment'`, invoice.TenantID)
		return err
	}
}

func (s *Server) recordReconciliationIssue(ctx context.Context, tenantID, invoiceID int64, provider, eventID, issueType string, expected, actual any) {
	_, _ = s.store.DB.ExecContext(ctx, `INSERT INTO billing_reconciliation_issues(tenant_id,invoice_id,provider,provider_event_id,issue_type,expected_json,actual_json,status,resolution_note,created_at,updated_at) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`,`+s.store.Bind(3)+`,`+s.store.Bind(4)+`,`+s.store.Bind(5)+`,`+s.store.Bind(6)+`,`+s.store.Bind(7)+`,'open','',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, sqlNullInt64(tenantID), sqlNullInt64(invoiceID), provider, eventID, issueType, rawJSON(expected), rawJSON(actual))
}

func (s *Server) genericCheckoutURL(sessionID string, invoiceID, tenantID int64, amount float64, currency string) (string, error) {
	raw := strings.TrimSpace(s.cfg.BillingCheckoutURL)
	if raw == "" {
		return "", errors.New("billing checkout URL is not configured")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", errors.New("invalid billing checkout URL")
	}
	if u.Scheme != "https" && !(s.cfg.Env != "production" && u.Scheme == "http") {
		return "", errors.New("billing checkout URL must use HTTPS in production")
	}
	q := u.Query()
	q.Set("session_id", sessionID)
	q.Set("invoice_id", strconv.FormatInt(invoiceID, 10))
	q.Set("tenant_id", strconv.FormatInt(tenantID, 10))
	q.Set("amount", strconv.FormatFloat(amount, 'f', 2, 64))
	q.Set("currency", currency)
	if s.cfg.PublicBaseURL != "" {
		q.Set("return_url", s.cfg.PublicBaseURL+"/system/billing")
	}
	signature := hmacHex(s.cfg.BillingWebhookSecret, strings.Join([]string{sessionID, strconv.FormatInt(invoiceID, 10), strconv.FormatInt(tenantID, 10), strconv.FormatFloat(amount, 'f', 2, 64), currency}, "|"))
	if signature != "" {
		q.Set("signature", signature)
	}
	if s.cfg.BillingCheckoutAPIKey != "" {
		q.Set("client_key", s.cfg.BillingCheckoutAPIKey)
	}
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func hmacHex(secret, payload string) string {
	if strings.TrimSpace(secret) == "" {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}
