package httpapi

import (
	"context"
	"database/sql"
	"math"
	"strings"
	"time"
)

type accountingAgg struct {
	BuyFiat, BuyGross, BuyNet, BuyFee     float64
	SellFiat, SellGross, SellOut, SellFee float64
	BuyOrders, SellOrders                 int64
}

func (a accountingAgg) completedOrders() int64 { return a.BuyOrders + a.SellOrders }
func accountingMin(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
func accountingMax(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func (a accountingAgg) replacement(latestYield float64) (actualFiat, actualNet, outstanding, estimated, operational float64) {
	actualFiat = accountingMin(accountingMax(a.SellFiat, 0), accountingMax(a.BuyFiat, 0))
	if a.BuyFiat > 0 && actualFiat > 0 {
		actualNet = a.BuyNet * (actualFiat / a.BuyFiat)
	}
	outstanding = accountingMax(a.SellFiat-actualFiat, 0)
	if latestYield > 0 {
		estimated = outstanding * latestYield
	}
	operational = actualNet + estimated - a.SellOut
	return
}

func orderMovementSQL(alias string) string {
	return `CASE WHEN ` + alias + `.accounting_fact_version>=1 AND ` + alias + `.accounting_net_asset>0 THEN ` + alias + `.accounting_net_asset ELSE ` + alias + `.amount END`
}

func (s *Server) accountingOrderAggregate(ctx context.Context, tenantID int64, rg dateRange, asset string) accountingAgg {
	move := orderMovementSQL("o")
	q := `SELECT UPPER(o.trade_type),COALESCE(SUM(o.total),0),COALESCE(SUM(o.amount),0),COALESCE(SUM(` + move + `),0),COALESCE(SUM(CASE WHEN o.accounting_fact_version>=1 THEN o.accounting_fee_asset ELSE 0 END),0),COUNT(*) FROM orders o WHERE o.tenant_id=` + s.store.Bind(1) + ` AND o.order_source='binance' AND o.status IN ('completed','released') AND ` + accountingOrderEventSQL("o") + `>=` + s.store.Bind(2) + ` AND ` + accountingOrderEventSQL("o") + `<` + s.store.Bind(3) + ` AND UPPER(o.asset)=UPPER(` + s.store.Bind(4) + `) GROUP BY UPPER(o.trade_type)`
	rows, err := s.store.DB.QueryContext(ctx, q, tenantID, rg.Start, rg.End, asset)
	if err != nil {
		return accountingAgg{}
	}
	defer rows.Close()
	var out accountingAgg
	for rows.Next() {
		var typ string
		var fiat, gross, net, fee float64
		var n int64
		if rows.Scan(&typ, &fiat, &gross, &net, &fee, &n) != nil {
			continue
		}
		if typ == "BUY" {
			out.BuyFiat = fiat
			out.BuyGross = gross
			out.BuyNet = net
			out.BuyFee = fee
			out.BuyOrders = n
		} else if typ == "SELL" {
			out.SellFiat = fiat
			out.SellGross = gross
			out.SellOut = net
			out.SellFee = fee
			out.SellOrders = n
		}
	}
	return out
}

func (s *Server) accountingLatestBuyYield(ctx context.Context, tenantID int64, asOf time.Time, asset string) (yield, netRate float64, orderNo string, orderID int64) {
	move := orderMovementSQL("o")
	q := `SELECT o.id,o.external_order_no,o.total,` + move + ` FROM orders o WHERE o.tenant_id=` + s.store.Bind(1) + ` AND o.order_source='binance' AND o.status IN ('completed','released') AND UPPER(o.trade_type)='BUY' AND UPPER(o.asset)=UPPER(` + s.store.Bind(2) + `) AND o.total>0 AND ` + accountingOrderEventSQL("o") + `<` + s.store.Bind(3) + ` ORDER BY ` + accountingOrderEventSQL("o") + ` DESC,o.id DESC LIMIT 1`
	var fiat, net float64
	if s.store.DB.QueryRowContext(ctx, q, tenantID, asset, asOf).Scan(&orderID, &orderNo, &fiat, &net) == nil && fiat > 0 && net > 0 {
		yield = net / fiat
		netRate = fiat / net
	}
	return
}

func (s *Server) accountingProjectedCrypto(ctx context.Context, tenantID int64, asOf time.Time, asset string) float64 {
	move := orderMovementSQL("o")
	q := `SELECT COALESCE(SUM(CASE WHEN UPPER(o.trade_type)='BUY' THEN ` + move + ` WHEN UPPER(o.trade_type)='SELL' THEN -(` + move + `) ELSE 0 END),0) FROM orders o WHERE o.tenant_id=` + s.store.Bind(1) + ` AND o.order_source='binance' AND o.status IN ('completed','released') AND UPPER(o.asset)=UPPER(` + s.store.Bind(2) + `) AND ` + accountingOrderEventSQL("o") + `<` + s.store.Bind(3)
	var v float64
	_ = s.store.DB.QueryRowContext(ctx, q, tenantID, asset, asOf).Scan(&v)
	return v
}

func (s *Server) accountingMethodBalancesAt(ctx context.Context, u ctxUser, asOf time.Time) ([]map[string]any, float64) {
	q := `SELECT pa.id,pa.method_identifier,pa.name,COALESCE(pa.user_id,0),pa.details_json,COALESCE(l.balance_after,pa.opening_balance,0) FROM payment_accounts pa LEFT JOIN (SELECT payment_account_id,MAX(id) max_id FROM payment_account_ledger WHERE tenant_id=` + s.store.Bind(1) + ` AND created_at<` + s.store.Bind(2) + ` GROUP BY payment_account_id) lm ON lm.payment_account_id=pa.id LEFT JOIN payment_account_ledger l ON l.id=lm.max_id WHERE pa.tenant_id=` + s.store.Bind(3) + ` AND pa.status='active' ORDER BY pa.id`
	rows, err := s.store.DB.QueryContext(ctx, q, u.TenantID, asOf, u.TenantID)
	if err != nil {
		return nil, 0
	}
	defer rows.Close()
	type method struct {
		name    string
		balance float64
		count   int
	}
	by := map[string]*method{}
	total := 0.0
	for rows.Next() {
		var id, owner int64
		var ident, name, raw string
		var balance float64
		if rows.Scan(&id, &ident, &name, &owner, &raw, &balance) != nil {
			continue
		}
		if !s.canViewPaymentAccount(u, owner, jsonMap(raw)) {
			continue
		}
		key := strings.TrimSpace(ident)
		if key == "" {
			key = "Other"
		}
		m := by[key]
		if m == nil {
			m = &method{name: firstNonEmpty(name, key)}
			by[key] = m
		}
		m.balance += balance
		m.count++
		total += balance
	}
	keys := make([]string, 0, len(by))
	for k := range by {
		keys = append(keys, k)
	}
	sortStrings(keys)
	out := make([]map[string]any, 0, len(keys))
	for _, k := range keys {
		m := by[k]
		out = append(out, map[string]any{"paymentMethodId": k, "code": k, "name": m.name, "balance": m.balance, "accountCount": m.count})
	}
	return out, total
}

func sortStrings(v []string) {
	for i := 0; i < len(v); i++ {
		for j := i + 1; j < len(v); j++ {
			if v[j] < v[i] {
				v[i], v[j] = v[j], v[i]
			}
		}
	}
}

type accountingEntryAgg struct {
	CompanyIncomeBDT, CompanyExpenseBDT, CapitalInBDT, CapitalOutBDT, CapitalInUSD, CapitalOutUSD, AllAgentProfitUSD, ExcludedAgentProfitUSD float64
	EntryCount                                                                                                                               int64
}

func (s *Server) accountingEntryAggregate(ctx context.Context, tenantID int64, rg dateRange, rate float64) accountingEntryAgg {
	var out accountingEntryAgg
	q := `SELECT b.entry_type,b.currency,b.amount,b.amount_usd,COALESCE(b.agent_id,0),COALESCE(u.include_profit_in_company_totals,TRUE) FROM business_entries b LEFT JOIN users u ON u.id=b.agent_id WHERE b.tenant_id=` + s.store.Bind(1) + ` AND b.business_date>=` + s.store.Bind(2) + ` AND b.business_date<` + s.store.Bind(3)
	rows, err := s.store.DB.QueryContext(ctx, q, tenantID, rg.StartDate, rg.EndDateExclusive)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var typ, currency string
		var amount, usd float64
		var agent int64
		var include bool
		if rows.Scan(&typ, &currency, &amount, &usd, &agent, &include) != nil {
			continue
		}
		out.EntryCount++
		bdt := amount
		if strings.ToUpper(currency) != "BDT" {
			bdt = usd * rate
		}
		switch typ {
		case "income":
			if agent == 0 || include {
				out.CompanyIncomeBDT += bdt
			}
			if agent > 0 {
				out.AllAgentProfitUSD += usd
				if !include {
					out.ExcludedAgentProfitUSD += usd
				}
			}
		case "expense":
			if agent == 0 || include {
				out.CompanyExpenseBDT += bdt
			}
			if agent > 0 {
				out.AllAgentProfitUSD -= usd
				if !include {
					out.ExcludedAgentProfitUSD -= usd
				}
			}
		case "capital_in":
			out.CapitalInBDT += bdt
			out.CapitalInUSD += usd
		case "capital_out":
			out.CapitalOutBDT += bdt
			out.CapitalOutUSD += usd
		}
	}
	return out
}

type agentAccountingAgg struct {
	ID      int64
	Name    string
	Include bool
	Orders  int64
	accountingAgg
	IncomeBDT, ExpenseBDT float64
}

func addAgentOrder(a *agentAccountingAgg, typ string, fiat, move float64, n int64) {
	if strings.ToUpper(typ) == "BUY" {
		a.BuyFiat += fiat
		a.BuyNet += move
		a.BuyOrders += n
	} else if strings.ToUpper(typ) == "SELL" {
		a.SellFiat += fiat
		a.SellOut += move
		a.SellOrders += n
	}
	a.Orders = a.BuyOrders + a.SellOrders
}

func (s *Server) accountingByAgent(ctx context.Context, tenantID int64, rg dateRange, asset string, rate, latestYield float64) []map[string]any {
	agents := map[int64]*agentAccountingAgg{}
	if rs, err := s.store.DB.QueryContext(ctx, `SELECT id,name,include_profit_in_company_totals FROM users WHERE tenant_id=`+s.store.Bind(1), tenantID); err == nil {
		for rs.Next() {
			a := &agentAccountingAgg{}
			if rs.Scan(&a.ID, &a.Name, &a.Include) == nil {
				agents[a.ID] = a
			}
		}
		rs.Close()
	}
	move := orderMovementSQL("o")
	baseWhere := `o.tenant_id=` + s.store.Bind(1) + ` AND o.order_source='binance' AND o.status IN ('completed','released') AND ` + accountingOrderEventSQL("o") + `>=` + s.store.Bind(2) + ` AND ` + accountingOrderEventSQL("o") + `<` + s.store.Bind(3) + ` AND UPPER(o.asset)=UPPER(` + s.store.Bind(4) + `)`
	q := `SELECT o.assigned_user_id,UPPER(o.trade_type),COALESCE(SUM(o.total),0),COALESCE(SUM(` + move + `),0),COUNT(DISTINCT o.id) FROM orders o WHERE ` + baseWhere + ` AND o.assigned_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payment_splits ps WHERE ps.tenant_id=o.tenant_id AND ps.order_id=o.id AND ps.assigned_user_id IS NOT NULL AND ps.amount>0 AND ps.status NOT IN ('cancelled','deleted','reversed')) GROUP BY o.assigned_user_id,UPPER(o.trade_type)`
	if rs, err := s.store.DB.QueryContext(ctx, q, tenantID, rg.Start, rg.End, asset); err == nil {
		for rs.Next() {
			var id, n int64
			var typ string
			var fiat, mv float64
			if rs.Scan(&id, &typ, &fiat, &mv, &n) == nil {
				if a := agents[id]; a != nil {
					addAgentOrder(a, typ, fiat, mv, n)
				}
			}
		}
		rs.Close()
	}
	// Split-assigned orders are weighted by the recorded split amount. This keeps co-agent accounting set-based.
	q2 := `SELECT ps.assigned_user_id,UPPER(o.trade_type),COALESCE(SUM(o.total*(ps.amount/st.total_amount)),0),COALESCE(SUM((` + move + `)*(ps.amount/st.total_amount)),0),COUNT(DISTINCT o.id) FROM orders o JOIN payment_splits ps ON ps.order_id=o.id AND ps.tenant_id=o.tenant_id JOIN (SELECT order_id,SUM(amount) total_amount FROM payment_splits WHERE tenant_id=` + s.store.Bind(1) + ` AND assigned_user_id IS NOT NULL AND amount>0 AND status NOT IN ('cancelled','deleted','reversed') GROUP BY order_id) st ON st.order_id=o.id WHERE o.tenant_id=` + s.store.Bind(2) + ` AND o.order_source='binance' AND o.status IN ('completed','released') AND ` + accountingOrderEventSQL("o") + `>=` + s.store.Bind(3) + ` AND ` + accountingOrderEventSQL("o") + `<` + s.store.Bind(4) + ` AND UPPER(o.asset)=UPPER(` + s.store.Bind(5) + `) AND ps.assigned_user_id IS NOT NULL AND ps.amount>0 AND ps.status NOT IN ('cancelled','deleted','reversed') AND st.total_amount>0 GROUP BY ps.assigned_user_id,UPPER(o.trade_type)`
	if rs, err := s.store.DB.QueryContext(ctx, q2, tenantID, tenantID, rg.Start, rg.End, asset); err == nil {
		for rs.Next() {
			var id, n int64
			var typ string
			var fiat, mv float64
			if rs.Scan(&id, &typ, &fiat, &mv, &n) == nil {
				if a := agents[id]; a != nil {
					addAgentOrder(a, typ, fiat, mv, n)
				}
			}
		}
		rs.Close()
	}
	if rs, err := s.store.DB.QueryContext(ctx, `SELECT agent_id,entry_type,currency,COALESCE(SUM(amount),0),COALESCE(SUM(amount_usd),0) FROM business_entries WHERE tenant_id=`+s.store.Bind(1)+` AND business_date>=`+s.store.Bind(2)+` AND business_date<`+s.store.Bind(3)+` AND agent_id IS NOT NULL GROUP BY agent_id,entry_type,currency`, tenantID, rg.StartDate, rg.EndDateExclusive); err == nil {
		for rs.Next() {
			var id int64
			var typ, currency string
			var amount, usd float64
			if rs.Scan(&id, &typ, &currency, &amount, &usd) == nil {
				if a := agents[id]; a != nil {
					bdt := amount
					if strings.ToUpper(currency) != "BDT" {
						bdt = usd * rate
					}
					if typ == "income" {
						a.IncomeBDT += bdt
					} else if typ == "expense" {
						a.ExpenseBDT += bdt
					}
				}
			}
		}
		rs.Close()
	}
	out := []map[string]any{}
	for _, a := range agents {
		if a.Orders == 0 && a.IncomeBDT == 0 && a.ExpenseBDT == 0 {
			continue
		}
		_, _, outstanding, estimated, profit := a.accountingAgg.replacement(latestYield)
		_ = outstanding
		_ = estimated
		item := map[string]any{"agentId": a.ID, "name": a.Name, "orders": a.Orders, "buyVolume": a.BuyFiat, "buyCrypto": a.BuyNet, "sellVolume": a.SellFiat, "sellCrypto": a.SellOut, "soldCrypto": a.SellOut, "replacementNetCrypto": a.SellOut + profit, "operationalProfitUsd": profit, "carryoverAdjustmentUsd": 0.0, "profitUsd": profit, "operationalProfitBdt": profit * rate, "carryoverAdjustmentBdt": 0.0, "includedInCompanyTotals": a.Include, "accountingScope": func() string {
			if a.Include {
				return "company"
			}
			return "individual_only"
		}(), "grossProfit": profit * rate, "profitBdt": profit * rate, "otherIncome": a.IncomeBDT, "expenses": a.ExpenseBDT, "netContribution": profit*rate + a.IncomeBDT - a.ExpenseBDT}
		out = append(out, item)
	}
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if asFloat(out[j]["netContribution"]) > asFloat(out[i]["netContribution"]) {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

func (s *Server) accountingDailyReplacement(ctx context.Context, tenantID int64, rg dateRange, asset string, rate, latestYield float64) []map[string]any {
	dateExpr := s.accountingOrderDateExpr("o", rg.OffsetMinutes)
	move := orderMovementSQL("o")
	q := `SELECT ` + dateExpr + `,UPPER(o.trade_type),COALESCE(SUM(o.total),0),COALESCE(SUM(` + move + `),0),COUNT(*) FROM orders o WHERE o.tenant_id=` + s.store.Bind(1) + ` AND o.order_source='binance' AND o.status IN ('completed','released') AND ` + accountingOrderEventSQL("o") + `>=` + s.store.Bind(2) + ` AND ` + accountingOrderEventSQL("o") + `<` + s.store.Bind(3) + ` AND UPPER(o.asset)=UPPER(` + s.store.Bind(4) + `) GROUP BY ` + dateExpr + `,UPPER(o.trade_type) ORDER BY ` + dateExpr
	rows, err := s.store.DB.QueryContext(ctx, q, tenantID, rg.Start, rg.End, asset)
	if err != nil {
		return nil
	}
	defer rows.Close()
	days := map[string]*accountingAgg{}
	for rows.Next() {
		var day, typ string
		var fiat, mv float64
		var n int64
		if rows.Scan(&day, &typ, &fiat, &mv, &n) != nil {
			continue
		}
		a := days[day]
		if a == nil {
			a = &accountingAgg{}
			days[day] = a
		}
		if typ == "BUY" {
			a.BuyFiat = fiat
			a.BuyNet = mv
			a.BuyOrders = n
		} else if typ == "SELL" {
			a.SellFiat = fiat
			a.SellOut = mv
			a.SellOrders = n
		}
	}
	return accountingDailyRows(days, rate, latestYield)
}

func accountingDailyRows(days map[string]*accountingAgg, rate, latestYield float64) []map[string]any {
	keys := make([]string, 0, len(days))
	for k := range days {
		keys = append(keys, k)
	}
	sortStrings(keys)
	out := make([]map[string]any, 0, len(keys))
	for _, day := range keys {
		a := days[day]
		yield := latestYield
		if a.BuyFiat > 0 && a.BuyNet > 0 {
			yield = a.BuyNet / a.BuyFiat
		}
		actualFiat, actualNet, outstanding, estimated, profit := a.replacement(yield)
		out = append(out, map[string]any{"businessDate": day, "closed": false, "sellOrders": a.SellOrders, "buyOrders": a.BuyOrders, "sellFiat": a.SellFiat, "soldQuantity": a.SellOut, "buyFiat": a.BuyFiat, "buyNetQuantity": a.BuyNet, "actualReplacementBuyFiat": actualFiat, "actualReplacementNetQuantity": actualNet, "carryoverOutstandingFiat": outstanding, "carryoverEstimatedNetQuantity": estimated, "operationalProfitUsd": profit, "operationalProfitBdt": profit * rate, "carryoverAdjustmentUsd": 0.0, "carryoverAdjustmentBdt": 0.0, "profitUsd": profit, "profitBdt": profit * rate, "rateSource": "normalized_completed_buy_yield", "missingBuyRate": outstanding > 0 && yield <= 0})
	}
	return out
}

// accountingDailyReplacementForAgent keeps agent-scoped daily reporting tenant-safe and
// prevents the company-wide replacement timeline from leaking through an Agent session.
// Direct assignments and co-agent payment splits are aggregated in SQL rather than by
// loading every order into application memory.
func (s *Server) accountingDailyReplacementForAgent(ctx context.Context, tenantID, userID int64, rg dateRange, asset string, rate, latestYield float64) []map[string]any {
	dateExpr := s.accountingOrderDateExpr("o", rg.OffsetMinutes)
	move := orderMovementSQL("o")
	days := map[string]*accountingAgg{}
	add := func(day, typ string, fiat, mv float64, n int64) {
		a := days[day]
		if a == nil {
			a = &accountingAgg{}
			days[day] = a
		}
		if strings.ToUpper(typ) == "BUY" {
			a.BuyFiat += fiat
			a.BuyNet += mv
			a.BuyOrders += n
		} else if strings.ToUpper(typ) == "SELL" {
			a.SellFiat += fiat
			a.SellOut += mv
			a.SellOrders += n
		}
	}

	q := `SELECT ` + dateExpr + `,UPPER(o.trade_type),COALESCE(SUM(o.total),0),COALESCE(SUM(` + move + `),0),COUNT(DISTINCT o.id) FROM orders o WHERE o.tenant_id=` + s.store.Bind(1) + ` AND o.order_source='binance' AND o.status IN ('completed','released') AND ` + accountingOrderEventSQL("o") + `>=` + s.store.Bind(2) + ` AND ` + accountingOrderEventSQL("o") + `<` + s.store.Bind(3) + ` AND UPPER(o.asset)=UPPER(` + s.store.Bind(4) + `) AND o.assigned_user_id=` + s.store.Bind(5) + ` AND NOT EXISTS(SELECT 1 FROM payment_splits ps WHERE ps.tenant_id=o.tenant_id AND ps.order_id=o.id AND ps.assigned_user_id IS NOT NULL AND ps.amount>0 AND ps.status NOT IN ('cancelled','deleted','reversed')) GROUP BY ` + dateExpr + `,UPPER(o.trade_type)`
	if rs, err := s.store.DB.QueryContext(ctx, q, tenantID, rg.Start, rg.End, asset, userID); err == nil {
		for rs.Next() {
			var day, typ string
			var fiat, mv float64
			var n int64
			if rs.Scan(&day, &typ, &fiat, &mv, &n) == nil {
				add(day, typ, fiat, mv, n)
			}
		}
		rs.Close()
	}

	q2 := `SELECT ` + dateExpr + `,UPPER(o.trade_type),COALESCE(SUM(o.total*(ps.amount/st.total_amount)),0),COALESCE(SUM((` + move + `)*(ps.amount/st.total_amount)),0),COUNT(DISTINCT o.id) FROM orders o JOIN payment_splits ps ON ps.order_id=o.id AND ps.tenant_id=o.tenant_id JOIN (SELECT order_id,SUM(amount) total_amount FROM payment_splits WHERE tenant_id=` + s.store.Bind(1) + ` AND assigned_user_id IS NOT NULL AND amount>0 AND status NOT IN ('cancelled','deleted','reversed') GROUP BY order_id) st ON st.order_id=o.id WHERE o.tenant_id=` + s.store.Bind(2) + ` AND o.order_source='binance' AND o.status IN ('completed','released') AND ` + accountingOrderEventSQL("o") + `>=` + s.store.Bind(3) + ` AND ` + accountingOrderEventSQL("o") + `<` + s.store.Bind(4) + ` AND UPPER(o.asset)=UPPER(` + s.store.Bind(5) + `) AND ps.assigned_user_id=` + s.store.Bind(6) + ` AND ps.amount>0 AND ps.status NOT IN ('cancelled','deleted','reversed') AND st.total_amount>0 GROUP BY ` + dateExpr + `,UPPER(o.trade_type)`
	if rs, err := s.store.DB.QueryContext(ctx, q2, tenantID, tenantID, rg.Start, rg.End, asset, userID); err == nil {
		for rs.Next() {
			var day, typ string
			var fiat, mv float64
			var n int64
			if rs.Scan(&day, &typ, &fiat, &mv, &n) == nil {
				add(day, typ, fiat, mv, n)
			}
		}
		rs.Close()
	}
	return accountingDailyRows(days, rate, latestYield)
}

func (s *Server) accountingPreviousOpening(ctx context.Context, tenantID int64, rg dateRange, settings map[string]any) (float64, string) {
	if rg.Start.After(time.Unix(1, 0).UTC()) {
		var raw string
		err := s.store.DB.QueryRowContext(ctx, `SELECT summary_json FROM accounting_closings WHERE tenant_id=`+s.store.Bind(1)+` AND status='closed' AND business_date<`+s.store.Bind(2)+` ORDER BY business_date DESC LIMIT 1`, tenantID, rg.StartDate).Scan(&raw)
		if err == nil {
			m := jsonMap(raw)
			for _, k := range []string{"ownerCurrentBusinessAssetUsd", "ownerActualBusinessAssetUsd", "totalUsdEquivalent", "companyCapitalUsd"} {
				if v := asFloat(m[k]); v >= 0 && (v > 0 || m[k] != nil) {
					return v, "previous_daily_close"
				}
			}
		}
	}
	return asFloat(settings["openingCapitalUsd"]), "configured_opening_capital"
}

func (s *Server) accountingTransferCharges(ctx context.Context, tenantID int64, rg dateRange) float64 {
	var v float64
	q := `SELECT COALESCE(SUM(CASE WHEN entry_type='business_transfer_charge_refund' THEN -amount ELSE amount END),0) FROM payment_account_ledger WHERE tenant_id=` + s.store.Bind(1) + ` AND created_at>=` + s.store.Bind(2) + ` AND created_at<` + s.store.Bind(3) + ` AND entry_type IN ('business_transfer_charge','business_transfer_charge_refund')`
	_ = s.store.DB.QueryRowContext(ctx, q, tenantID, rg.Start, rg.End).Scan(&v)
	return v
}

func (s *Server) accountingClosingViews(ctx context.Context, tenantID int64, limit int) ([]map[string]any, []map[string]any) {
	rows := s.accountingClosingRows(ctx, tenantID, limit)
	closes := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		flat := map[string]any{}
		if sm, ok := row["summary"].(map[string]any); ok {
			for k, v := range sm {
				flat[k] = v
			}
		}
		for k, v := range row {
			if k != "summary" {
				flat[k] = v
			}
		}
		if flat["source"] == nil {
			flat["source"] = "daily_close"
		}
		closes = append(closes, flat)
	}
	trend := make([]map[string]any, 0, len(closes))
	for _, c := range closes {
		trend = append(trend, map[string]any{"businessDate": c["businessDate"], "totalCapital": firstNumeric(c, "ownerCurrentBusinessAssetBdt", "companyCapitalBdt", "totalCapital"), "netProfit": firstNumeric(c, "ownerProfitBdt", "netProfitBdt", "replacementProfitBdt"), "expenses": firstNumeric(c, "expenseBdt", "expenses")})
	}
	return closes, trend
}
func firstNumeric(m map[string]any, keys ...string) float64 {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			return asFloat(v)
		}
	}
	return 0
}

