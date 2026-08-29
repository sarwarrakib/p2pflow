package httpapi

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

var defaultExpenseCategories = []string{"Office & Administration", "Salary & Allowance", "Rent", "Internet & Communication", "Software & Subscription", "Equipment & Maintenance", "Marketing", "Travel & Transport", "Bank / Wallet Charge", "Tax & Compliance", "Food & Hospitality", "Other Expense"}

func (s *Server) registerAccountingRoutes() {
	s.mux.HandleFunc("GET /api/accounting", s.requirePerm("accounting.view", s.accountingSummary))
	s.mux.HandleFunc("GET /api/accounting/entries", s.requirePerm("accounting.view", s.accountingEntries))
	s.mux.HandleFunc("POST /api/accounting/entries", s.requirePerm("accounting.manage", s.accountingEntryCreate))
	s.mux.HandleFunc("DELETE /api/accounting/entries/{id}", s.requirePerm("accounting.manage", s.accountingEntryDelete))
	s.mux.HandleFunc("GET /api/accounting/cost-transactions", s.requirePerm("accounting.view", s.accountingCosts))
	s.mux.HandleFunc("GET /api/accounting/expense-categories", s.requirePerm("accounting.view", s.expenseCategories))
	s.mux.HandleFunc("POST /api/accounting/expense-categories", s.requirePerm("accounting.manage", s.expenseCategoryCreate))
	s.mux.HandleFunc("DELETE /api/accounting/expense-categories", s.requirePerm("accounting.manage", s.expenseCategoryDelete))
	s.mux.HandleFunc("PATCH /api/accounting/opening-capital", s.requirePerm("accounting.manage", s.accountingOpeningCapital))
	s.mux.HandleFunc("PATCH /api/accounting/settings", s.requirePerm("accounting.manage", s.accountingSettingsPatch))
	s.mux.HandleFunc("POST /api/accounting/close", s.requirePerm("accounting.close", s.accountingClose))
	s.mux.HandleFunc("POST /api/accounting/reopen", s.requirePerm("accounting.reopen", s.accountingReopen))
	s.mux.HandleFunc("POST /api/accounting/reconcile-carryover", s.requirePerm("accounting.close", s.accountingCarryoverReconcile))
	s.mux.HandleFunc("POST /api/accounting/sync-binance", s.requirePerm("binance.sync", s.accountingSyncBinance))
}

type dateRange struct {
	Start, End       time.Time
	Label            string
	StartDate        string
	EndDateExclusive string
	BusinessDate     string
	OffsetMinutes    int
}

func accountingOffsetMinutes(settings map[string]any) int {
	offset := int(asFloat(settings["timezoneOffsetMinutes"]))
	if offset < -720 {
		offset = -720
	}
	if offset > 840 {
		offset = 840
	}
	return offset
}

func accountingBusinessDateAt(at time.Time, offsetMinutes int) string {
	return at.UTC().Add(time.Duration(offsetMinutes) * time.Minute).Format("2006-01-02")
}

func accountingBusinessMidnightUTC(date string, offsetMinutes int) (time.Time, error) {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return time.Time{}, err
	}
	return t.UTC().Add(-time.Duration(offsetMinutes) * time.Minute), nil
}

func accountingRangeAt(r *http.Request, settings map[string]any, now time.Time) dateRange {
	offset := accountingOffsetMinutes(settings)
	now = now.UTC()
	today := accountingBusinessDateAt(now, offset)
	period := strings.ToLower(firstNonEmpty(requestString(r, "period"), "daily"))
	startDate, endDate, label := today, "", today
	switch period {
	case "monthly":
		localNow := now.Add(time.Duration(offset) * time.Minute)
		startDate = fmt.Sprintf("%04d-%02d-01", localNow.Year(), int(localNow.Month()))
		next := time.Date(localNow.Year(), localNow.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, 1, 0)
		endDate = next.Format("2006-01-02")
		label = startDate[:7]
	case "yearly":
		localNow := now.Add(time.Duration(offset) * time.Minute)
		startDate = fmt.Sprintf("%04d-01-01", localNow.Year())
		endDate = fmt.Sprintf("%04d-01-01", localNow.Year()+1)
		label = fmt.Sprintf("%04d", localNow.Year())
	case "lifetime":
		start := time.Unix(0, 0).UTC()
		endLocal, _ := time.Parse("2006-01-02", today)
		endDate = endLocal.AddDate(0, 0, 1).Format("2006-01-02")
		end, _ := accountingBusinessMidnightUTC(endDate, offset)
		return dateRange{Start: start, End: end, Label: "Lifetime / All records", StartDate: "1970-01-01", EndDateExclusive: endDate, BusinessDate: today, OffsetMinutes: offset}
	case "custom":
		if v := requestString(r, "start"); v != "" {
			if _, err := time.Parse("2006-01-02", v); err == nil {
				startDate = v
			}
		}
		endInclusive := startDate
		if v := requestString(r, "end"); v != "" {
			if _, err := time.Parse("2006-01-02", v); err == nil {
				endInclusive = v
			}
		}
		endBase, _ := time.Parse("2006-01-02", endInclusive)
		endDate = endBase.AddDate(0, 0, 1).Format("2006-01-02")
		label = startDate + " → " + endInclusive
	default:
		period = "daily"
		base, _ := time.Parse("2006-01-02", startDate)
		endDate = base.AddDate(0, 0, 1).Format("2006-01-02")
		label = startDate
	}
	if endDate == "" {
		base, _ := time.Parse("2006-01-02", startDate)
		endDate = base.AddDate(0, 0, 1).Format("2006-01-02")
	}
	start, _ := accountingBusinessMidnightUTC(startDate, offset)
	end, _ := accountingBusinessMidnightUTC(endDate, offset)
	return dateRange{Start: start, End: end, Label: label, StartDate: startDate, EndDateExclusive: endDate, BusinessDate: today, OffsetMinutes: offset}
}

