package httpapi

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

type accountingSettlementDayV206 struct {
	AllocatedFiat float64
	ActualNet     float64
	ActualFee     float64
	Adjustment    float64
}

type accountingAgentDayV206 struct {
	Operational       float64
	Adjustment        float64
	OutstandingFiat   float64
	EstimatedNetAsset float64
}

type accountingAgentTotalV206 struct {
	ID          int64
	Name        string
	Include     bool
	Operational float64
	Adjustment  float64
}

type accountingSellShareV206 struct {
	UserID    int64
	Name      string
	Include   bool
	SellFiat  float64
	SoldAsset float64
}

type accountingCarryoverReportV206 struct {
	Days              []map[string]any
	AgentDay          map[string]map[int64]accountingAgentDayV206
	AgentTotals       map[int64]*accountingAgentTotalV206
	Operational       float64
	Adjustment        float64
	Profit            float64
	OutstandingFiat   float64
	EstimatedNetAsset float64
	LegacyIncomplete  bool
}

func accountingOrderEventSQL(alias string) string {
	return `COALESCE(` + alias + `.completed_at,` + alias + `.updated_at)`
}

func (s *Server) accountingOrderDateExpr(alias string, offsetMinutes int) string {
	event := accountingOrderEventSQL(alias)
	if offsetMinutes < -720 {
		offsetMinutes = -720
	}
	if offsetMinutes > 840 {
		offsetMinutes = 840
	}
	if s.store.Driver == "postgres" {
		return fmt.Sprintf(`TO_CHAR((%s + INTERVAL '%d minutes'),'YYYY-MM-DD')`, event, offsetMinutes)
	}
	return fmt.Sprintf(`DATE_FORMAT(DATE_ADD(%s, INTERVAL %d MINUTE),'%%Y-%%m-%%d')`, event, offsetMinutes)
}

func cloneAnyMap(in map[string]any) map[string]any {
	out := make(map[string]any, len(in)+8)
	for k, v := range in {
		out[k] = v
	}
	return out
}

func dateRangeStrings(rg dateRange) (string, string) {
	return rg.StartDate, rg.EndDateExclusive
}

func (s *Server) accountingSettlementDaysV206(ctx context.Context, tenantID int64, rg dateRange, asset string) map[string]accountingSettlementDayV206 {
	start, end := dateRangeStrings(rg)
	q := `SELECT settlement_business_date,COALESCE(SUM(allocated_fiat),0),COALESCE(SUM(actual_net_asset),0),COALESCE(SUM(actual_fee_asset),0),COALESCE(SUM(adjustment_asset),0) FROM accounting_carryover_settlements WHERE tenant_id=` + s.store.Bind(1) + ` AND UPPER(asset)=UPPER(` + s.store.Bind(2) + `) AND settlement_business_date>=` + s.store.Bind(3) + ` AND settlement_business_date<` + s.store.Bind(4) + ` GROUP BY settlement_business_date ORDER BY settlement_business_date`
	rows, err := s.store.DB.QueryContext(ctx, q, tenantID, asset, start, end)
	if err != nil {
		return map[string]accountingSettlementDayV206{}
	}
	defer rows.Close()
	out := map[string]accountingSettlementDayV206{}
	for rows.Next() {
		var d time.Time
		var v accountingSettlementDayV206
		if rows.Scan(&d, &v.AllocatedFiat, &v.ActualNet, &v.ActualFee, &v.Adjustment) == nil {
			out[d.Format("2006-01-02")] = v
		}
	}
	return out
}

