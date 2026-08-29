package httpapi

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"
)

const accountingCarryoverEpsilon = 0.000001

type accountingCarryoverLotState struct {
	ID                         int64
	BusinessDate               string
	Asset                      string
	SellFiat                   float64
	SoldAsset                  float64
	InitialCarryoverFiat       float64
	InitialProvisionalNetAsset float64
	ProvisionalYield           float64
	ProvisionalBuyRate         float64
	ProvisionalFeeRate         float64
	OperationalProfit          float64
	SettledFiat                float64
	SettledNet                 float64
	SettledFee                 float64
	OutstandingFiat            float64
	EstimatedNet               float64
	AgentSnapshotComplete      bool
	Source                     string
}

type accountingCarryoverBuyState struct {
	OrderID      int64
	OrderNo      string
	BusinessDate string
	Asset        string
	Fiat         float64
	NetAsset     float64
	FeeAsset     float64
}

type accountingCarryoverAllocation struct {
	LotID                  int64
	BuyOrderID             int64
	BuyOrderNo             string
	OriginBusinessDate     string
	SettlementBusinessDate string
	Asset                  string
	AllocatedFiat          float64
	ActualNetAsset         float64
	ActualFeeAsset         float64
	ProvisionalNetAsset    float64
	AdjustmentAsset        float64
}

// allocateAccountingCarryoverFIFO ports the legacy day-locked carryover rule into
// a deterministic, database-friendly FIFO allocator. Same-day BUYs are already
// part of the locked daily close and therefore never create a carryover
// settlement; only later business dates can settle a closed lot.
func allocateAccountingCarryoverFIFO(lots []*accountingCarryoverLotState, buys []accountingCarryoverBuyState) []accountingCarryoverAllocation {
	sort.SliceStable(lots, func(i, j int) bool {
		if lots[i].BusinessDate == lots[j].BusinessDate {
			return lots[i].ID < lots[j].ID
		}
		return lots[i].BusinessDate < lots[j].BusinessDate
	})
	sort.SliceStable(buys, func(i, j int) bool {
		if buys[i].BusinessDate == buys[j].BusinessDate {
			return buys[i].OrderID < buys[j].OrderID
		}
		return buys[i].BusinessDate < buys[j].BusinessDate
	})
	for _, lot := range lots {
		lot.SettledFiat = 0
		lot.SettledNet = 0
		lot.SettledFee = 0
		lot.OutstandingFiat = accountingMax(lot.InitialCarryoverFiat, 0)
		lot.EstimatedNet = lot.OutstandingFiat * accountingMax(lot.ProvisionalYield, 0)
	}
	allocations := make([]accountingCarryoverAllocation, 0)
	for _, buy := range buys {
		if buy.Fiat <= accountingCarryoverEpsilon || buy.NetAsset <= accountingCarryoverEpsilon {
			continue
		}
		remainingFiat := buy.Fiat
		for _, lot := range lots {
			if remainingFiat <= accountingCarryoverEpsilon {
				break
			}
			if lot.OutstandingFiat <= accountingCarryoverEpsilon || lot.BusinessDate >= buy.BusinessDate || !strings.EqualFold(lot.Asset, buy.Asset) {
				continue
			}
			allocatedFiat := math.Min(remainingFiat, lot.OutstandingFiat)
			ratio := allocatedFiat / buy.Fiat
			actualNet := buy.NetAsset * ratio
			actualFee := buy.FeeAsset * ratio
			provisional := allocatedFiat * accountingMax(lot.ProvisionalYield, 0)
			adjustment := 0.0
			if lot.ProvisionalYield > 0 {
				adjustment = actualNet - provisional
			}
			allocations = append(allocations, accountingCarryoverAllocation{
				LotID: lot.ID, BuyOrderID: buy.OrderID, BuyOrderNo: buy.OrderNo,
				OriginBusinessDate: lot.BusinessDate, SettlementBusinessDate: buy.BusinessDate, Asset: lot.Asset,
				AllocatedFiat: allocatedFiat, ActualNetAsset: actualNet, ActualFeeAsset: actualFee,
				ProvisionalNetAsset: provisional, AdjustmentAsset: adjustment,
			})
			lot.SettledFiat += allocatedFiat
			lot.SettledNet += actualNet
			lot.SettledFee += actualFee
			lot.OutstandingFiat = accountingMax(lot.OutstandingFiat-allocatedFiat, 0)
			lot.EstimatedNet = lot.OutstandingFiat * accountingMax(lot.ProvisionalYield, 0)
			remainingFiat -= allocatedFiat
		}
	}
	return allocations
}