func accountingRange(r *http.Request, settings map[string]any) dateRange {
	return accountingRangeAt(r, settings, time.Now().UTC())
}

func accountingRangeView(rg dateRange) map[string]any {
	return map[string]any{
		"start": rg.Start, "end": rg.End, "label": rg.Label,
		"businessDate": rg.BusinessDate, "businessStartDate": rg.StartDate,
		"businessEndDateExclusive": rg.EndDateExclusive, "timezoneOffsetMinutes": rg.OffsetMinutes,
	}
}
func (s *Server) accountingSettings(ctx context.Context, tenantID int64) map[string]any {
	d := map[string]any{"cryptoAsset": "USDT", "companyDollarRate": 118.0, "p2pBuyRate": 0.0, "configuredP2pBuyRate": 0.0, "autoP2pBuyRate": true, "timezoneOffsetMinutes": 360, "autoClose": true, "openingCapitalUsd": 0.0, "openingDate": ""}
	v := s.svc.GetSetting(ctx, "tenant", tenantID, "accounting", d)
	if m, ok := v.(map[string]any); ok {
		return mergeMaps(d, m)
	}
	return d
}
func (s *Server) accountingSummary(w http.ResponseWriter, r *http.Request, u ctxUser) {
	settings := s.accountingSettings(r.Context(), u.TenantID)
	rg := accountingRange(r, settings)
	writeJSON(w, 200, s.accountingSummaryV206(r.Context(), u, rg, settings))
}