func (s *Server) accountingClosedLotsV206(ctx context.Context, tenantID int64, rg dateRange, asset string) (map[string]*accountingCarryoverLotState, bool) {
	start, end := dateRangeStrings(rg)
	q := `SELECT business_date,asset,sell_fiat,sold_asset,initial_carryover_fiat,initial_provisional_net_asset,provisional_net_yield_per_bdt,provisional_buy_rate,provisional_fee_rate,operational_profit_asset,settled_fiat,settled_net_asset,settled_fee_asset,outstanding_fiat,estimated_net_asset,agent_snapshot_complete,source FROM accounting_carryover_lots WHERE tenant_id=` + s.store.Bind(1) + ` AND UPPER(asset)=UPPER(` + s.store.Bind(2) + `) AND business_date>=` + s.store.Bind(3) + ` AND business_date<` + s.store.Bind(4) + ` ORDER BY business_date,id`
	rows, err := s.store.DB.QueryContext(ctx, q, tenantID, asset, start, end)
	if err != nil {
		return map[string]*accountingCarryoverLotState{}, false
	}
	defer rows.Close()
	out := map[string]*accountingCarryoverLotState{}
	incomplete := false
	for rows.Next() {
		lot := &accountingCarryoverLotState{}
		var d time.Time
		if rows.Scan(&d, &lot.Asset, &lot.SellFiat, &lot.SoldAsset, &lot.InitialCarryoverFiat, &lot.InitialProvisionalNetAsset, &lot.ProvisionalYield, &lot.ProvisionalBuyRate, &lot.ProvisionalFeeRate, &lot.OperationalProfit, &lot.SettledFiat, &lot.SettledNet, &lot.SettledFee, &lot.OutstandingFiat, &lot.EstimatedNet, &lot.AgentSnapshotComplete, &lot.Source) != nil {
			continue
		}
		lot.BusinessDate = d.Format("2006-01-02")
		out[lot.BusinessDate] = lot
		if !lot.AgentSnapshotComplete && (math.Abs(lot.OperationalProfit) > accountingCarryoverEpsilon || lot.InitialCarryoverFiat > accountingCarryoverEpsilon) {
			incomplete = true
		}
	}
	return out, incomplete
}

func (s *Server) accountingHasIncompleteAgentHistoryV206(ctx context.Context, tenantID int64, asset string) bool {
	var count int64
	q := `SELECT COUNT(*) FROM accounting_carryover_lots WHERE tenant_id=` + s.store.Bind(1) + ` AND UPPER(asset)=UPPER(` + s.store.Bind(2) + `) AND agent_snapshot_complete=FALSE`
	if err := s.store.DB.QueryRowContext(ctx, q, tenantID, asset).Scan(&count); err != nil {
		return false
	}
	return count > 0
}

func (s *Server) accountingUsersV206(ctx context.Context, tenantID int64) map[int64]accountingAgentTotalV206 {
	out := map[int64]accountingAgentTotalV206{}
	rows, err := s.store.DB.QueryContext(ctx, `SELECT id,name,include_profit_in_company_totals FROM users WHERE tenant_id=`+s.store.Bind(1), tenantID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var a accountingAgentTotalV206
		if rows.Scan(&a.ID, &a.Name, &a.Include) == nil {
			out[a.ID] = a
		}
	}
	return out
}