func (s *Server) accountingEnsureCarryoverLots(ctx context.Context, tenantID int64, asset string) (int, bool, error) {
	asset = strings.ToUpper(firstNonEmpty(strings.TrimSpace(asset), "USDT"))
	q := `SELECT c.id,c.business_date,c.summary_json FROM accounting_closings c LEFT JOIN accounting_carryover_lots l ON l.tenant_id=c.tenant_id AND l.business_date=c.business_date AND UPPER(l.asset)=UPPER(` + s.store.Bind(2) + `) WHERE c.tenant_id=` + s.store.Bind(1) + ` AND c.status='closed' AND l.id IS NULL ORDER BY c.business_date,c.id`
	args := []any{tenantID, asset}
	// PostgreSQL placeholders keep their numeric identity even when $2 appears
	// before $1 in the JOIN. MySQL/MariaDB use positional '?' placeholders, so
	// their argument order must follow the SQL text.
	if s.store.Driver != "postgres" {
		args = []any{asset, tenantID}
	}
	rows, err := s.store.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return 0, false, err
	}
	type closeRow struct {
		ID   int64
		Date time.Time
		Raw  string
	}
	pending := []closeRow{}
	for rows.Next() {
		var r closeRow
		if err := rows.Scan(&r.ID, &r.Date, &r.Raw); err != nil {
			rows.Close()
			return 0, false, err
		}
		pending = append(pending, r)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, false, err
	}
	rows.Close()

	inserted := 0
	incomplete := false
	for _, row := range pending {
		m := jsonMap(row.Raw)
		closeAsset := strings.ToUpper(firstNonEmpty(asString(m["cryptoAsset"]), asset))
		if !strings.EqualFold(closeAsset, asset) {
			continue
		}
		sellFiat := firstNumeric(m, "replacementSellReceipts", "sellRevenue")
		soldAsset := firstNumeric(m, "replacementSoldQuantity", "liveSellCrypto")
		initial := firstNumeric(m, "carryoverOutstandingFiat")
		estimated := firstNumeric(m, "carryoverEstimatedNetQuantity")
		yield := firstNumeric(m, "carryoverProvisionalNetYieldPerBdt", "latestEffectiveBuyYieldPerBdt")
		if yield <= 0 && initial > accountingCarryoverEpsilon && estimated > accountingCarryoverEpsilon {
			yield = estimated / initial
		}
		operational := firstNumeric(m, "replacementOperationalProfitUsd", "operationalProfitUsd", "replacementProfitUsd")
		if sellFiat <= accountingCarryoverEpsilon && soldAsset <= accountingCarryoverEpsilon && initial <= accountingCarryoverEpsilon && math.Abs(operational) <= accountingCarryoverEpsilon {
			continue
		}
		provisionalRate := firstNumeric(m, "carryoverProvisionalBuyRate", "latestEffectiveBuyNetRate")
		if provisionalRate <= 0 && yield > 0 {
			provisionalRate = 1 / yield
		}
		source := "legacy_close_snapshot_v205"
		if strings.Contains(strings.ToLower(asString(m["profitModel"])), "v206") {
			source = "daily_close_v206"
		}
		if source == "daily_close_v206" {
			// A close may have been durably written immediately before a transient
			// carryover persistence failure. The v2.0.6 close snapshot contains the
			// exact closeByAgent data, so recover it instead of downgrading history.
			if err := s.accountingPersistCloseLot(ctx, tenantID, row.Date.Format("2006-01-02"), asset, m); err != nil {
				return inserted, incomplete, err
			}
		} else {
			if err := s.accountingUpsertCarryoverLot(ctx, row.ID, tenantID, row.Date.Format("2006-01-02"), asset, sellFiat, soldAsset, initial, estimated, yield, provisionalRate, firstNumeric(m, "carryoverProvisionalFeeRate"), operational, source, false); err != nil {
				return inserted, incomplete, err
			}
			// 2.0.5 close snapshots did not persist exact per-agent day-lock shares.
			// Keep this incomplete rather than inventing historical ownership.
			incomplete = true
		}
		inserted++
	}
	return inserted, incomplete, nil
}