func (s *Server) sumPaymentBalances(ctx context.Context, u ctxUser) float64 {
	rows, e := s.store.DB.QueryContext(ctx, `SELECT id,COALESCE(user_id,0),details_json FROM payment_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND status='active'`, u.TenantID)
	if e != nil {
		return 0
	}
	defer rows.Close()
	sum := 0.0
	for rows.Next() {
		var id, owner int64
		var raw string
		if rows.Scan(&id, &owner, &raw) == nil {
			d := jsonMap(raw)
			if s.canViewPaymentAccount(u, owner, d) {
				sum += s.currentPaymentBalance(ctx, id, d)
			}
		}
	}
	return sum
}
func (s *Server) activeCredentialCount(ctx context.Context, tid int64) int {
	var n int
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND status='active'`, tid).Scan(&n)
	return n
}
func (s *Server) accountingCategoryTotals(ctx context.Context, u ctxUser, rg dateRange) []map[string]any {
	q := `SELECT category,entry_type,COALESCE(SUM(amount),0),COALESCE(SUM(amount_usd),0),COUNT(*) FROM business_entries WHERE tenant_id=` + s.store.Bind(1) + ` AND business_date>=` + s.store.Bind(2) + ` AND business_date<` + s.store.Bind(3)
	args := []any{u.TenantID, rg.StartDate, rg.EndDateExclusive}
	if u.Role == "agent" && !u.IsOwner && !s.hasPerm(u, "accounting.manage") {
		q += ` AND agent_id=` + s.store.Bind(4)
		args = append(args, u.ID)
	}
	q += ` GROUP BY category,entry_type ORDER BY ABS(SUM(amount)) DESC`
	rows, e := s.store.DB.QueryContext(ctx, q, args...)
	if e != nil {
		return nil
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var c, t string
		var a, usd float64
		var n int64
		if rows.Scan(&c, &t, &a, &usd, &n) == nil {
			out = append(out, map[string]any{"category": c, "type": t, "amountBdt": a, "amountUsd": usd, "count": n})
		}
	}
	return out
}
func (s *Server) accountingClosingRows(ctx context.Context, tid int64, limit int) []map[string]any {
	rows, e := s.store.DB.QueryContext(ctx, `SELECT business_date,status,summary_json,closed_at FROM accounting_closings WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY business_date DESC LIMIT `+strconv.Itoa(limit), tid)
	if e != nil {
		return nil
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var d time.Time
		var st, raw string
		var at time.Time
		if rows.Scan(&d, &st, &raw, &at) == nil {
			m := jsonMap(raw)
			out = append(out, map[string]any{"businessDate": d.Format("2006-01-02"), "status": st, "netProfit": mapFloat(m, "netProfitBdt", "replacementProfitBdt"), "summary": m, "closedAt": at})
		}
	}
	sortAccountingAsc(out)
	return out
}
func sortAccountingAsc(x []map[string]any) {
	for i := 0; i < len(x); i++ {
		for j := i + 1; j < len(x); j++ {
			if asString(x[i]["businessDate"]) > asString(x[j]["businessDate"]) {
				x[i], x[j] = x[j], x[i]
			}
		}
	}
}
func (s *Server) accountingEntries(w http.ResponseWriter, r *http.Request, u ctxUser) {
	settings := s.accountingSettings(r.Context(), u.TenantID)
	rg := accountingRange(r, settings)
	page := 1
	if n, err := strconv.Atoi(strings.TrimSpace(requestString(r, "page"))); err == nil && n > 0 {
		page = n
	}
	rowLimit := 100
	if n, err := strconv.Atoi(strings.TrimSpace(requestString(r, "rows"))); err == nil && n > 0 {
		rowLimit = n
	}
	if rowLimit > 1000 {
		rowLimit = 1000
	}
	offset := (page - 1) * rowLimit

	typeSeen := map[string]bool{}
	var types []string
	for _, t := range strings.Split(requestString(r, "types"), ",") {
		t = strings.TrimSpace(strings.ToLower(t))
		if t != "" && !typeSeen[t] {
			typeSeen[t] = true
			types = append(types, t)
		}
	}
	search := strings.TrimSpace(strings.ToLower(requestString(r, "search")))
	from := ` FROM business_entries b LEFT JOIN users u ON u.id=b.agent_id AND u.tenant_id=b.tenant_id LEFT JOIN users cu ON cu.id=b.created_by AND cu.tenant_id=b.tenant_id LEFT JOIN payment_accounts p ON p.id=b.payment_account_id AND p.tenant_id=b.tenant_id`
	args := []any{u.TenantID, rg.StartDate, rg.EndDateExclusive}
	where := []string{`b.tenant_id=` + s.store.Bind(1), `b.business_date>=` + s.store.Bind(2), `b.business_date<` + s.store.Bind(3)}
	next := 4
	if len(types) > 0 {
		ph := make([]string, 0, len(types))
		for _, typ := range types {
			ph = append(ph, s.store.Bind(next))
			args = append(args, typ)
			next++
		}
		where = append(where, `LOWER(b.entry_type) IN (`+strings.Join(ph, ",")+`)`)
	}
	if u.Role == "agent" && !u.IsOwner && !s.hasPerm(u, "accounting.manage") {
		where = append(where, `b.agent_id=`+s.store.Bind(next))
		args = append(args, u.ID)
		next++
	}
	if search != "" {
		where = append(where, `LOWER(CONCAT(COALESCE(b.entry_type,''),' ',COALESCE(b.category,''),' ',COALESCE(b.description,''),' ',COALESCE(p.account_number,''),' ',COALESCE(u.name,''))) LIKE `+s.store.Bind(next))
		args = append(args, "%"+search+"%")
		next++
	}
	whereSQL := ` WHERE ` + strings.Join(where, ` AND `)

	var total int64
	if err := s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*)`+from+whereSQL, args...).Scan(&total); err != nil {
		replyDBError(w, err)
		return
	}

	q := `SELECT b.id,b.entry_type,b.category,b.amount,b.currency,b.amount_usd,b.business_date,COALESCE(b.agent_id,0),COALESCE(u.name,''),COALESCE(b.payment_account_id,0),COALESCE(p.account_number,''),b.description,b.protected,b.metadata_json,b.created_at,COALESCE(b.created_by,0),COALESCE(cu.name,''),COALESCE(cu.username,'')` + from + whereSQL + ` ORDER BY b.business_date DESC,b.id DESC LIMIT ` + strconv.Itoa(rowLimit) + ` OFFSET ` + strconv.Itoa(offset)
	rows, err := s.store.DB.QueryContext(r.Context(), q, args...)
	if err != nil {
		replyDBError(w, err)
		return
	}
	rate := asFloat(settings["companyDollarRate"])
	if rate <= 0 {
		rate = 118
	}
	var items []map[string]any
	for rows.Next() {
		var id, aid, pa, creatorID int64
		var typ, cat, currency, agent, pan, desc, raw, creatorName, creatorUsername string
		var amt, usd float64
		var d time.Time
		var prot bool
		var ca time.Time
		if rows.Scan(&id, &typ, &cat, &amt, &currency, &usd, &d, &aid, &agent, &pa, &pan, &desc, &prot, &raw, &ca, &creatorID, &creatorName, &creatorUsername) != nil {
			continue
		}
		currency = strings.ToUpper(currency)
		bdtValue := amt
		usdValue := usd
		if currency != "BDT" {
			bdtValue = usdValue * rate
		}
		if usdValue == 0 && currency == "BDT" && rate > 0 {
			usdValue = amt / rate
		}
		meta := jsonMap(raw)
		automatic := prot || mapBool(meta, "automatic", "systemGenerated")
		item := map[string]any{"id": id, "type": typ, "entryType": typ, "category": cat, "amount": amt, "currency": currency, "amountUsd": usdValue, "amountBdt": bdtValue, "capitalValueUsd": usdValue, "capitalValuationSource": func() string {
			if currency == "BDT" {
				return "company_dollar_rate"
			}
			return "direct"
		}(), "businessDate": d.Format("2006-01-02"), "agentId": aid, "agent": func() any {
			if aid <= 0 {
				return nil
			}
			return map[string]any{"id": aid, "name": agent}
		}(), "paymentAccountId": pa, "paymentAccount": func() any {
			if pa <= 0 {
				return nil
			}
			return map[string]any{"id": pa, "accountNumber": pan}
		}(), "description": desc, "note": desc, "protected": prot, "automatic": automatic, "reversible": !prot, "metadata": meta, "createdAt": ca, "createdByUser": func() any {
			if creatorID <= 0 {
				return nil
			}
			return map[string]any{"id": creatorID, "name": creatorName, "username": creatorUsername}
		}()}
		items = append(items, item)
	}
	rows.Close()

	// Totals and category summaries are calculated over the complete filtered result set,
	// not just the current page. This keeps large tenant reports correct while the browser
	// only receives the requested rows.
	rateSQL := strconv.FormatFloat(rate, 'f', 12, 64)
	bdtExpr := `(CASE WHEN UPPER(b.currency)='BDT' THEN b.amount ELSE COALESCE(NULLIF(b.amount_usd,0),b.amount)*` + rateSQL + ` END)`
	usdExpr := `(CASE WHEN COALESCE(b.amount_usd,0)<>0 THEN b.amount_usd WHEN UPPER(b.currency)='BDT' THEN b.amount/` + rateSQL + ` ELSE b.amount END)`
	var totalBDT, totalUSDT, amountBDT, amountUSD, capitalInUSD, capitalOutUSD float64
	tq := `SELECT COALESCE(SUM(CASE WHEN UPPER(b.currency)='BDT' THEN b.amount ELSE 0 END),0),COALESCE(SUM(CASE WHEN UPPER(b.currency) IN ('USD','USDT') THEN b.amount ELSE 0 END),0),COALESCE(SUM(` + bdtExpr + `),0),COALESCE(SUM(` + usdExpr + `),0),COALESCE(SUM(CASE WHEN b.entry_type='capital_in' THEN ` + usdExpr + ` ELSE 0 END),0),COALESCE(SUM(CASE WHEN b.entry_type='capital_out' THEN ` + usdExpr + ` ELSE 0 END),0)` + from + whereSQL
	_ = s.store.DB.QueryRowContext(r.Context(), tq, args...).Scan(&totalBDT, &totalUSDT, &amountBDT, &amountUSD, &capitalInUSD, &capitalOutUSD)
	totals := map[string]float64{"bdt": totalBDT, "usdt": totalUSDT, "capitalInUsd": capitalInUSD, "capitalOutUsd": capitalOutUSD, "amountBdt": amountBDT, "amountUsd": amountUSD}

	var cats []map[string]any
	cq := `SELECT COALESCE(NULLIF(TRIM(b.category),''),'General'),COUNT(*),COALESCE(SUM(CASE WHEN UPPER(b.currency)='BDT' THEN b.amount ELSE 0 END),0),COALESCE(SUM(CASE WHEN UPPER(b.currency) IN ('USD','USDT') THEN b.amount ELSE 0 END),0),COALESCE(SUM(` + bdtExpr + `),0),COALESCE(SUM(` + usdExpr + `),0)` + from + whereSQL + ` GROUP BY COALESCE(NULLIF(TRIM(b.category),''),'General') ORDER BY ABS(SUM(` + bdtExpr + `)) DESC`
	if cr, e := s.store.DB.QueryContext(r.Context(), cq, args...); e == nil {
		for cr.Next() {
			var category string
			var count int64
			var bdt, usdt, amountBDT, amountUSD float64
			if cr.Scan(&category, &count, &bdt, &usdt, &amountBDT, &amountUSD) == nil {
				cats = append(cats, map[string]any{"category": category, "count": count, "bdt": bdt, "usdt": usdt, "amountBdt": amountBDT, "amountUsd": amountUSD, "capitalValueUsd": amountUSD})
			}
		}
		cr.Close()
	}
	writeJSON(w, 200, map[string]any{"items": items, "total": total, "page": page, "rows": rowLimit, "totals": totals, "byCategory": cats, "range": accountingRangeView(rg)})
}