func (s *Server) accountingSellSharesByDayV206(ctx context.Context, tenantID int64, rg dateRange, asset string) map[string]map[int64]*accountingSellShareV206 {
	users := s.accountingUsersV206(ctx, tenantID)
	dateExpr := s.accountingOrderDateExpr("o", rg.OffsetMinutes)
	event := accountingOrderEventSQL("o")
	move := orderMovementSQL("o")
	out := map[string]map[int64]*accountingSellShareV206{}
	add := func(day string, userID int64, fiat, sold float64) {
		if userID <= 0 || (fiat <= accountingCarryoverEpsilon && sold <= accountingCarryoverEpsilon) {
			return
		}
		m := out[day]
		if m == nil {
			m = map[int64]*accountingSellShareV206{}
			out[day] = m
		}
		sh := m[userID]
		if sh == nil {
			u := users[userID]
			sh = &accountingSellShareV206{UserID: userID, Name: u.Name, Include: u.Include}
			m[userID] = sh
		}
		sh.SellFiat += fiat
		sh.SoldAsset += sold
	}
	q := `SELECT ` + dateExpr + `,o.assigned_user_id,COALESCE(SUM(o.total),0),COALESCE(SUM(` + move + `),0) FROM orders o WHERE o.tenant_id=` + s.store.Bind(1) + ` AND o.order_source='binance' AND o.status IN ('completed','released') AND UPPER(o.trade_type)='SELL' AND ` + event + `>=` + s.store.Bind(2) + ` AND ` + event + `<` + s.store.Bind(3) + ` AND UPPER(o.asset)=UPPER(` + s.store.Bind(4) + `) AND o.assigned_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payment_splits ps WHERE ps.tenant_id=o.tenant_id AND ps.order_id=o.id AND ps.assigned_user_id IS NOT NULL AND ps.amount>0 AND ps.status NOT IN ('cancelled','deleted','reversed')) GROUP BY ` + dateExpr + `,o.assigned_user_id`
	if rows, err := s.store.DB.QueryContext(ctx, q, tenantID, rg.Start, rg.End, asset); err == nil {
		for rows.Next() {
			var day string
			var uid int64
			var fiat, sold float64
			if rows.Scan(&day, &uid, &fiat, &sold) == nil {
				add(day, uid, fiat, sold)
			}
		}
		rows.Close()
	}
	q2 := `SELECT ` + dateExpr + `,ps.assigned_user_id,COALESCE(SUM(o.total*(ps.amount/st.total_amount)),0),COALESCE(SUM((` + move + `)*(ps.amount/st.total_amount)),0) FROM orders o JOIN payment_splits ps ON ps.order_id=o.id AND ps.tenant_id=o.tenant_id JOIN (SELECT order_id,SUM(amount) total_amount FROM payment_splits WHERE tenant_id=` + s.store.Bind(1) + ` AND assigned_user_id IS NOT NULL AND amount>0 AND status NOT IN ('cancelled','deleted','reversed') GROUP BY order_id) st ON st.order_id=o.id WHERE o.tenant_id=` + s.store.Bind(2) + ` AND o.order_source='binance' AND o.status IN ('completed','released') AND UPPER(o.trade_type)='SELL' AND ` + event + `>=` + s.store.Bind(3) + ` AND ` + event + `<` + s.store.Bind(4) + ` AND UPPER(o.asset)=UPPER(` + s.store.Bind(5) + `) AND ps.assigned_user_id IS NOT NULL AND ps.amount>0 AND ps.status NOT IN ('cancelled','deleted','reversed') AND st.total_amount>0 GROUP BY ` + dateExpr + `,ps.assigned_user_id`
	if rows, err := s.store.DB.QueryContext(ctx, q2, tenantID, tenantID, rg.Start, rg.End, asset); err == nil {
		for rows.Next() {
			var day string
			var uid int64
			var fiat, sold float64
			if rows.Scan(&day, &uid, &fiat, &sold) == nil {
				add(day, uid, fiat, sold)
			}
		}
		rows.Close()
	}
	return out
}

func (s *Server) accountingClosedAgentSharesV206(ctx context.Context, tenantID int64, rg dateRange, asset string, report *accountingCarryoverReportV206) {
	start, end := dateRangeStrings(rg)
	q := `SELECT l.business_date,l.sell_fiat,l.outstanding_fiat,l.estimated_net_asset,l.agent_snapshot_complete,sh.user_id,u.name,sh.sell_fiat,sh.sold_asset,sh.operational_profit_asset,sh.included_in_company_totals FROM accounting_carryover_lots l LEFT JOIN accounting_carryover_agent_shares sh ON sh.carryover_lot_id=l.id AND sh.tenant_id=l.tenant_id LEFT JOIN users u ON u.id=sh.user_id AND u.tenant_id=l.tenant_id WHERE l.tenant_id=` + s.store.Bind(1) + ` AND UPPER(l.asset)=UPPER(` + s.store.Bind(2) + `) AND l.business_date>=` + s.store.Bind(3) + ` AND l.business_date<` + s.store.Bind(4) + ` ORDER BY l.business_date,l.id,sh.user_id`
	rows, err := s.store.DB.QueryContext(ctx, q, tenantID, asset, start, end)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var d time.Time
		var lotSell, lotOutstanding, lotEstimated float64
		var complete bool
		var uid *int64
		var name *string
		var shareSell, sold, op *float64
		var include *bool
		if rows.Scan(&d, &lotSell, &lotOutstanding, &lotEstimated, &complete, &uid, &name, &shareSell, &sold, &op, &include) != nil {
			continue
		}
		if !complete {
			report.LegacyIncomplete = true
		}
		if uid == nil || shareSell == nil || op == nil {
			continue
		}
		day := d.Format("2006-01-02")
		ad := report.AgentDay[day]
		if ad == nil {
			ad = map[int64]accountingAgentDayV206{}
			report.AgentDay[day] = ad
		}
		v := ad[*uid]
		v.Operational += *op
		if lotSell > accountingCarryoverEpsilon {
			share := *shareSell / lotSell
			v.OutstandingFiat += lotOutstanding * share
			v.EstimatedNetAsset += lotEstimated * share
		}
		ad[*uid] = v
		t := report.AgentTotals[*uid]
		if t == nil {
			t = &accountingAgentTotalV206{ID: *uid}
			report.AgentTotals[*uid] = t
		}
		if name != nil {
			t.Name = *name
		}
		if include != nil {
			t.Include = *include
		}
		t.Operational += *op
	}
}