func (s *Server) accountingUpsertCarryoverLot(ctx context.Context, closingID, tenantID int64, date, asset string, sellFiat, soldAsset, initial, estimated, yield, buyRate, feeRate, operational float64, source string, agentComplete bool) error {
	status := "settled"
	if initial > accountingCarryoverEpsilon {
		status = "open"
	}
	if s.store.Driver == "postgres" {
		_, err := s.store.DB.ExecContext(ctx, `INSERT INTO accounting_carryover_lots(tenant_id,closing_id,business_date,asset,sell_fiat,sold_asset,initial_carryover_fiat,initial_provisional_net_asset,provisional_net_yield_per_bdt,provisional_buy_rate,provisional_fee_rate,operational_profit_asset,outstanding_fiat,estimated_net_asset,status,source,agent_snapshot_complete,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$7,$8,$13,$14,$15,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,business_date,asset) DO UPDATE SET closing_id=EXCLUDED.closing_id,sell_fiat=EXCLUDED.sell_fiat,sold_asset=EXCLUDED.sold_asset,initial_carryover_fiat=EXCLUDED.initial_carryover_fiat,initial_provisional_net_asset=EXCLUDED.initial_provisional_net_asset,provisional_net_yield_per_bdt=EXCLUDED.provisional_net_yield_per_bdt,provisional_buy_rate=EXCLUDED.provisional_buy_rate,provisional_fee_rate=EXCLUDED.provisional_fee_rate,operational_profit_asset=EXCLUDED.operational_profit_asset,outstanding_fiat=EXCLUDED.outstanding_fiat,estimated_net_asset=EXCLUDED.estimated_net_asset,status=EXCLUDED.status,source=EXCLUDED.source,agent_snapshot_complete=EXCLUDED.agent_snapshot_complete,updated_at=CURRENT_TIMESTAMP`, tenantID, nullableInt64(closingID), date, strings.ToUpper(asset), sellFiat, soldAsset, initial, estimated, yield, buyRate, feeRate, operational, status, source, agentComplete)
		return err
	}
	_, err := s.store.DB.ExecContext(ctx, `INSERT INTO accounting_carryover_lots(tenant_id,closing_id,business_date,asset,sell_fiat,sold_asset,initial_carryover_fiat,initial_provisional_net_asset,provisional_net_yield_per_bdt,provisional_buy_rate,provisional_fee_rate,operational_profit_asset,outstanding_fiat,estimated_net_asset,status,source,agent_snapshot_complete,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(6),CURRENT_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE closing_id=VALUES(closing_id),sell_fiat=VALUES(sell_fiat),sold_asset=VALUES(sold_asset),initial_carryover_fiat=VALUES(initial_carryover_fiat),initial_provisional_net_asset=VALUES(initial_provisional_net_asset),provisional_net_yield_per_bdt=VALUES(provisional_net_yield_per_bdt),provisional_buy_rate=VALUES(provisional_buy_rate),provisional_fee_rate=VALUES(provisional_fee_rate),operational_profit_asset=VALUES(operational_profit_asset),outstanding_fiat=VALUES(outstanding_fiat),estimated_net_asset=VALUES(estimated_net_asset),status=VALUES(status),source=VALUES(source),agent_snapshot_complete=VALUES(agent_snapshot_complete),updated_at=CURRENT_TIMESTAMP(6)`, tenantID, nullableInt64(closingID), date, strings.ToUpper(asset), sellFiat, soldAsset, initial, estimated, yield, buyRate, feeRate, operational, initial, estimated, status, source, agentComplete)
	return err
}

func nullableInt64(v int64) any {
	if v <= 0 {
		return nil
	}
	return v
}

func mapSlice(v any) []map[string]any {
	out := []map[string]any{}
	switch x := v.(type) {
	case []map[string]any:
		return x
	case []any:
		for _, item := range x {
			if m, ok := item.(map[string]any); ok {
				out = append(out, m)
			}
		}
	}
	return out
}