func (s *Server) accountingEntryCreate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	typ := strings.ToLower(firstNonEmpty(mapString(in, "entryType", "type"), "expense"))
	if typ != "expense" && typ != "income" && typ != "capital_in" && typ != "capital_out" {
		writeJSON(w, 422, envelope{"error": "invalid_entry_type"})
		return
	}
	amount := mapFloat(in, "amount")
	if amount <= 0 {
		writeJSON(w, 422, envelope{"error": "positive amount required"})
		return
	}
	currency := strings.ToUpper(firstNonEmpty(mapString(in, "currency"), "BDT"))
	settings := s.accountingSettings(r.Context(), u.TenantID)
	rate := asFloat(settings["companyDollarRate"])
	usd := mapFloat(in, "amountUsd")
	if usd == 0 && currency == "BDT" && rate > 0 {
		usd = amount / rate
	}
	if currency == "USDT" || currency == "USD" {
		usd = amount
	}
	date := firstNonEmpty(mapString(in, "businessDate", "date"), accountingBusinessDateAt(time.Now().UTC(), accountingOffsetMinutes(settings)))
	if _, err := time.Parse("2006-01-02", date); err != nil {
		writeJSON(w, 422, envelope{"error": "invalid_business_date"})
		return
	}
	if s.accountingDayClosed(r.Context(), u.TenantID, date) {
		writeJSON(w, 409, envelope{"error": "accounting_day_closed", "businessDate": date})
		return
	}
	agent := mapInt64(in, "agentId")
	if u.Role == "agent" && !s.hasPerm(u, "accounting.manage") {
		agent = u.ID
	}
	pa := mapInt64(in, "paymentAccountId")
	var id int64
	err := s.svc.WithTx(r.Context(), func(tx *sql.Tx) error {
		var err error
		id, err = s.insertBusinessEntryTx(r.Context(), tx, u.TenantID, typ, mapString(in, "category"), amount, currency, usd, date, agent, pa, firstNonEmpty(mapString(in, "description", "note"), ""), false, in, u.ID)
		if err != nil {
			return err
		}
		if pa > 0 {
			dir := "receive"
			if typ == "expense" || typ == "capital_out" {
				dir = "send"
			}
			return s.appendPaymentLedgerTx(r.Context(), tx, u.TenantID, pa, u.ID, 0, "accounting_"+typ, dir, amount, fmt.Sprintf("accounting:%d", id), mapString(in, "description", "note"), map[string]any{"businessEntryId": id})
		}
		return nil
	})
	if err != nil {
		writeJSON(w, 422, envelope{"error": "accounting_entry_failed", "message": err.Error()})
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "accounting.entry_created", "business_entry", fmt.Sprint(id), r, map[string]any{"type": typ, "amount": amount, "businessDate": date})
	writeJSON(w, 201, map[string]any{"ok": true, "id": id})
}