func (s *Server) accountingSettlementAgentAdjustmentsV206(ctx context.Context, tenantID int64, rg dateRange, asset string, report *accountingCarryoverReportV206) {
	start, end := dateRangeStrings(rg)
	q := `SELECT st.settlement_business_date,sh.user_id,u.name,sh.included_in_company_totals,COALESCE(SUM(st.adjustment_asset*(sh.sell_fiat/NULLIF(l.sell_fiat,0))),0),MIN(CASE WHEN l.agent_snapshot_complete THEN 1 ELSE 0 END) FROM accounting_carryover_settlements st JOIN accounting_carryover_lots l ON l.id=st.carryover_lot_id AND l.tenant_id=st.tenant_id JOIN accounting_carryover_agent_shares sh ON sh.carryover_lot_id=l.id AND sh.tenant_id=l.tenant_id LEFT JOIN users u ON u.id=sh.user_id AND u.tenant_id=l.tenant_id WHERE st.tenant_id=` + s.store.Bind(1) + ` AND UPPER(st.asset)=UPPER(` + s.store.Bind(2) + `) AND st.settlement_business_date>=` + s.store.Bind(3) + ` AND st.settlement_business_date<` + s.store.Bind(4) + ` AND l.sell_fiat>0 GROUP BY st.settlement_business_date,sh.user_id,u.name,sh.included_in_company_totals ORDER BY st.settlement_business_date,sh.user_id`
	rows, err := s.store.DB.QueryContext(ctx, q, tenantID, asset, start, end)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var d time.Time
		var uid int64
		var name string
		var include bool
		var completeInt int
		var adj float64
		if rows.Scan(&d, &uid, &name, &include, &adj, &completeInt) != nil {
			continue
		}
		if completeInt == 0 {
			report.LegacyIncomplete = true
		}
		day := d.Format("2006-01-02")
		ad := report.AgentDay[day]
		if ad == nil {
			ad = map[int64]accountingAgentDayV206{}
			report.AgentDay[day] = ad
		}
		v := ad[uid]
		v.Adjustment += adj
		ad[uid] = v
		t := report.AgentTotals[uid]
		if t == nil {
			t = &accountingAgentTotalV206{ID: uid, Name: name, Include: include}
			report.AgentTotals[uid] = t
		}
		t.Adjustment += adj
	}
}