func (s *Server) accountingSummaryV205(ctx context.Context, u ctxUser, rg dateRange, settings map[string]any) map[string]any {
	rate := asFloat(settings["companyDollarRate"])
	if rate <= 0 {
		rate = 118
	}
	asset := strings.ToUpper(firstNonEmpty(asString(settings["cryptoAsset"]), "USDT"))
	latestYield, netRate, latestNo, latestID := s.accountingLatestBuyYield(ctx, u.TenantID, rg.End, asset)
	period := s.accountingOrderAggregate(ctx, u.TenantID, rg, asset)
	entries := s.accountingEntryAggregate(ctx, u.TenantID, rg, rate)
	byMethod, cash := s.accountingMethodBalancesAt(ctx, u, rg.End)
	projected := s.accountingProjectedCrypto(ctx, u.TenantID, rg.End, asset) + asFloat(settings["openingCryptoQuantity"])
	actualFiat, actualNet, outstanding, estimated, periodProfit := period.replacement(latestYield)
	_ = actualFiat
	_ = actualNet
	byAgent := s.accountingByAgent(ctx, u.TenantID, rg, asset, rate, latestYield)
	days := s.accountingDailyReplacement(ctx, u.TenantID, rg, asset, rate, latestYield)
	allReplacement := 0.0
	excludedReplacement := 0.0
	for _, a := range byAgent {
		p := asFloat(a["profitUsd"])
		allReplacement += p
		if inc, ok := a["includedInCompanyTotals"].(bool); ok && !inc {
			excludedReplacement += p
		}
	}
	allUserProfit := allReplacement + entries.AllAgentProfitUSD
	excludedUserProfit := excludedReplacement + entries.ExcludedAgentProfitUSD
	sumUserProfit := allUserProfit - excludedUserProfit
	opening, openingSource := s.accountingPreviousOpening(ctx, u.TenantID, rg, settings)
	adjustedBase := opening + entries.CapitalInUSD - entries.CapitalOutUSD
	pendingEstimated := 0.0
	if latestYield > 0 {
		pendingEstimated = cash * latestYield
	}
	ownerActualAsset := projected + pendingEstimated
	ownerCompanyAsset := ownerActualAsset - excludedUserProfit
	ownerActualProfit := ownerActualAsset - adjustedBase
	ownerProfit := ownerCompanyAsset - adjustedBase
	unallocated := ownerProfit - sumUserProfit
	// Agent-scoped users see only their performance metrics, while owner capital remains company-only.
	scope := "company"
	scopeName := ""
	scopedProfit := sumUserProfit
	scopedPeriod := period
	scopedOtherIncome := entries.CompanyIncomeBDT
	scopedExpenses := entries.CompanyExpenseBDT
	if u.Role == "agent" && !u.IsOwner && !s.hasPerm(u, "accounting.manage") {
		scope = "agent"
		scopedPeriod = accountingAgg{}
		scopedProfit = 0
		scopedOtherIncome = 0
		scopedExpenses = 0
		filtered := []map[string]any{}
		for _, a := range byAgent {
			if asInt64(a["agentId"]) == u.ID {
				scopeName = asString(a["name"])
				scopedPeriod.BuyFiat = asFloat(a["buyVolume"])
				scopedPeriod.BuyNet = asFloat(a["buyCrypto"])
				scopedPeriod.SellFiat = asFloat(a["sellVolume"])
				scopedPeriod.SellOut = asFloat(a["sellCrypto"])
				scopedPeriod.BuyOrders = asInt64(a["orders"])
				scopedProfit = asFloat(a["profitUsd"])
				scopedOtherIncome = asFloat(a["otherIncome"])
				scopedExpenses = asFloat(a["expenses"])
				filtered = append(filtered, a)
				break
			}
		}
		byAgent = filtered
		days = s.accountingDailyReplacementForAgent(ctx, u.TenantID, u.ID, rg, asset, rate, latestYield)
	}
	_, _, scopedOutstanding, scopedEstimated, scopedOperational := scopedPeriod.replacement(latestYield)
	if scope == "agent" {
		periodProfit = scopedOperational
		outstanding = scopedOutstanding
		estimated = scopedEstimated
	}
	transferCharges := s.accountingTransferCharges(ctx, u.TenantID, rg)
	businessCosts := map[string]any{"buyFeeUsd": period.BuyFee, "sellFeeUsd": period.SellFee, "totalBinanceFeeUsd": period.BuyFee + period.SellFee, "totalBinanceFeeBdt": (period.BuyFee + period.SellFee) * rate, "paymentTransferChargesBdt": transferCharges, "manualBusinessExpensesBdt": entries.CompanyExpenseBDT, "manualBusinessExpensesUsd": entries.CompanyExpenseBDT / rate, "totalBusinessCostBdt": (period.BuyFee+period.SellFee)*rate + transferCharges + entries.CompanyExpenseBDT, "note": "Display-only cost report; Binance fees are already reflected in normalized asset movement."}
	summary := map[string]any{"scope": scope, "scopeAgentId": func() any {
		if scope == "agent" {
			return u.ID
		}
		return nil
	}(), "scopeAgentName": scopeName, "companyDollarRate": rate, "buyCost": scopedPeriod.BuyFiat, "sellRevenue": scopedPeriod.SellFiat, "liveBuyCrypto": scopedPeriod.BuyNet, "liveSellCrypto": scopedPeriod.SellOut, "replacementSellReceipts": scopedPeriod.SellFiat, "replacementOperationalProfitUsd": periodProfit, "replacementOperationalProfitBdt": periodProfit * rate, "carryoverAdjustmentUsd": 0.0, "carryoverAdjustmentBdt": 0.0, "replacementProfitUsd": scopedProfit, "replacementProfitBdt": scopedProfit * rate, "carryoverOutstandingFiat": outstanding, "carryoverEstimatedNetQuantity": estimated, "latestEffectiveBuyYieldPerBdt": latestYield, "latestEffectiveBuyNetRate": netRate, "latestEffectiveBuyOrderId": latestID, "latestEffectiveBuyOrderNo": latestNo, "pendingOperatingCashBdt": cash, "pendingEstimatedNetUsd": pendingEstimated, "pendingYieldMissing": math.Abs(cash) > 0 && latestYield <= 0, "cashBalance": cash, "cashBalanceBdt": cash, "ownerActualBinanceUsd": projected, "actualBinanceUsd": projected, "ownerOpeningCapitalUsd": opening, "ownerOpeningCapitalSource": openingSource, "ownerCapitalInUsd": entries.CapitalInUSD, "ownerCapitalOutUsd": entries.CapitalOutUSD, "ownerAdjustedCapitalBaseUsd": adjustedBase, "ownerActualBusinessAssetUsd": ownerActualAsset, "ownerActualBusinessAssetBdt": ownerActualAsset * rate, "ownerCurrentBusinessAssetUsd": ownerCompanyAsset, "ownerCurrentBusinessAssetBdt": ownerCompanyAsset * rate, "ownerActualProfitUsd": ownerActualProfit, "ownerActualProfitBdt": ownerActualProfit * rate, "ownerProfitUsd": ownerProfit, "ownerProfitBdt": ownerProfit * rate, "allUserProfitUsd": allUserProfit, "allUserProfitBdt": allUserProfit * rate, "excludedUserProfitUsd": excludedUserProfit, "excludedUserProfitBdt": excludedUserProfit * rate, "sumUserProfitUsd": sumUserProfit, "sumUserProfitBdt": sumUserProfit * rate, "unallocatedAdjustmentUsd": unallocated, "unallocatedAdjustmentBdt": unallocated * rate, "otherIncome": scopedOtherIncome, "expenses": scopedExpenses, "incomeBdt": entries.CompanyIncomeBDT, "expenseBdt": entries.CompanyExpenseBDT, "capitalInBdt": entries.CapitalInBDT, "capitalOutBdt": entries.CapitalOutBDT, "capitalInUsd": entries.CapitalInUSD, "capitalOutUsd": entries.CapitalOutUSD, "companyCapitalUsd": ownerCompanyAsset, "companyCapitalBdt": ownerCompanyAsset * rate, "companyIncomeBdt": entries.CompanyIncomeBDT + scopedPeriod.SellFiat, "companyExpenseBdt": entries.CompanyExpenseBDT + scopedPeriod.BuyFiat, "netProfitBdt": func() float64 {
		if scope == "agent" {
			return scopedProfit*rate + scopedOtherIncome - scopedExpenses
		}
		return ownerProfit * rate
	}(), "completedOrders": period.completedOrders(), "entryCount": entries.EntryCount, "businessCosts": businessCosts}
	closes, trend := s.accountingClosingViews(ctx, u.TenantID, 45)
	binanceView := map[string]any{"asset": asset, "total": projected, "projectedTotal": projected, "actualTotal": nil, "source": "normalized_order_ledger", "accountingUse": "projected_asset_fallback", "successfulCredentialCount": s.activeCredentialCount(ctx, u.TenantID), "notice": "Funding-wallet balance is not guessed from an undocumented Binance endpoint; normalized completed C2C order movement is used until an authorized balance source is configured."}
	if scope == "agent" {
		// Company capital, cross-agent totals and close history are privileged accounting data.
		// Keep the Agent response limited to the scoped replacement-performance contract.
		for _, key := range []string{"ownerActualBinanceUsd", "actualBinanceUsd", "ownerOpeningCapitalUsd", "ownerCapitalInUsd", "ownerCapitalOutUsd", "ownerAdjustedCapitalBaseUsd", "ownerActualBusinessAssetUsd", "ownerActualBusinessAssetBdt", "ownerCurrentBusinessAssetUsd", "ownerCurrentBusinessAssetBdt", "ownerActualProfitUsd", "ownerActualProfitBdt", "ownerProfitUsd", "ownerProfitBdt", "allUserProfitUsd", "allUserProfitBdt", "excludedUserProfitUsd", "excludedUserProfitBdt", "sumUserProfitUsd", "sumUserProfitBdt", "unallocatedAdjustmentUsd", "unallocatedAdjustmentBdt", "companyCapitalUsd", "companyCapitalBdt", "companyIncomeBdt", "companyExpenseBdt", "businessCosts"} {
			summary[key] = nil
		}
		summary["completedOrders"] = scopedPeriod.completedOrders()
		summary["entryCount"] = nil
		closes = nil
		trend = nil
		binanceView = map[string]any{"asset": asset, "total": nil, "projectedTotal": nil, "actualTotal": nil, "source": "agent_scoped", "accountingUse": "hidden_company_balance", "successfulCredentialCount": 0, "notice": "Company-wide Binance asset and closing history are hidden from Agent-scoped accounting."}
	}
	return map[string]any{"generatedAt": time.Now().UTC(), "range": accountingRangeView(rg), "settings": mergeMaps(settings, map[string]any{"profitModel": "normalized_replacement_yield_v205", "profitCalculation": "projected_crypto_plus_pending_cash_minus_adjusted_capital", "cryptoAsset": asset}), "summary": summary, "categories": s.accountingCategoryTotals(ctx, u, rg), "byMethod": byMethod, "byAgent": byAgent, "replacementDays": days, "closes": closes, "trend": trend, "closingTrend": closes, "binance": binanceView, "permissions": map[string]any{"canManage": s.hasPerm(u, "accounting.manage"), "canClose": s.hasPerm(u, "accounting.close"), "canReopen": s.hasPerm(u, "accounting.reopen"), "canSync": s.hasPerm(u, "binance.sync")}}
}

var _ = sql.ErrNoRows