func (s *Server) accountingEntryDelete(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	reason := strings.TrimSpace(r.URL.Query().Get("reason"))
	if reason == "" {
		reason = "Reversed by user"
	}
	reversalID, err := s.reverseBusinessEntry(r.Context(), u.TenantID, u.ID, id, reason)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, 404, envelope{"error": "not_found"})
			return
		}
		writeJSON(w, 409, envelope{"error": "accounting_reversal_failed", "message": err.Error()})
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "accounting.entry_reversed", "business_entry", fmt.Sprint(id), r, map[string]any{"reversalId": reversalID, "reason": reason})
	writeJSON(w, 200, map[string]any{"ok": true, "reversalId": reversalID})
}

func (s *Server) accountingCosts(w http.ResponseWriter, r *http.Request, u ctxUser) {
	settings := s.accountingSettings(r.Context(), u.TenantID)
	rg := accountingRange(r, settings)
	rate := asFloat(settings["companyDollarRate"])
	if rate <= 0 {
		rate = 118
	}
	asset := strings.ToUpper(firstNonEmpty(asString(settings["cryptoAsset"]), "USDT"))
	items := []map[string]any{}
	manualBDT, manualUSD, transferBDT, binanceUSD := 0.0, 0.0, 0.0, 0.0
	// Manual business expenses are the accounting source of truth, not arbitrary wallet principal outflows.
	q := `SELECT b.id,b.category,b.amount,b.currency,b.amount_usd,b.business_date,COALESCE(b.agent_id,0),COALESCE(u.name,''),COALESCE(b.payment_account_id,0),COALESCE(p.account_number,''),b.description,b.protected,b.created_at FROM business_entries b LEFT JOIN users u ON u.id=b.agent_id LEFT JOIN payment_accounts p ON p.id=b.payment_account_id WHERE b.tenant_id=` + s.store.Bind(1) + ` AND b.entry_type='expense' AND b.business_date>=` + s.store.Bind(2) + ` AND b.business_date<` + s.store.Bind(3) + ` ORDER BY b.id DESC LIMIT 500`
	if rows, e := s.store.DB.QueryContext(r.Context(), q, u.TenantID, rg.StartDate, rg.EndDateExclusive); e == nil {
		for rows.Next() {
			var id, aid, pa int64
			var cat, currency, agent, pan, note string
			var amt, usd float64
			var d, ca time.Time
			var prot bool
			if rows.Scan(&id, &cat, &amt, &currency, &usd, &d, &aid, &agent, &pa, &pan, &note, &prot, &ca) != nil {
				continue
			}
			if u.Role == "agent" && !u.IsOwner && !s.hasPerm(u, "accounting.manage") && aid != u.ID {
				continue
			}
			currency = strings.ToUpper(currency)
			bdt := amt
			if currency == "BDT" {
				manualBDT += amt
				if usd == 0 {
					usd = amt / rate
				}
			} else {
				manualUSD += usd
				bdt = usd * rate
			}
			items = append(items, map[string]any{"id": "entry:" + fmt.Sprint(id), "entryId": id, "source": "manual_expense", "sourceLabel": "Manual Expense", "category": firstNonEmpty(cat, "General"), "businessDate": d.Format("2006-01-02"), "createdAt": ca, "amountBdt": bdt, "amountUsd": usd, "currency": currency, "amount": amt, "note": note, "paymentAccount": func() any {
				if pa <= 0 {
					return nil
				}
				return map[string]any{"id": pa, "accountNumber": pan}
			}(), "agent": func() any {
				if aid <= 0 {
					return nil
				}
				return map[string]any{"id": aid, "name": agent}
			}(), "protected": prot, "automatic": false, "reversible": !prot})
		}
		rows.Close()
	}
	// Only transfer-charge ledger rows are costs; payment principal is never reported as an expense.
	lq := `SELECT l.id,l.payment_account_id,l.entry_type,l.amount,l.reference,l.note,l.created_at,COALESCE(p.account_number,'') FROM payment_account_ledger l LEFT JOIN payment_accounts p ON p.id=l.payment_account_id WHERE l.tenant_id=` + s.store.Bind(1) + ` AND l.created_at>=` + s.store.Bind(2) + ` AND l.created_at<` + s.store.Bind(3) + ` AND l.entry_type IN ('business_transfer_charge','business_transfer_charge_refund') ORDER BY l.id DESC LIMIT 500`
	if rows, e := s.store.DB.QueryContext(r.Context(), lq, u.TenantID, rg.Start, rg.End); e == nil {
		for rows.Next() {
			var id, pa int64
			var typ, ref, note, num string
			var amt float64
			var ca time.Time
			if rows.Scan(&id, &pa, &typ, &amt, &ref, &note, &ca, &num) != nil {
				continue
			}
			signed := amt
			label := "Payment Transfer Charge"
			if typ == "business_transfer_charge_refund" {
				signed = -amt
				label = "Transfer Charge Refund"
			}
			transferBDT += signed
			items = append(items, map[string]any{"id": "ledger:" + fmt.Sprint(id), "entryId": nil, "source": typ, "sourceLabel": label, "category": "Payment Transfer Charge", "createdAt": ca, "amountBdt": signed, "amountUsd": signed / rate, "currency": "BDT", "amount": signed, "reference": ref, "note": note, "paymentAccount": map[string]any{"id": pa, "accountNumber": num}, "agent": nil, "protected": true, "automatic": true, "reversible": false})
		}
		rows.Close()
	}
	// Binance fee facts are normalized during order sync and can therefore be aggregated without JSON scans.
	oq := `SELECT o.id,o.external_order_no,UPPER(o.trade_type),o.accounting_fee_asset,o.updated_at FROM orders o WHERE o.tenant_id=` + s.store.Bind(1) + ` AND o.order_source='binance' AND o.status IN ('completed','released') AND UPPER(o.asset)=UPPER(` + s.store.Bind(2) + `) AND o.accounting_fact_version>=1 AND o.accounting_fee_asset>0 AND o.updated_at>=` + s.store.Bind(3) + ` AND o.updated_at<` + s.store.Bind(4) + ` ORDER BY o.updated_at DESC,o.id DESC LIMIT 500`
	if rows, e := s.store.DB.QueryContext(r.Context(), oq, u.TenantID, asset, rg.Start, rg.End); e == nil {
		for rows.Next() {
			var id int64
			var no, typ string
			var fee float64
			var ca time.Time
			if rows.Scan(&id, &no, &typ, &fee, &ca) != nil {
				continue
			}
			binanceUSD += fee
			source := "binance_buy_fee"
			label := "Binance BUY Fee"
			if typ == "SELL" {
				source = "binance_sell_fee"
				label = "Binance SELL Fee"
			}
			items = append(items, map[string]any{"id": "binance:" + fmt.Sprint(id) + ":" + typ, "entryId": nil, "source": source, "sourceLabel": label, "category": label, "createdAt": ca, "amountBdt": fee * rate, "amountUsd": fee, "currency": asset, "amount": fee, "orderId": id, "orderNo": no, "paymentAccount": nil, "agent": nil, "note": "Reported Binance fee already reflected in normalized crypto movement.", "protected": true, "automatic": true, "reversible": false})
		}
		rows.Close()
	}
	for i := 0; i < len(items); i++ {
		for j := i + 1; j < len(items); j++ {
			ti, _ := items[i]["createdAt"].(time.Time)
			tj, _ := items[j]["createdAt"].(time.Time)
			if tj.After(ti) {
				items[i], items[j] = items[j], items[i]
			}
		}
	}
	catMap := map[string]map[string]any{}
	totalBDT, totalUSD := 0.0, 0.0
	for _, item := range items {
		bdt := asFloat(item["amountBdt"])
		usd := asFloat(item["amountUsd"])
		totalBDT += bdt
		totalUSD += usd
		cat := firstNonEmpty(asString(item["category"]), "General")
		c := catMap[cat]
		if c == nil {
			c = map[string]any{"category": cat, "count": 0, "amountBdt": 0.0, "amountUsd": 0.0}
			catMap[cat] = c
		}
		c["count"] = asInt64(c["count"]) + 1
		c["amountBdt"] = asFloat(c["amountBdt"]) + bdt
		c["amountUsd"] = asFloat(c["amountUsd"]) + usd
	}
	cats := []map[string]any{}
	for _, c := range catMap {
		cats = append(cats, c)
	}
	writeJSON(w, 200, map[string]any{"items": items, "total": len(items), "totals": map[string]any{"amountBdt": totalBDT, "amountUsd": totalUSD, "manualExpenseBdt": manualBDT, "manualExpenseUsd": manualUSD, "transferChargeBdt": transferBDT, "binanceFeeUsd": binanceUSD}, "byCategory": cats, "range": accountingRangeView(rg)})
}