func (s *Server) accountingCarryoverReportV206(ctx context.Context, tenantID int64, rg dateRange, asset string, rate, latestYield float64) accountingCarryoverReportV206 {
	report := accountingCarryoverReportV206{AgentDay: map[string]map[int64]accountingAgentDayV206{}, AgentTotals: map[int64]*accountingAgentTotalV206{}}
	baseDays := s.accountingDailyReplacement(ctx, tenantID, rg, asset, rate, latestYield)
	settlements := s.accountingSettlementDaysV206(ctx, tenantID, rg, asset)
	closedLots, incomplete := s.accountingClosedLotsV206(ctx, tenantID, rg, asset)
	report.LegacyIncomplete = incomplete || s.accountingHasIncompleteAgentHistoryV206(ctx, tenantID, asset)
	dayMap := map[string]map[string]any{}
	for _, raw := range baseDays {
		day := asString(raw["businessDate"])
		if day != "" {
			dayMap[day] = cloneAnyMap(raw)
		}
	}
	for day := range settlements {
		if dayMap[day] == nil {
			dayMap[day] = map[string]any{"businessDate": day, "closed": false, "sellOrders": int64(0), "buyOrders": int64(0), "sellFiat": 0.0, "soldQuantity": 0.0, "buyFiat": 0.0, "buyNetQuantity": 0.0}
		}
	}
	for day := range closedLots {
		if dayMap[day] == nil {
			dayMap[day] = map[string]any{"businessDate": day, "sellFiat": closedLots[day].SellFiat, "soldQuantity": closedLots[day].SoldAsset, "buyFiat": 0.0, "buyNetQuantity": 0.0}
		}
	}
	keys := make([]string, 0, len(dayMap))
	for k := range dayMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, day := range keys {
		row := dayMap[day]
		st := settlements[day]
		buyFiat := asFloat(row["buyFiat"])
		buyNet := asFloat(row["buyNetQuantity"])
		buyFee := asFloat(row["buyFeeQuantity"])
		sellFiat := asFloat(row["sellFiat"])
		sold := asFloat(row["soldQuantity"])
		availableFiat := accountingMax(buyFiat-st.AllocatedFiat, 0)
		availableNet := accountingMax(buyNet-st.ActualNet, 0)
		availableFee := accountingMax(buyFee-st.ActualFee, 0)
		yield := latestYield
		if availableFiat > accountingCarryoverEpsilon && availableNet > accountingCarryoverEpsilon {
			yield = availableNet / availableFiat
		}
		actualFiat := math.Min(accountingMax(sellFiat, 0), availableFiat)
		actualNet := 0.0
		actualFee := 0.0
		if availableFiat > accountingCarryoverEpsilon && actualFiat > 0 {
			ratio := actualFiat / availableFiat
			actualNet = availableNet * ratio
			actualFee = availableFee * ratio
		}
		outstanding := accountingMax(sellFiat-actualFiat, 0)
		estimated := 0.0
		if yield > 0 {
			estimated = outstanding * yield
		}
		operational := actualNet + estimated - sold
		closed := false
		rateSource := "normalized_completed_buy_yield_v206"
		if lot := closedLots[day]; lot != nil {
			closed = true
			operational = lot.OperationalProfit
			outstanding = lot.OutstandingFiat
			estimated = lot.EstimatedNet
			if lot.ProvisionalYield > 0 {
				yield = lot.ProvisionalYield
			}
			if lot.ProvisionalBuyRate > 0 {
				row["provisionalBuyRate"] = lot.ProvisionalBuyRate
			}
			row["provisionalFeeRate"] = lot.ProvisionalFeeRate
			rateSource = "locked_daily_close_v206"
		}
		adjustment := st.Adjustment
		profit := operational + adjustment
		row["closed"] = closed
		row["carryoverBuyFiat"] = st.AllocatedFiat
		row["currentDayBuyFiat"] = actualFiat
		row["inventoryBuyFiat"] = accountingMax(availableFiat-actualFiat, 0)
		row["actualReplacementBuyFiat"] = actualFiat
		row["actualReplacementNetQuantity"] = actualNet
		row["actualReplacementFeeQuantity"] = actualFee
		row["carryoverOutstandingFiat"] = outstanding
		row["carryoverEstimatedNetQuantity"] = estimated
		row["provisionalNetYieldPerBdt"] = yield
		if asFloat(row["provisionalBuyRate"]) <= 0 && yield > 0 {
			row["provisionalBuyRate"] = 1 / yield
		}
		row["operationalProfitUsd"] = operational
		row["operationalProfitBdt"] = operational * rate
		row["carryoverAdjustmentUsd"] = adjustment
		row["carryoverAdjustmentBdt"] = adjustment * rate
		row["profitUsd"] = profit
		row["profitBdt"] = profit * rate
		row["rateSource"] = rateSource
		row["missingBuyRate"] = outstanding > accountingCarryoverEpsilon && yield <= 0
		report.Operational += operational
		report.Adjustment += adjustment
		report.Profit += profit
		report.OutstandingFiat += outstanding
		report.EstimatedNetAsset += estimated
		report.Days = append(report.Days, row)
	}

	// Closed-day agent profit is read from the immutable normalized share snapshot.
	s.accountingClosedAgentSharesV206(ctx, tenantID, rg, asset, &report)
	// Open-day operational profit follows SELL ownership, exactly like the legacy
	// carryover model; the agent who happens to execute the replacement BUY does
	// not become the owner of that SELL lot's profit.
	sharesByDay := s.accountingSellSharesByDayV206(ctx, tenantID, rg, asset)
	closedDate := map[string]bool{}
	for d := range closedLots {
		closedDate[d] = true
	}
	dayByDate := map[string]map[string]any{}
	for _, row := range report.Days {
		dayByDate[asString(row["businessDate"])] = row
	}
	for day, shares := range sharesByDay {
		if closedDate[day] {
			continue
		}
		row := dayByDate[day]
		if row == nil {
			continue
		}
		sellFiat := asFloat(row["sellFiat"])
		if sellFiat <= accountingCarryoverEpsilon {
			continue
		}
		replacementNet := asFloat(row["actualReplacementNetQuantity"]) + asFloat(row["carryoverEstimatedNetQuantity"])
		shareTotal := 0.0
		for _, sh := range shares {
			shareTotal += sh.SellFiat
			share := sh.SellFiat / sellFiat
			op := replacementNet*share - sh.SoldAsset
			v := report.AgentDay[day][sh.UserID]
			if report.AgentDay[day] == nil {
				report.AgentDay[day] = map[int64]accountingAgentDayV206{}
				v = accountingAgentDayV206{}
			}
			v.Operational += op
			v.OutstandingFiat += asFloat(row["carryoverOutstandingFiat"]) * share
			v.EstimatedNetAsset += asFloat(row["carryoverEstimatedNetQuantity"]) * share
			report.AgentDay[day][sh.UserID] = v
			t := report.AgentTotals[sh.UserID]
			if t == nil {
				t = &accountingAgentTotalV206{ID: sh.UserID, Name: sh.Name, Include: sh.Include}
				report.AgentTotals[sh.UserID] = t
			}
			t.Operational += op
		}
		if math.Abs(shareTotal-sellFiat) > math.Max(0.01, sellFiat*0.000001) {
			report.LegacyIncomplete = true
		}
	}
	s.accountingSettlementAgentAdjustmentsV206(ctx, tenantID, rg, asset, &report)
	return report
}

