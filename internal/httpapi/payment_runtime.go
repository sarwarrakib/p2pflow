package httpapi

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"
)

type paymentRuntimeRules struct {
	OpeningBalance      float64
	ReceiveDailyLimit   float64
	SendDailyLimit      float64
	ReceiveMonthlyLimit float64
	SendMonthlyLimit    float64
	Details             map[string]any
}

func normalizePaymentDirection(dir string, amount float64) (string, float64) {
	dir = strings.ToLower(strings.TrimSpace(dir))
	abs := math.Abs(amount)
	switch dir {
	case "send", "cashout", "out":
		return "send", -abs
	default:
		return "receive", abs
	}
}

func (s *Server) paymentRuntimeRulesTx(ctx context.Context, tx *sql.Tx, tenantID, accountID int64) (paymentRuntimeRules, error) {
	var x paymentRuntimeRules
	var raw string
	err := tx.QueryRowContext(ctx, `SELECT opening_balance,receive_daily_limit,send_daily_limit,receive_monthly_limit,send_monthly_limit,details_json FROM payment_accounts WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` AND status<>'deleted' FOR UPDATE`, accountID, tenantID).Scan(&x.OpeningBalance, &x.ReceiveDailyLimit, &x.SendDailyLimit, &x.ReceiveMonthlyLimit, &x.SendMonthlyLimit, &raw)
	if err != nil {
		return x, err
	}
	x.Details = jsonMap(raw)
	// 2.0.1 stored these values in details_json. Keep that import path so an
	// upgrade does not silently lose limits before an account is edited again.
	if x.OpeningBalance == 0 {
		x.OpeningBalance = mapFloat(x.Details, "openingBalance")
	}
	if x.ReceiveDailyLimit == 0 {
		x.ReceiveDailyLimit = mapFloat(x.Details, "receiveDailyLimit", "receiveLimit")
	}
	if x.SendDailyLimit == 0 {
		x.SendDailyLimit = mapFloat(x.Details, "sendDailyLimit", "sendLimit")
	}
	if x.ReceiveMonthlyLimit == 0 {
		x.ReceiveMonthlyLimit = mapFloat(x.Details, "receiveMonthlyLimit")
	}
	if x.SendMonthlyLimit == 0 {
		x.SendMonthlyLimit = mapFloat(x.Details, "sendMonthlyLimit")
	}
	return x, nil
}

func (s *Server) paymentRuntimeBalanceTx(ctx context.Context, tx *sql.Tx, tenantID, accountID int64, rules paymentRuntimeRules) (float64, error) {
	var balance float64
	err := tx.QueryRowContext(ctx, `SELECT balance FROM payment_account_runtime WHERE payment_account_id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` FOR UPDATE`, accountID, tenantID).Scan(&balance)
	if err == nil {
		return balance, nil
	}
	if err != sql.ErrNoRows {
		return 0, err
	}
	balance = rules.OpeningBalance
	var legacy sql.NullFloat64
	_ = tx.QueryRowContext(ctx, `SELECT balance_after FROM payment_account_ledger WHERE payment_account_id=`+s.store.Bind(1)+` ORDER BY id DESC LIMIT 1`, accountID).Scan(&legacy)
	if legacy.Valid {
		balance = legacy.Float64
	}
	if s.store.Driver == "postgres" {
		_, err = tx.ExecContext(ctx, `INSERT INTO payment_account_runtime(payment_account_id,tenant_id,balance,version,updated_at) VALUES($1,$2,$3,0,CURRENT_TIMESTAMP) ON CONFLICT(payment_account_id) DO NOTHING`, accountID, tenantID, balance)
	} else {
		_, err = tx.ExecContext(ctx, `INSERT IGNORE INTO payment_account_runtime(payment_account_id,tenant_id,balance,version,updated_at) VALUES(?,?,?,0,CURRENT_TIMESTAMP)`, accountID, tenantID, balance)
	}
	if err != nil {
		return 0, err
	}
	// Lock the row after an idempotent insert. This is important when two first
	// writes race immediately after migration.
	if err := tx.QueryRowContext(ctx, `SELECT balance FROM payment_account_runtime WHERE payment_account_id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` FOR UPDATE`, accountID, tenantID).Scan(&balance); err != nil {
		return 0, err
	}
	return balance, nil
}

func (s *Server) paymentUsageTx(ctx context.Context, tx *sql.Tx, accountID int64, start time.Time, direction string) (float64, error) {
	var total sql.NullFloat64
	where := "direction IN ('receive','topup','in')"
	if direction == "send" {
		where = "direction IN ('send','cashout','out')"
	}
	q := `SELECT COALESCE(SUM(ABS(amount)),0) FROM payment_account_ledger WHERE payment_account_id=` + s.store.Bind(1) + ` AND created_at>=` + s.store.Bind(2) + ` AND ` + where
	if err := tx.QueryRowContext(ctx, q, accountID, start).Scan(&total); err != nil {
		return 0, err
	}
	return total.Float64, nil
}

func paymentLimitFor(r paymentRuntimeRules, direction string, monthly bool) float64 {
	if direction == "send" {
		if monthly {
			return r.SendMonthlyLimit
		}
		return r.SendDailyLimit
	}
	if monthly {
		return r.ReceiveMonthlyLimit
	}
	return r.ReceiveDailyLimit
}

func (s *Server) appendPaymentLedgerTx(ctx context.Context, tx *sql.Tx, tenantID, accountID, userID, orderID int64, typ, dir string, amount float64, ref, note string, meta any) error {
	if accountID <= 0 || tenantID <= 0 || amount == 0 {
		return fmt.Errorf("invalid payment ledger entry")
	}
	rules, err := s.paymentRuntimeRulesTx(ctx, tx, tenantID, accountID)
	if err != nil {
		return err
	}
	before, err := s.paymentRuntimeBalanceTx(ctx, tx, tenantID, accountID, rules)
	if err != nil {
		return err
	}
	direction, delta := normalizePaymentDirection(dir, amount)
	after := before + delta
	exempt := typ == "opening" || strings.Contains(typ, "reversal") || typ == "balance_correction"
	if direction == "send" && after < -0.0000001 && !exempt {
		return fmt.Errorf("insufficient balance: available %.2f, requested %.2f", before, math.Abs(delta))
	}
	if !exempt {
		now := time.Now().UTC()
		dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		daily, err := s.paymentUsageTx(ctx, tx, accountID, dayStart, direction)
		if err != nil {
			return err
		}
		monthly, err := s.paymentUsageTx(ctx, tx, accountID, monthStart, direction)
		if err != nil {
			return err
		}
		value := math.Abs(delta)
		if limit := paymentLimitFor(rules, direction, false); limit > 0 && daily+value > limit+0.0000001 {
			return fmt.Errorf("daily %s limit exceeded: used %.2f, limit %.2f", direction, daily, limit)
		}
		if limit := paymentLimitFor(rules, direction, true); limit > 0 && monthly+value > limit+0.0000001 {
			return fmt.Errorf("monthly %s limit exceeded: used %.2f, limit %.2f", direction, monthly, limit)
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE payment_account_runtime SET balance=`+s.store.Bind(1)+`,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE payment_account_id=`+s.store.Bind(2)+` AND tenant_id=`+s.store.Bind(3), after, accountID, tenantID); err != nil {
		return err
	}
	q := `INSERT INTO payment_account_ledger(tenant_id,payment_account_id,user_id,order_id,entry_type,direction,amount,balance_before,balance_after,reference,note,metadata_json,created_at) VALUES(` + s.store.Bind(1) + `,` + s.store.Bind(2) + `,` + s.store.Bind(3) + `,` + s.store.Bind(4) + `,` + s.store.Bind(5) + `,` + s.store.Bind(6) + `,` + s.store.Bind(7) + `,` + s.store.Bind(8) + `,` + s.store.Bind(9) + `,` + s.store.Bind(10) + `,` + s.store.Bind(11) + `,` + s.store.Bind(12) + `,CURRENT_TIMESTAMP)`
	_, err = tx.ExecContext(ctx, q, tenantID, accountID, sqlNullInt64(userID), sqlNullInt64(orderID), typ, direction, math.Abs(amount), before, after, ref, note, rawJSON(meta))
	return err
}

func (s *Server) appendPaymentLedger(ctx context.Context, tenantID, accountID, userID, orderID int64, typ, dir string, amount float64, ref, note string, meta any) error {
	return s.svc.WithTx(ctx, func(tx *sql.Tx) error {
		return s.appendPaymentLedgerTx(ctx, tx, tenantID, accountID, userID, orderID, typ, dir, amount, ref, note, meta)
	})
}