func (s *Server) expenseCategories(w http.ResponseWriter, r *http.Request, u ctxUser) {
	rows, e := s.store.DB.QueryContext(r.Context(), `SELECT name FROM expense_categories WHERE tenant_id=`+s.store.Bind(1)+` AND active=TRUE ORDER BY name`, u.TenantID)
	items := append([]string{}, defaultExpenseCategories...)
	seen := map[string]bool{}
	for _, x := range items {
		seen[x] = true
	}
	if e == nil {
		for rows.Next() {
			var n string
			if rows.Scan(&n) == nil && !seen[n] {
				items = append(items, n)
				seen[n] = true
			}
		}
		rows.Close()
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func (s *Server) expenseCategoryCreate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	name := mapString(in, "name")
	if name == "" {
		writeJSON(w, 422, envelope{"error": "name required"})
		return
	}
	if s.store.Driver == "postgres" {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO expense_categories(tenant_id,name,active,created_at) VALUES($1,$2,TRUE,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,name) DO UPDATE SET active=TRUE`, u.TenantID, name)
	} else {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO expense_categories(tenant_id,name,active,created_at) VALUES(?,?,TRUE,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE active=TRUE`, u.TenantID, name)
	}
	s.expenseCategories(w, r, u)
}
func (s *Server) expenseCategoryDelete(w http.ResponseWriter, r *http.Request, u ctxUser) {
	name := requestString(r, "name")
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE expense_categories SET active=FALSE WHERE tenant_id=`+s.store.Bind(1)+` AND name=`+s.store.Bind(2), u.TenantID, name)
	writeJSON(w, 200, map[string]any{"ok": true})
}
func (s *Server) accountingOpeningCapital(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	cfg := s.accountingSettings(r.Context(), u.TenantID)
	cfg["openingCapitalUsd"] = mapFloat(in, "accountingOpeningCapitalUsd", "openingCapitalUsd")
	cfg["openingDate"] = mapString(in, "accountingOpeningDate", "openingDate")
	if e := s.svc.SetSetting(r.Context(), "tenant", u.TenantID, "accounting", cfg); e != nil {
		replyDBError(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "settings": cfg})
}
func (s *Server) accountingSettingsPatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	cfg := s.accountingSettings(r.Context(), u.TenantID)
	mapping := map[string]string{"accountingCryptoAsset": "cryptoAsset", "accountingCompanyDollarRate": "companyDollarRate", "accountingP2pBuyRate": "p2pBuyRate", "accountingAutoP2pBuyRate": "autoP2pBuyRate", "accountingTimezoneOffsetMinutes": "timezoneOffsetMinutes", "accountingAutoClose": "autoClose"}
	for k, v := range in {
		if to, ok := mapping[k]; ok {
			cfg[to] = v
		} else {
			cfg[k] = v
		}
	}
	cfg["timezoneOffsetMinutes"] = accountingOffsetMinutes(cfg)
	if e := s.svc.SetSetting(r.Context(), "tenant", u.TenantID, "accounting", cfg); e != nil {
		replyDBError(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "settings": cfg})
}
func (s *Server) accountingClose(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	settings := s.accountingSettings(r.Context(), u.TenantID)
	date := firstNonEmpty(mapString(in, "businessDate", "date"), accountingBusinessDateAt(time.Now().UTC(), accountingOffsetMinutes(settings)))
	if _, err := time.Parse("2006-01-02", date); err != nil {
		writeJSON(w, 422, envelope{"error": "invalid_business_date"})
		return
	}
	asset := strings.ToUpper(firstNonEmpty(asString(settings["cryptoAsset"]), "USDT"))
	if _, _, err := s.accountingEnsureCarryoverLots(r.Context(), u.TenantID, asset); err != nil {
		replyDBError(w, err)
		return
	}
	if err := s.accountingReconcileAllCarryover(r.Context(), u.TenantID); err != nil {
		replyDBError(w, err)
		return
	}
	var existingStatus, existingRaw string
	if err := s.store.DB.QueryRowContext(r.Context(), `SELECT status,summary_json FROM accounting_closings WHERE tenant_id=`+s.store.Bind(1)+` AND business_date=`+s.store.Bind(2), u.TenantID, date).Scan(&existingStatus, &existingRaw); err == nil && existingStatus == "closed" {
		writeJSON(w, 200, map[string]any{"ok": true, "alreadyClosed": true, "businessDate": date, "summary": jsonMap(existingRaw)})
		return
	}
	fake := r.Clone(r.Context())
	q := fake.URL.Query()
	q.Set("period", "custom")
	q.Set("start", date)
	q.Set("end", date)
	fake.URL.RawQuery = q.Encode()
	summary := s.computeClosingSummary(fake, u)
	var err error
	if s.store.Driver == "postgres" {
		_, err = s.store.DB.ExecContext(r.Context(), `INSERT INTO accounting_closings(tenant_id,business_date,status,summary_json,closed_by,closed_at,created_at,reopened_at,reopened_by,reopen_reason) VALUES($1,$2,'closed',$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL,NULL,'') ON CONFLICT(tenant_id,business_date) DO UPDATE SET status='closed',summary_json=EXCLUDED.summary_json,closed_by=EXCLUDED.closed_by,closed_at=CURRENT_TIMESTAMP,reopened_at=NULL,reopened_by=NULL,reopen_reason=''`, u.TenantID, date, rawJSON(summary), u.ID)
	} else {
		_, err = s.store.DB.ExecContext(r.Context(), `INSERT INTO accounting_closings(tenant_id,business_date,status,summary_json,closed_by,closed_at,created_at,reopened_at,reopened_by,reopen_reason) VALUES(?,?,'closed',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL,NULL,'') ON DUPLICATE KEY UPDATE status='closed',summary_json=VALUES(summary_json),closed_by=VALUES(closed_by),closed_at=CURRENT_TIMESTAMP,reopened_at=NULL,reopened_by=NULL,reopen_reason=''`, u.TenantID, date, rawJSON(summary), u.ID)
	}
	if err != nil {
		replyDBError(w, err)
		return
	}
	if err := s.accountingPersistCloseLot(r.Context(), u.TenantID, date, asset, summary); err != nil {
		replyDBError(w, err)
		return
	}
	if err := s.accountingReconcileAllCarryover(r.Context(), u.TenantID); err != nil {
		replyDBError(w, err)
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "accounting.day_closed", "accounting_closing", date, r, map[string]any{"carryoverModel": "normalized_fifo_carryover_v206", "timezoneBoundaryModel": "configured_offset_v207", "timezoneOffsetMinutes": accountingOffsetMinutes(settings)})
	writeJSON(w, 200, map[string]any{"ok": true, "businessDate": date, "summary": summary})
}

func (s *Server) accountingReopen(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	settings := s.accountingSettings(r.Context(), u.TenantID)
	date := firstNonEmpty(mapString(in, "businessDate", "date"), accountingBusinessDateAt(time.Now().UTC(), accountingOffsetMinutes(settings)))
	reason := strings.TrimSpace(mapString(in, "reason"))
	if reason == "" {
		writeJSON(w, 422, envelope{"error": "reopen_reason_required"})
		return
	}
	asset := strings.ToUpper(firstNonEmpty(asString(settings["cryptoAsset"]), "USDT"))
	if _, _, err := s.accountingEnsureCarryoverLots(r.Context(), u.TenantID, asset); err != nil {
		replyDBError(w, err)
		return
	}
	if err := s.accountingReconcileAllCarryover(r.Context(), u.TenantID); err != nil {
		replyDBError(w, err)
		return
	}
	res, err := s.store.DB.ExecContext(r.Context(), `UPDATE accounting_closings SET status='reopened',reopened_at=CURRENT_TIMESTAMP,reopened_by=`+s.store.Bind(1)+`,reopen_reason=`+s.store.Bind(2)+` WHERE tenant_id=`+s.store.Bind(3)+` AND business_date=`+s.store.Bind(4)+` AND status='closed'`, u.ID, reason, u.TenantID, date)
	if err != nil {
		replyDBError(w, err)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, 409, envelope{"error": "accounting_day_not_closed"})
		return
	}
	if err := s.accountingDeleteCloseLot(r.Context(), u.TenantID, date); err != nil {
		replyDBError(w, err)
		return
	}
	if err := s.accountingReconcileAllCarryover(r.Context(), u.TenantID); err != nil {
		replyDBError(w, err)
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "accounting.day_reopened", "accounting_closing", date, r, map[string]any{"reason": reason, "carryoverReconciled": true})
	writeJSON(w, 200, map[string]any{"ok": true, "businessDate": date})
}

func (s *Server) computeClosingSummary(r *http.Request, u ctxUser) map[string]any {
	settings := s.accountingSettings(r.Context(), u.TenantID)
	rg := accountingRange(r, settings)
	report := s.accountingSummaryV206(r.Context(), u, rg, settings)
	if summary, ok := report["summary"].(map[string]any); ok {
		out := map[string]any{}
		for k, v := range summary {
			out[k] = v
		}
		out["source"] = "daily_close"
		out["profitModel"] = "normalized_fifo_carryover_v206"
		out["timezoneBoundaryModel"] = "configured_offset_v207"
		out["timezoneOffsetMinutes"] = rg.OffsetMinutes
		out["businessDate"] = rg.StartDate
		out["businessRangeStartUtc"] = rg.Start
		out["businessRangeEndUtc"] = rg.End
		out["cryptoAsset"] = strings.ToUpper(firstNonEmpty(asString(settings["cryptoAsset"]), "USDT"))
		out["closeByAgent"] = report["byAgent"]
		if days := mapSlice(report["replacementDays"]); len(days) > 0 {
			for _, day := range days {
				if asString(day["businessDate"]) == rg.Start.Format("2006-01-02") {
					out["replacementDay"] = day
					break
				}
			}
		}
		return out
	}
	return map[string]any{}
}

func (s *Server) accountingSyncBinance(w http.ResponseWriter, r *http.Request, u ctxUser) {
	opts := s.credentialOptions(r.Context(), u)
	var errs []string
	for _, o := range opts {
		cid := asInt64(o["id"])
		if strings.ToLower(asString(o["status"])) == "disabled" || !s.accountPerm(r.Context(), u, cid, "binance.sync") {
			continue
		}
		if _, _, e := s.syncOrdersForCredential(r.Context(), u, cid, false); e != nil {
			errs = append(errs, e.Error())
		}
		if s.accountPerm(r.Context(), u, cid, "p2p.profile.sync") {
			_, _ = s.syncCredentialProfile(r.Context(), u, cid, false)
		}
	}
	writeJSON(w, 200, map[string]any{"ok": len(errs) == 0, "errors": errs, "notice": "C2C order/profile snapshots synchronized. Funding-wallet balances are not guessed from an undocumented endpoint."})
}