func (s *Server) accountingApplyAgentTotalsV206(ctx context.Context, tenantID int64, base []map[string]any, totals map[int64]*accountingAgentTotalV206, rate float64) []map[string]any {
	users := s.accountingUsersV206(ctx, tenantID)
	byID := map[int64]map[string]any{}
	out := make([]map[string]any, 0, len(base)+len(totals))
	for _, raw := range base {
		row := cloneAnyMap(raw)
		id := asInt64(row["agentId"])
		byID[id] = row
		out = append(out, row)
	}
	for id, t := range totals {
		row := byID[id]
		if row == nil {
			u := users[id]
			row = map[string]any{"agentId": id, "name": firstNonEmpty(t.Name, u.Name), "orders": int64(0), "buyVolume": 0.0, "buyCrypto": 0.0, "sellVolume": 0.0, "sellCrypto": 0.0, "soldCrypto": 0.0, "otherIncome": 0.0, "expenses": 0.0, "includedInCompanyTotals": t.Include}
			if t.Name == "" {
				row["includedInCompanyTotals"] = u.Include
			}
			byID[id] = row
			out = append(out, row)
		}
		op := t.Operational
		adj := t.Adjustment
		profit := op + adj
		row["operationalProfitUsd"] = op
		row["carryoverAdjustmentUsd"] = adj
		row["profitUsd"] = profit
		row["operationalProfitBdt"] = op * rate
		row["carryoverAdjustmentBdt"] = adj * rate
		row["profitBdt"] = profit * rate
		row["grossProfit"] = profit * rate
		row["replacementNetCrypto"] = asFloat(row["soldCrypto"]) + profit
		row["netContribution"] = profit*rate + asFloat(row["otherIncome"]) - asFloat(row["expenses"])
		if _, ok := row["accountingScope"]; !ok {
			if mapBool(row, "includedInCompanyTotals") {
				row["accountingScope"] = "company"
			} else {
				row["accountingScope"] = "individual_only"
			}
		}
	}
	// Any base row without a v2.0.6 profit allocation is explicitly zero rather
	// than silently falling back to the old cross-day approximation.
	for _, row := range out {
		id := asInt64(row["agentId"])
		if totals[id] == nil {
			for _, k := range []string{"operationalProfitUsd", "carryoverAdjustmentUsd", "profitUsd", "operationalProfitBdt", "carryoverAdjustmentBdt", "profitBdt", "grossProfit"} {
				row[k] = 0.0
			}
			row["netContribution"] = asFloat(row["otherIncome"]) - asFloat(row["expenses"])
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return asFloat(out[i]["netContribution"]) > asFloat(out[j]["netContribution"]) })
	return out
}