func (s *Server) accountingPersistCloseLot(ctx context.Context, tenantID int64, date, asset string, summary map[string]any) error {
	var closingID int64
	if err := s.store.DB.QueryRowContext(ctx, `SELECT id FROM accounting_closings WHERE tenant_id=`+s.store.Bind(1)+` AND business_date=`+s.store.Bind(2)+` AND status='closed'`, tenantID, date).Scan(&closingID); err != nil {
		return err
	}
	day, _ := summary["replacementDay"].(map[string]any)
	if day == nil {
		day = map[string]any{}
	}
	sellFiat := firstNumeric(day, "sellFiat")
	if sellFiat <= 0 {
		sellFiat = firstNumeric(summary, "replacementSellReceipts", "sellRevenue")
	}
	soldAsset := firstNumeric(day, "soldQuantity")
	if soldAsset <= 0 {
		soldAsset = firstNumeric(summary, "liveSellCrypto")
	}
	initial := firstNumeric(day, "carryoverOutstandingFiat")
	estimated := firstNumeric(day, "carryoverEstimatedNetQuantity")
	yield := firstNumeric(day, "provisionalNetYieldPerBdt")
	if yield <= 0 && initial > accountingCarryoverEpsilon && estimated > accountingCarryoverEpsilon {
		yield = estimated / initial
	}
	if yield <= 0 {
		yield = firstNumeric(summary, "latestEffectiveBuyYieldPerBdt")
	}
	buyRate := firstNumeric(day, "provisionalBuyRate")
	if buyRate <= 0 && yield > 0 {
		buyRate = 1 / yield
	}
	operational := firstNumeric(day, "operationalProfitUsd")
	if math.Abs(operational) <= accountingCarryoverEpsilon {
		operational = firstNumeric(summary, "replacementOperationalProfitUsd")
	}
	if err := s.accountingUpsertCarryoverLot(ctx, closingID, tenantID, date, asset, sellFiat, soldAsset, initial, estimated, yield, buyRate, firstNumeric(day, "provisionalFeeRate"), operational, "daily_close_v206", false); err != nil {
		return err
	}
	var lotID int64
	if err := s.store.DB.QueryRowContext(ctx, `SELECT id FROM accounting_carryover_lots WHERE tenant_id=`+s.store.Bind(1)+` AND business_date=`+s.store.Bind(2)+` AND UPPER(asset)=UPPER(`+s.store.Bind(3)+`)`, tenantID, date, asset).Scan(&lotID); err != nil {
		return err
	}
	if _, err := s.store.DB.ExecContext(ctx, `DELETE FROM accounting_carryover_agent_shares WHERE tenant_id=`+s.store.Bind(1)+` AND carryover_lot_id=`+s.store.Bind(2), tenantID, lotID); err != nil {
		return err
	}
	shareSell := 0.0
	shareCount := 0
	for _, a := range mapSlice(summary["closeByAgent"]) {
		uid := asInt64(a["agentId"])
		shareFiat := asFloat(a["sellVolume"])
		shareSold := asFloat(a["soldCrypto"])
		if uid <= 0 || (shareFiat <= accountingCarryoverEpsilon && shareSold <= accountingCarryoverEpsilon) {
			continue
		}
		include := true
		if raw, ok := a["includedInCompanyTotals"]; ok {
			include = mapBool(map[string]any{"v": raw}, "v")
		}
		op := asFloat(a["operationalProfitUsd"])
		if s.store.Driver == "postgres" {
			_, err := s.store.DB.ExecContext(ctx, `INSERT INTO accounting_carryover_agent_shares(tenant_id,carryover_lot_id,user_id,sell_fiat,sold_asset,operational_profit_asset,included_in_company_totals,source,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,'daily_close_v206',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(carryover_lot_id,user_id) DO UPDATE SET sell_fiat=EXCLUDED.sell_fiat,sold_asset=EXCLUDED.sold_asset,operational_profit_asset=EXCLUDED.operational_profit_asset,included_in_company_totals=EXCLUDED.included_in_company_totals,source=EXCLUDED.source,updated_at=CURRENT_TIMESTAMP`, tenantID, lotID, uid, shareFiat, shareSold, op, include)
			if err != nil {
				return err
			}
		} else {
			_, err := s.store.DB.ExecContext(ctx, `INSERT INTO accounting_carryover_agent_shares(tenant_id,carryover_lot_id,user_id,sell_fiat,sold_asset,operational_profit_asset,included_in_company_totals,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'daily_close_v206',CURRENT_TIMESTAMP(6),CURRENT_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE sell_fiat=VALUES(sell_fiat),sold_asset=VALUES(sold_asset),operational_profit_asset=VALUES(operational_profit_asset),included_in_company_totals=VALUES(included_in_company_totals),source=VALUES(source),updated_at=CURRENT_TIMESTAMP(6)`, tenantID, lotID, uid, shareFiat, shareSold, op, include)
			if err != nil {
				return err
			}
		}
		shareSell += shareFiat
		shareCount++
	}
	complete := sellFiat <= accountingCarryoverEpsilon || (shareCount > 0 && math.Abs(shareSell-sellFiat) <= math.Max(0.01, sellFiat*0.000001))
	_, err := s.store.DB.ExecContext(ctx, `UPDATE accounting_carryover_lots SET agent_snapshot_complete=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=`+s.store.Bind(2)+` AND id=`+s.store.Bind(3), complete, tenantID, lotID)
	return err
}

