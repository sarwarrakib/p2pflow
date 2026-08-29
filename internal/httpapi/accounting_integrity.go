package httpapi

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

func (s *Server) accountingDayClosed(ctx context.Context, tenantID int64, businessDate string) bool {
	var status string
	err := s.store.DB.QueryRowContext(ctx, `SELECT status FROM accounting_closings WHERE tenant_id=`+s.store.Bind(1)+` AND business_date=`+s.store.Bind(2), tenantID, businessDate).Scan(&status)
	return err == nil && strings.EqualFold(status, "closed")
}

func (s *Server) insertBusinessEntryTx(ctx context.Context, tx *sql.Tx, tenantID int64, typ, category string, amount float64, currency string, amountUSD float64, businessDate string, agentID, paymentAccountID int64, description string, protected bool, metadata any, createdBy int64) (int64, error) {
	if s.store.Driver == "postgres" {
		var id int64
		err := tx.QueryRowContext(ctx, `INSERT INTO business_entries(tenant_id,entry_type,category,amount,currency,amount_usd,business_date,agent_id,payment_account_id,description,protected,metadata_json,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,CURRENT_TIMESTAMP) RETURNING id`, tenantID, typ, category, amount, currency, amountUSD, businessDate, sqlNullInt64(agentID), sqlNullInt64(paymentAccountID), description, protected, rawJSON(metadata), sqlNullInt64(createdBy)).Scan(&id)
		return id, err
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO business_entries(tenant_id,entry_type,category,amount,currency,amount_usd,business_date,agent_id,payment_account_id,description,protected,metadata_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, tenantID, typ, category, amount, currency, amountUSD, businessDate, sqlNullInt64(agentID), sqlNullInt64(paymentAccountID), description, protected, rawJSON(metadata), sqlNullInt64(createdBy))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func reverseDirection(typ string) string {
	typ = strings.ToLower(typ)
	if typ == "expense" || typ == "capital_out" {
		return "receive"
	}
	return "send"
}

func (s *Server) reverseBusinessEntry(ctx context.Context, tenantID, userID, entryID int64, reason string) (int64, error) {
	var reversalID int64
	err := s.svc.WithTx(ctx, func(tx *sql.Tx) error {
		var typ, cat, currency, businessDate, desc, raw string
		var amount, amountUSD float64
		var agentID, paymentAccountID sql.NullInt64
		var protected bool
		q := `SELECT entry_type,category,amount,currency,amount_usd,business_date,agent_id,payment_account_id,description,protected,metadata_json FROM business_entries WHERE id=` + s.store.Bind(1) + ` AND tenant_id=` + s.store.Bind(2) + ` FOR UPDATE`
		var d time.Time
		if err := tx.QueryRowContext(ctx, q, entryID, tenantID).Scan(&typ, &cat, &amount, &currency, &amountUSD, &d, &agentID, &paymentAccountID, &desc, &protected, &raw); err != nil {
			return err
		}
		businessDate = d.UTC().Format("2006-01-02")
		if protected {
			return fmt.Errorf("protected entry cannot be reversed")
		}
		var existing int64
		if err := tx.QueryRowContext(ctx, `SELECT reversal_entry_id FROM accounting_entry_reversals WHERE original_entry_id=`+s.store.Bind(1), entryID).Scan(&existing); err == nil && existing > 0 {
			reversalID = existing
			return nil
		}
		var closeStatus string
		_ = tx.QueryRowContext(ctx, `SELECT status FROM accounting_closings WHERE tenant_id=`+s.store.Bind(1)+` AND business_date=`+s.store.Bind(2), tenantID, businessDate).Scan(&closeStatus)
		if strings.EqualFold(closeStatus, "closed") {
			return fmt.Errorf("business day is closed")
		}
		meta := map[string]any{"reversalOf": entryID, "reason": reason, "originalMetadata": jsonMap(raw)}
		id, err := s.insertBusinessEntryTx(ctx, tx, tenantID, typ, cat, -amount, currency, -amountUSD, businessDate, agentID.Int64, paymentAccountID.Int64, fmt.Sprintf("Reversal of #%d: %s", entryID, reason), true, meta, userID)
		if err != nil {
			return err
		}
		reversalID = id
		if _, err := tx.ExecContext(ctx, `INSERT INTO accounting_entry_reversals(original_entry_id,reversal_entry_id,tenant_id,reversed_by,reason,created_at) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`,`+s.store.Bind(3)+`,`+s.store.Bind(4)+`,`+s.store.Bind(5)+`,CURRENT_TIMESTAMP)`, entryID, id, tenantID, sqlNullInt64(userID), reason); err != nil {
			return err
		}
		if paymentAccountID.Valid && paymentAccountID.Int64 > 0 && amount != 0 {
			if err := s.appendPaymentLedgerTx(ctx, tx, tenantID, paymentAccountID.Int64, userID, 0, "accounting_reversal", reverseDirection(typ), amount, fmt.Sprintf("accounting-reversal:%d", entryID), reason, map[string]any{"businessEntryId": id, "reversalOf": entryID}); err != nil {
				return err
			}
		}
		return nil
	})
	return reversalID, err
}