func (s *Server) accountingAgentDaysV206(ctx context.Context, tenantID, userID int64, rg dateRange, asset string, rate, latestYield float64, report accountingCarryoverReportV206) []map[string]any {
	base := s.accountingDailyReplacementForAgent(ctx, tenantID, userID, rg, asset, rate, latestYield)
	byDate := map[string]map[string]any{}
	for _, raw := range base {
		byDate[asString(raw["businessDate"])] = cloneAnyMap(raw)
	}
	for day, agents := range report.AgentDay {
		v, ok := agents[userID]
		if !ok && byDate[day] == nil {
			continue
		}
		row := byDate[day]
		if row == nil {
			row = map[string]any{"businessDate": day, "sellOrders": int64(0), "buyOrders": int64(0), "sellFiat": 0.0, "soldQuantity": 0.0, "buyFiat": 0.0, "buyNetQuantity": 0.0}
			byDate[day] = row
		}
		row["operationalProfitUsd"] = v.Operational
		row["operationalProfitBdt"] = v.Operational * rate
		row["carryoverAdjustmentUsd"] = v.Adjustment
		row["carryoverAdjustmentBdt"] = v.Adjustment * rate
		row["profitUsd"] = v.Operational + v.Adjustment
		row["profitBdt"] = (v.Operational + v.Adjustment) * rate
		row["carryoverOutstandingFiat"] = v.OutstandingFiat
		row["carryoverEstimatedNetQuantity"] = v.EstimatedNetAsset
	}
	keys := make([]string, 0, len(byDate))
	for k := range byDate {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]map[string]any, 0, len(keys))
	for _, k := range keys {
		out = append(out, byDate[k])
	}
	return out
}