func (s *Server) accountingDeleteCloseLot(ctx context.Context, tenantID int64, date string) error {
	_, err := s.store.DB.ExecContext(ctx, `DELETE FROM accounting_carryover_lots WHERE tenant_id=`+s.store.Bind(1)+` AND business_date=`+s.store.Bind(2), tenantID, date)
	return err
}

func (s *Server) accountingReconcileAllCarryover(ctx context.Context, tenantID int64) error {
	rows, err := s.store.DB.QueryContext(ctx, `SELECT DISTINCT asset FROM accounting_carryover_lots WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY asset`, tenantID)
	if err != nil {
		return err
	}
	assets := []string{}
	for rows.Next() {
		var asset string
		if rows.Scan(&asset) == nil && strings.TrimSpace(asset) != "" {
			assets = append(assets, asset)
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for _, asset := range assets {
		if err := s.accountingReconcileCarryoverAsset(ctx, tenantID, asset); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) accountingReconcileCarryoverAsset(ctx context.Context, tenantID int64, asset string) error {
	tx, err := s.store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	lotRows, err := tx.QueryContext(ctx, `SELECT id,business_date,asset,sell_fiat,sold_asset,initial_carryover_fiat,initial_provisional_net_asset,provisional_net_yield_per_bdt,provisional_buy_rate,provisional_fee_rate,operational_profit_asset,agent_snapshot_complete,source FROM accounting_carryover_lots WHERE tenant_id=`+s.store.Bind(1)+` AND UPPER(asset)=UPPER(`+s.store.Bind(2)+`) ORDER BY business_date,id FOR UPDATE`, tenantID, asset)
	if err != nil {
		return err
	}
	lots := []*accountingCarryoverLotState{}
	for lotRows.Next() {
		lot := &accountingCarryoverLotState{}
		var d time.Time
		if err := lotRows.Scan(&lot.ID, &d, &lot.Asset, &lot.SellFiat, &lot.SoldAsset, &lot.InitialCarryoverFiat, &lot.InitialProvisionalNetAsset, &lot.ProvisionalYield, &lot.ProvisionalBuyRate, &lot.ProvisionalFeeRate, &lot.OperationalProfit, &lot.AgentSnapshotComplete, &lot.Source); err != nil {
			lotRows.Close()
			return err
		}
		lot.BusinessDate = d.Format("2006-01-02")
		lots = append(lots, lot)
	}
	if err := lotRows.Err(); err != nil {
		lotRows.Close()
		return err
	}
	lotRows.Close()
	if len(lots) == 0 {
		return tx.Commit()
	}
	settings := s.accountingSettings(ctx, tenantID)
	offsetMinutes := accountingOffsetMinutes(settings)
	move := orderMovementSQL("o")
	buyRows, err := tx.QueryContext(ctx, `SELECT o.id,o.external_order_no,o.total,`+move+`,CASE WHEN o.accounting_fact_version>=1 THEN o.accounting_fee_asset ELSE 0 END,COALESCE(o.completed_at,o.updated_at) FROM orders o WHERE o.tenant_id=`+s.store.Bind(1)+` AND o.order_source='binance' AND o.status IN ('completed','released') AND UPPER(o.trade_type)='BUY' AND UPPER(o.asset)=UPPER(`+s.store.Bind(2)+`) AND o.total>0 ORDER BY COALESCE(o.completed_at,o.updated_at),o.id`, tenantID, asset)
	if err != nil {
		return err
	}
	buys := []accountingCarryoverBuyState{}
	for buyRows.Next() {
		var b accountingCarryoverBuyState
		var at time.Time
		if err := buyRows.Scan(&b.OrderID, &b.OrderNo, &b.Fiat, &b.NetAsset, &b.FeeAsset, &at); err != nil {
			buyRows.Close()
			return err
		}
		b.BusinessDate = accountingBusinessDateAt(at, offsetMinutes)
		b.Asset = strings.ToUpper(asset)
		buys = append(buys, b)
	}
	if err := buyRows.Err(); err != nil {
		buyRows.Close()
		return err
	}
	buyRows.Close()
	allocations := allocateAccountingCarryoverFIFO(lots, buys)
	if _, err := tx.ExecContext(ctx, `DELETE FROM accounting_carryover_settlements WHERE tenant_id=`+s.store.Bind(1)+` AND UPPER(asset)=UPPER(`+s.store.Bind(2)+`)`, tenantID, asset); err != nil {
		return err
	}
	for _, a := range allocations {
		if s.store.Driver == "postgres" {
			_, err = tx.ExecContext(ctx, `INSERT INTO accounting_carryover_settlements(tenant_id,carryover_lot_id,buy_order_id,origin_business_date,settlement_business_date,asset,buy_order_no,allocated_fiat,actual_net_asset,actual_fee_asset,provisional_net_asset,adjustment_asset,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, tenantID, a.LotID, a.BuyOrderID, a.OriginBusinessDate, a.SettlementBusinessDate, a.Asset, a.BuyOrderNo, a.AllocatedFiat, a.ActualNetAsset, a.ActualFeeAsset, a.ProvisionalNetAsset, a.AdjustmentAsset)
		} else {
			_, err = tx.ExecContext(ctx, `INSERT INTO accounting_carryover_settlements(tenant_id,carryover_lot_id,buy_order_id,origin_business_date,settlement_business_date,asset,buy_order_no,allocated_fiat,actual_net_asset,actual_fee_asset,provisional_net_asset,adjustment_asset,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(6),CURRENT_TIMESTAMP(6))`, tenantID, a.LotID, a.BuyOrderID, a.OriginBusinessDate, a.SettlementBusinessDate, a.Asset, a.BuyOrderNo, a.AllocatedFiat, a.ActualNetAsset, a.ActualFeeAsset, a.ProvisionalNetAsset, a.AdjustmentAsset)
		}
		if err != nil {
			return err
		}
	}
	for _, lot := range lots {
		status := "settled"
		if lot.OutstandingFiat > accountingCarryoverEpsilon {
			status = "open"
		}
		if _, err := tx.ExecContext(ctx, `UPDATE accounting_carryover_lots SET settled_fiat=`+s.store.Bind(1)+`,settled_net_asset=`+s.store.Bind(2)+`,settled_fee_asset=`+s.store.Bind(3)+`,outstanding_fiat=`+s.store.Bind(4)+`,estimated_net_asset=`+s.store.Bind(5)+`,status=`+s.store.Bind(6)+`,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=`+s.store.Bind(7)+` AND id=`+s.store.Bind(8), lot.SettledFiat, lot.SettledNet, lot.SettledFee, lot.OutstandingFiat, lot.EstimatedNet, status, tenantID, lot.ID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Server) accountingCarryoverReconcile(w http.ResponseWriter, r *http.Request, u ctxUser) {
	settings := s.accountingSettings(r.Context(), u.TenantID)
	asset := strings.ToUpper(firstNonEmpty(asString(settings["cryptoAsset"]), "USDT"))
	inserted, incomplete, err := s.accountingEnsureCarryoverLots(r.Context(), u.TenantID, asset)
	if err == nil {
		err = s.accountingReconcileAllCarryover(r.Context(), u.TenantID)
	}
	if err != nil {
		replyDBError(w, err)
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "accounting.carryover_reconciled", "accounting", fmt.Sprint(u.TenantID), r, map[string]any{"backfilledCloseLots": inserted, "legacyAgentHistoryIncomplete": incomplete})
	writeJSON(w, 200, map[string]any{"ok": true, "backfilledCloseLots": inserted, "legacyAgentHistoryIncomplete": incomplete})
}