func (s *Server) accountingSummaryV206(ctx context.Context, u ctxUser, rg dateRange, settings map[string]any) map[string]any {
	rate := asFloat(settings["companyDollarRate"])
	if rate <= 0 {
		rate = 118
	}
	asset := strings.ToUpper(firstNonEmpty(asString(settings["cryptoAsset"]), "USDT"))
	backfilled, legacyIncomplete, ensureErr := s.accountingEnsureCarryoverLots(ctx, u.TenantID, asset)
	var reconcileErr error
	if ensureErr == nil && backfilled > 0 {
		reconcileErr = s.accountingReconcileAllCarryover(ctx, u.TenantID)
	}
	base := s.accountingSummaryV205(ctx, u, rg, settings)
	if ensureErr != nil || reconcileErr != nil {
		err := ensureErr
		if err == nil {
			err = reconcileErr
		}
		summary, _ := base["summary"].(map[string]any)
		if summary == nil {
			summary = map[string]any{}
			base["summary"] = summary
		}
		summary["carryoverModelVersion"] = "normalized_fifo_carryover_v206_unavailable"
		base["carryover"] = map[string]any{"model": "normalized_fifo_carryover_v206", "backfilledCloseLots": backfilled, "legacyAgentHistoryIncomplete": legacyIncomplete, "reconciliationError": err.Error(), "fallback": "normalized_order_ledger_v205"}
		if p, ok := base["permissions"].(map[string]any); ok {
			p["canReconcileCarryover"] = s.hasPerm(u, "accounting.close")
		}
		return base
	}
	latestYield, _, _, _ := s.accountingLatestBuyYield(ctx, u.TenantID, rg.End, asset)
	carry := s.accountingCarryoverReportV206(ctx, u.TenantID, rg, asset, rate, latestYield)
	carry.LegacyIncomplete = carry.LegacyIncomplete || legacyIncomplete

	summary, _ := base["summary"].(map[string]any)
	if summary == nil {
		summary = map[string]any{}
		base["summary"] = summary
	}
	baseAgents := mapSlice(base["byAgent"])
	agents := s.accountingApplyAgentTotalsV206(ctx, u.TenantID, baseAgents, carry.AgentTotals, rate)
	isAgent := u.Role == "agent" && !u.IsOwner && !s.hasPerm(u, "accounting.manage")
	if isAgent {
		filtered := []map[string]any{}
		for _, a := range agents {
			if asInt64(a["agentId"]) == u.ID {
				filtered = append(filtered, a)
				break
			}
		}
		agents = filtered
		base["replacementDays"] = s.accountingAgentDaysV206(ctx, u.TenantID, u.ID, rg, asset, rate, latestYield, carry)
		t := carry.AgentTotals[u.ID]
		op, adj := 0.0, 0.0
		if t != nil {
			op, adj = t.Operational, t.Adjustment
		}
		summary["replacementOperationalProfitUsd"] = op
		summary["replacementOperationalProfitBdt"] = op * rate
		summary["carryoverAdjustmentUsd"] = adj
		summary["carryoverAdjustmentBdt"] = adj * rate
		summary["replacementProfitUsd"] = op + adj
		summary["replacementProfitBdt"] = (op + adj) * rate
		outstanding, estimated := 0.0, 0.0
		for _, d := range mapSlice(base["replacementDays"]) {
			outstanding += asFloat(d["carryoverOutstandingFiat"])
			estimated += asFloat(d["carryoverEstimatedNetQuantity"])
		}
		summary["carryoverOutstandingFiat"] = outstanding
		summary["carryoverEstimatedNetQuantity"] = estimated
		summary["netProfitBdt"] = (op+adj)*rate + asFloat(summary["otherIncome"]) - asFloat(summary["expenses"])
	} else {
		base["replacementDays"] = carry.Days
		summary["replacementOperationalProfitUsd"] = carry.Operational
		summary["replacementOperationalProfitBdt"] = carry.Operational * rate
		summary["carryoverAdjustmentUsd"] = carry.Adjustment
		summary["carryoverAdjustmentBdt"] = carry.Adjustment * rate
		summary["replacementProfitUsd"] = carry.Profit
		summary["replacementProfitBdt"] = carry.Profit * rate
		summary["carryoverOutstandingFiat"] = carry.OutstandingFiat
		summary["carryoverEstimatedNetQuantity"] = carry.EstimatedNetAsset
		entries := s.accountingEntryAggregate(ctx, u.TenantID, rg, rate)
		allReplacement, excludedReplacement := 0.0, 0.0
		for _, a := range agents {
			p := asFloat(a["profitUsd"])
			allReplacement += p
			if inc, ok := a["includedInCompanyTotals"].(bool); ok && !inc {
				excludedReplacement += p
			}
		}
		allUserProfit := allReplacement + entries.AllAgentProfitUSD
		excludedUserProfit := excludedReplacement + entries.ExcludedAgentProfitUSD
		sumUserProfit := allUserProfit - excludedUserProfit
		summary["allUserProfitUsd"] = allUserProfit
		summary["allUserProfitBdt"] = allUserProfit * rate
		summary["excludedUserProfitUsd"] = excludedUserProfit
		summary["excludedUserProfitBdt"] = excludedUserProfit * rate
		summary["sumUserProfitUsd"] = sumUserProfit
		summary["sumUserProfitBdt"] = sumUserProfit * rate
		ownerProfit := asFloat(summary["ownerProfitUsd"])
		summary["unallocatedAdjustmentUsd"] = ownerProfit - sumUserProfit
		summary["unallocatedAdjustmentBdt"] = (ownerProfit - sumUserProfit) * rate
	}
	base["byAgent"] = agents
	summary["carryoverAgentAllocationIncomplete"] = carry.LegacyIncomplete
	summary["carryoverModelVersion"] = "normalized_fifo_carryover_v206"
	base["settings"] = mergeMaps(settings, map[string]any{"profitModel": "normalized_fifo_carryover_v206", "profitCalculation": "day_locked_operational_plus_settlement_adjustment", "cryptoAsset": asset})
	base["carryover"] = map[string]any{
		"model":                        "normalized_fifo_carryover_v206",
		"backfilledCloseLots":          backfilled,
		"legacyAgentHistoryIncomplete": carry.LegacyIncomplete,
		"reconciliationError": func() any {
			if ensureErr != nil {
				return ensureErr.Error()
			}
			return nil
		}(),
		"rule": "Closed-day operational profit is immutable; later BUY variance is posted on the settlement business date.",
	}
	if p, ok := base["permissions"].(map[string]any); ok {
		p["canReconcileCarryover"] = s.hasPerm(u, "accounting.close")
	}
	return base
}
