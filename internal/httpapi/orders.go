package httpapi

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"p2pflow/v2/internal/binance"
	"p2pflow/v2/internal/events"
	"p2pflow/v2/internal/security"
)

type orderRecord struct {
	ID, TenantID, AccountID, AssignedUserID                                                             int64
	ExternalNo, Status, TradeType, Asset, Fiat, Counterparty, Raw, AccountLabel, AccountNick, AgentName string
	OrderSource, ExternalStatus, PaymentMethodIdentifier, SourceNote                                    string
	PaymentMethodID, BinancePayID                                                                       int64
	Price, Amount, Total                                                                                float64
	Deadline, Completed                                                                                 sql.NullTime
	CreatedAt, UpdatedAt                                                                                time.Time
}

func (s *Server) registerOrderRoutes() {
	s.mux.HandleFunc("GET /api/orders", s.requirePerm("orders.view", s.ordersList))
	s.mux.HandleFunc("POST /api/orders", s.requirePerm("orders.create", s.orderCreate))
	s.mux.HandleFunc("GET /api/orders/{id}", s.requirePerm("orders.view", s.orderGet))
	s.mux.HandleFunc("POST /api/binance/sync/orders", s.requirePerm("binance.sync", s.ordersSync))
	s.mux.HandleFunc("POST /api/orders/{id}/assign", s.requirePerm("orders.assign", s.orderAssign))
	s.mux.HandleFunc("POST /api/orders/{id}/leave", s.requirePerm("orders.manage", s.orderLeave))
	s.mux.HandleFunc("POST /api/orders/{id}/request-coagent", s.requirePerm("orders.split", s.orderRequestCoagent))
	s.mux.HandleFunc("POST /api/orders/{id}/heartbeat", s.requireUser(s.orderHeartbeat))
	s.mux.HandleFunc("POST /api/orders/{id}/binance-refresh", s.requirePerm("orders.view", s.orderBinanceRefresh))
	s.mux.HandleFunc("POST /api/orders/{id}/binance-counterparty", s.requirePerm("orders.view", s.orderBinanceCounterparty))
	s.mux.HandleFunc("POST /api/orders/{id}/binance-chat-sync", s.requirePerm("binance.chat", s.orderBinanceChatSync))
	s.mux.HandleFunc("POST /api/orders/{id}/binance-auto-sync", s.requirePerm("orders.view", s.orderBinanceAutoSync))
	s.mux.HandleFunc("POST /api/orders/{id}/binance-additional-kyc-verify", s.requirePerm("orders.final_action", s.orderAdditionalKYC))
	s.mux.HandleFunc("POST /api/orders/{id}/complete-action", s.requirePerm("orders.final_action", s.orderCompleteAction))
	s.mux.HandleFunc("POST /api/orders/{id}/final-action-verification-start", s.requirePerm("orders.final_action", s.finalVerificationStart))
	s.mux.HandleFunc("POST /api/orders/{id}/final-action-verification-verify", s.requirePerm("orders.final_action", s.finalVerificationVerify))
	s.mux.HandleFunc("POST /api/orders/{id}/splits", s.requirePerm("orders.split", s.orderSplitCreate))
	s.mux.HandleFunc("POST /api/orders/{id}/splits-batch", s.requirePerm("orders.split", s.orderSplitBatch))
	s.mux.HandleFunc("PATCH /api/splits/{id}", s.requirePerm("orders.split", s.orderSplitPatch))
	s.mux.HandleFunc("DELETE /api/splits/{id}", s.requirePerm("orders.split", s.orderSplitDelete))
	s.mux.HandleFunc("POST /api/orders/{id}/complete-agent-task", s.requirePerm("orders.manage", s.orderCompleteAgentTask))
	s.mux.HandleFunc("POST /api/orders/{id}/counterparty-feedback-manual", s.requirePerm("orders.manage", s.orderManualFeedback))
	s.mux.HandleFunc("GET /api/orders/{id}/list-view", s.requirePerm("orders.view", s.orderGet))
}

func (s *Server) scanOrder(row interface{ Scan(...any) error }) (orderRecord, error) {
	var o orderRecord
	err := row.Scan(&o.ID, &o.TenantID, &o.AccountID, &o.ExternalNo, &o.Status, &o.TradeType, &o.Asset, &o.Fiat, &o.Price, &o.Amount, &o.Total, &o.Counterparty, &o.AssignedUserID, &o.Raw, &o.CreatedAt, &o.UpdatedAt, &o.OrderSource, &o.ExternalStatus, &o.PaymentMethodID, &o.PaymentMethodIdentifier, &o.BinancePayID, &o.Deadline, &o.SourceNote, &o.Completed, &o.AccountLabel, &o.AccountNick, &o.AgentName)
	return o, err
}
func (s *Server) orderSelectSQL() string {
	return `SELECT o.id,o.tenant_id,COALESCE(o.exchange_account_id,0),o.external_order_no,o.status,o.trade_type,o.asset,o.fiat,o.price,o.amount,o.total,o.counterparty_name,COALESCE(o.assigned_user_id,0),o.raw_json,o.created_at,o.updated_at,o.order_source,o.external_status,o.payment_method_id,o.payment_method_identifier,o.binance_pay_id,o.payment_deadline_at,o.source_note,o.completed_at,COALESCE(e.label,''),COALESCE(e.p2p_nickname,''),COALESCE(u.name,'') FROM orders o LEFT JOIN exchange_accounts e ON e.id=o.exchange_account_id LEFT JOIN users u ON u.id=o.assigned_user_id`
}

func (s *Server) getOrder(ctx context.Context, u ctxUser, id int64, perm string) (orderRecord, error) {
	q := s.orderSelectSQL() + ` WHERE o.tenant_id=` + s.store.Bind(1) + ` AND o.id=` + s.store.Bind(2)
	o, err := s.scanOrder(s.store.DB.QueryRowContext(ctx, q, u.TenantID, id))
	if err != nil {
		return o, err
	}
	if o.AccountID > 0 && !s.accountPerm(ctx, u, o.AccountID, perm) {
		return o, sql.ErrNoRows
	}
	return o, nil
}
func isOrderClosed(st string) bool {
	st = strings.ToLower(st)
	return st == "completed" || st == "cancelled" || st == "canceled" || st == "expired" || st == "released" || st == "closed"
}

func (s *Server) orderMap(ctx context.Context, u ctxUser, o orderRecord, full bool) map[string]any {
	raw := jsonMap(o.Raw)
	source := o.OrderSource
	if source == "" {
		source = "binance"
	}
	no := firstNonEmpty(o.ExternalNo, mapString(raw, "orderNumber", "orderNo", "adOrderNo"), fmt.Sprintf("#%d", o.ID))
	typeVal := strings.ToUpper(firstNonEmpty(o.TradeType, mapString(raw, "tradeType")))
	fiatAmount := o.Total
	if fiatAmount == 0 {
		fiatAmount = mapFloat(raw, "totalPrice", "totalAmount", "fiatAmount")
	}
	if fiatAmount == 0 {
		fiatAmount = o.Amount
	}
	assetAmount := o.Amount
	if v := mapFloat(raw, "quantity", "assetAmount", "amount"); v > 0 {
		assetAmount = v
	}
	pmi := firstNonEmpty(o.PaymentMethodIdentifier, mapString(raw, "payType", "tradeMethodName", "tradeMethodIdentifier"))
	paymentName := pmi
	if paymentName == "" {
		paymentName = "Payment"
	}
	deadline := any(nil)
	if o.Deadline.Valid {
		deadline = o.Deadline.Time.UTC()
	} else if v := firstMapValue(raw, "paymentDeadlineAt", "payEndTime"); v != nil {
		deadline = parseAnyTime(v)
	}
	status := o.Status
	if status == "" {
		status = normalizeOrderStatus(firstMapValue(raw, "orderStatus", "status"))
	}
	out := map[string]any{
		"id": o.ID, "orderNo": no, "externalOrderNo": no, "orderSource": source, "credentialId": func() any {
			if o.AccountID > 0 {
				return o.AccountID
			}
			return nil
		}(),
		"credentialName": firstNonEmpty(o.AccountNick, o.AccountLabel), "credentialDisplayName": firstNonEmpty(o.AccountNick, o.AccountLabel), "p2pUsername": o.AccountNick,
		"binanceAccount": func() any {
			if o.AccountID <= 0 {
				return nil
			}
			return map[string]any{"id": o.AccountID, "name": firstNonEmpty(o.AccountNick, o.AccountLabel), "displayName": firstNonEmpty(o.AccountNick, o.AccountLabel), "p2pUsername": o.AccountNick, "accountName": o.AccountLabel}
		}(),
		"status": status, "externalStatus": firstNonEmpty(o.ExternalStatus, mapString(raw, "orderStatus", "status")), "rawStatus": mapString(raw, "orderStatus", "status"),
		"type": typeVal, "tradeType": typeVal, "asset": o.Asset, "fiatUnit": o.Fiat, "fiat": o.Fiat, "rate": o.Price, "price": o.Price,
		"amount": fiatAmount, "fiatAmount": fiatAmount, "assetAmount": assetAmount, "total": fiatAmount, "counterpartyName": firstNonEmpty(o.Counterparty, mapString(raw, "counterPartNickName", "counterpartyName", "counterPartyNickName")),
		"counterpartyRealName": mapString(raw, "counterpartyRealName", "realName"), "paymentMethodId": o.PaymentMethodID, "binancePayId": o.BinancePayID,
		"method": map[string]any{"id": o.PaymentMethodID, "name": paymentName, "identifier": pmi}, "leadAgentId": func() any {
			if o.AssignedUserID > 0 {
				return o.AssignedUserID
			}
			return nil
		}(),
		"currentAgentId": func() any {
			if o.AssignedUserID > 0 {
				return o.AssignedUserID
			}
			return nil
		}(), "leadAgent": func() any {
			if o.AssignedUserID <= 0 {
				return nil
			}
			return map[string]any{"id": o.AssignedUserID, "name": o.AgentName}
		}(),
		"paymentDeadlineAt": deadline, "sourceNote": o.SourceNote, "createdAt": o.CreatedAt.UTC(), "updatedAt": o.UpdatedAt.UTC(),
	}
	if !full {
		out["summary"] = map[string]any{"orderAmount": fiatAmount, "actual": 0.0, "relevantActual": 0.0, "remaining": fiatAmount, "splitCount": 0}
		out["viewerSummary"] = out["summary"]
		return out
	}
	splits := s.orderSplits(ctx, u, o.ID)
	actual := 0.0
	for _, sp := range splits {
		actual += asFloat(sp["actualAmount"])
	}
	settings := s.publicSettings(ctx, u.TenantID)
	out["summary"] = map[string]any{"orderAmount": fiatAmount, "actual": actual, "relevantActual": actual, "remaining": max0(fiatAmount - actual), "splitCount": len(splits)}
	out["viewerSummary"] = out["summary"]
	out["paymentSplits"] = splits
	out["settings"] = settings
	out["finalActionSplitGate"] = finalActionSplitGate(typeVal, source, settings, splits)
	if full {
		out["raw"] = raw
		out["splits"] = splits
		out["assignments"] = s.orderAssignments(ctx, o.ID)
		out["chats"] = s.orderChats(ctx, o.ID, 100)
		out["coAgentRequests"] = s.coagentRequests(ctx, o.ID)
		out["approvals"] = s.orderApprovals(ctx, u.TenantID, o.ID)
		if c, ok := raw["counterpartyStats"]; ok {
			out["counterpartyStats"] = c
		}
		out["releaseVerificationPolicy"] = func() any {
			if o.AccountID > 0 {
				return s.releaseVerificationPolicy(ctx, u, o.AccountID)
			}
			return map[string]any{"binanceMethod": "NONE", "localVerificationEnabled": false}
		}()
	}
	return out
}
func finalActionSplitGate(tradeType, source string, settings map[string]any, splits []map[string]any) map[string]any {
	direction := "receive"
	if strings.EqualFold(tradeType, "BUY") {
		direction = "send"
	}
	enabled := strings.EqualFold(source, "offline") || mapBool(settings, "requirePaymentSplitForFinalAction")
	proofRequired := mapBool(settings, "paymentSplitProofRequired")
	relevant := 0
	missingProof := 0
	for _, split := range splits {
		if !strings.EqualFold(asString(split["direction"]), direction) || asFloat(split["actualAmount"]) <= 0 {
			continue
		}
		relevant++
		if proofRequired && !mapBool(split, "hasProof") {
			missingProof++
		}
	}
	return map[string]any{
		"enabled": enabled, "direction": direction, "proofRequired": proofRequired,
		"relevantSplitCount": relevant, "missingProofCount": missingProof,
		"satisfied": !enabled || (relevant > 0 && missingProof == 0),
	}
}

func max0(v float64) float64 {
	if v < 0 {
		return 0
	}
	return v
}

func (s *Server) accessibleAccounts(ctx context.Context, u ctxUser, permission string) map[int64]bool {
	out := map[int64]bool{}
	rows, err := s.store.DB.QueryContext(ctx, `SELECT id FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1), u.TenantID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil && s.accountPerm(ctx, u, id, permission) {
			out[id] = true
		}
	}
	return out
}

func (s *Server) ordersList(w http.ResponseWriter, r *http.Request, u ctxUser) {
	accounts := s.accessibleAccounts(r.Context(), u, "orders.view")
	q := s.orderSelectSQL() + ` WHERE o.tenant_id=` + s.store.Bind(1) + ` ORDER BY o.created_at DESC LIMIT 2000`
	rows, err := s.store.DB.QueryContext(r.Context(), q, u.TenantID)
	if err != nil {
		replyDBError(w, err)
		return
	}
	defer rows.Close()
	group := strings.ToLower(firstNonEmpty(requestString(r, "group"), "all"))
	statusFilter := strings.ToLower(requestString(r, "status"))
	credFilter := asInt64(requestString(r, "credentialId"))
	var items []map[string]any
	counts := map[string]int{"ongoing": 0, "fulfilled": 0, "completed": 0, "cancelled": 0}
	var orderIDs []int64
	for rows.Next() {
		o, e := s.scanOrder(rows)
		if e != nil {
			continue
		}
		if o.AccountID > 0 && !accounts[o.AccountID] {
			continue
		}
		closed := isOrderClosed(o.Status)
		if closed {
			counts["fulfilled"]++
			if strings.Contains(strings.ToLower(o.Status), "cancel") {
				counts["cancelled"]++
			} else {
				counts["completed"]++
			}
		} else {
			counts["ongoing"]++
		}
		if group == "ongoing" && closed {
			continue
		}
		if group == "fulfilled" && !closed {
			continue
		}
		if statusFilter != "" && strings.ToLower(o.Status) != statusFilter {
			continue
		}
		if credFilter > 0 && o.AccountID != credFilter {
			continue
		}
		items = append(items, s.orderMap(r.Context(), u, o, false))
		orderIDs = append(orderIDs, o.ID)
	}
	unread, latest, total := s.unreadSnapshot(r.Context(), u, orderIDs)
	splitSummaries := s.splitSummarySnapshot(r.Context(), u, orderIDs)
	for _, it := range items {
		id := asInt64(it["id"])
		it["unread"] = unread[id]
		if summary, ok := splitSummaries[id]; ok {
			orderAmount := asFloat(it["fiatAmount"])
			actual := asFloat(summary["actual"])
			view := map[string]any{"orderAmount": orderAmount, "actual": actual, "relevantActual": actual, "remaining": max0(orderAmount - actual), "splitCount": asInt64(summary["splitCount"])}
			it["summary"] = view
			it["viewerSummary"] = view
		}
	}
	credentialOptions := s.credentialOptions(r.Context(), u)
	writeJSON(w, 200, map[string]any{"items": items, "groupScope": group, "groupCounts": counts, "unreadCounts": unread, "unreadLatestByOrder": latest, "unreadTotal": total, "orderAcceptance": s.orderAcceptance(r.Context(), u.ID), "credentialOptions": credentialOptions, "liveCredentialOptions": filterLiveCredentials(credentialOptions)})
}
func filterLiveCredentials(in []map[string]any) []map[string]any {
	out := []map[string]any{}
	for _, x := range in {
		if strings.ToLower(asString(x["status"])) != "disabled" {
			out = append(out, x)
		}
	}
	return out
}
func (s *Server) orderAcceptance(ctx context.Context, userID int64) map[string]any {
	var a, b bool
	_ = s.store.DB.QueryRowContext(ctx, `SELECT order_accepting,ready_to_receive_orders FROM user_preferences WHERE user_id=`+s.store.Bind(1), userID).Scan(&a, &b)
	return map[string]any{"accepting": a, "ready": b}
}

func (s *Server) splitSummarySnapshot(ctx context.Context, u ctxUser, ids []int64) map[int64]map[string]any {
	out := map[int64]map[string]any{}
	if len(ids) == 0 {
		return out
	}
	placeholders := make([]string, 0, len(ids))
	args := make([]any, 0, len(ids)+1)
	args = append(args, u.TenantID)
	for i, id := range ids {
		placeholders = append(placeholders, s.store.Bind(i+2))
		args = append(args, id)
	}
	q := `SELECT order_id,COALESCE(SUM(amount),0),COUNT(*) FROM payment_splits WHERE tenant_id=` + s.store.Bind(1) + ` AND order_id IN (` + strings.Join(placeholders, ",") + `) GROUP BY order_id`
	rows, err := s.store.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var orderID int64
		var actual float64
		var count int64
		if rows.Scan(&orderID, &actual, &count) == nil {
			out[orderID] = map[string]any{"actual": actual, "splitCount": count}
		}
	}
	return out
}

func (s *Server) unreadSnapshot(ctx context.Context, u ctxUser, ids []int64) (map[int64]int, map[int64]any, int) {
	counts := map[int64]int{}
	latest := map[int64]any{}
	if len(ids) == 0 {
		return counts, latest, 0
	}
	placeholders := make([]string, 0, len(ids))
	args := make([]any, 0, len(ids)+2)
	args = append(args, u.ID, u.TenantID)
	for i, id := range ids {
		placeholders = append(placeholders, s.store.Bind(i+3))
		args = append(args, id)
	}
	q := `SELECT c.order_id,COUNT(*),MAX(c.id) FROM chats c LEFT JOIN chat_read_states r ON r.user_id=` + s.store.Bind(1) + ` AND r.order_id=c.order_id WHERE c.tenant_id=` + s.store.Bind(2) + ` AND c.order_id IN (` + strings.Join(placeholders, ",") + `) AND c.is_self=FALSE AND c.id>COALESCE(r.last_read_chat_id,0) GROUP BY c.order_id`
	rows, err := s.store.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return counts, latest, 0
	}
	latestIDs := []int64{}
	total := 0
	for rows.Next() {
		var orderID, maxID int64
		var count int
		if rows.Scan(&orderID, &count, &maxID) == nil {
			counts[orderID] = count
			total += count
			if maxID > 0 {
				latestIDs = append(latestIDs, maxID)
			}
		}
	}
	rows.Close()
	if len(latestIDs) == 0 {
		return counts, latest, total
	}
	latestPH := make([]string, 0, len(latestIDs))
	latestArgs := make([]any, 0, len(latestIDs)+1)
	latestArgs = append(latestArgs, u.TenantID)
	for i, id := range latestIDs {
		latestPH = append(latestPH, s.store.Bind(i+2))
		latestArgs = append(latestArgs, id)
	}
	q = `SELECT order_id,content,message_type,sent_at FROM chats WHERE tenant_id=` + s.store.Bind(1) + ` AND id IN (` + strings.Join(latestPH, ",") + `)`
	rows, err = s.store.DB.QueryContext(ctx, q, latestArgs...)
	if err != nil {
		return counts, latest, total
	}
	defer rows.Close()
	for rows.Next() {
		var orderID int64
		var content, typ string
		var sent time.Time
		if rows.Scan(&orderID, &content, &typ, &sent) == nil {
			latest[orderID] = map[string]any{"content": content, "type": typ, "sentAt": sent}
		}
	}
	return counts, latest, total
}

func (s *Server) orderGet(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.view")
	if err != nil {
		replyDBError(w, err)
		return
	}
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}

func (s *Server) orderCreate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	source := strings.ToLower(firstNonEmpty(mapString(in, "orderSource"), "binance"))
	accountID := mapInt64(in, "credentialId", "exchangeAccountId")
	if source != "offline" {
		if accountID == 0 {
			writeJSON(w, 422, envelope{"error": "credentialId required"})
			return
		}
		if !s.accountPerm(r.Context(), u, accountID, "orders.create") && !s.accountPerm(r.Context(), u, accountID, "orders.manage") {
			writeJSON(w, 403, envelope{"error": "forbidden"})
			return
		}
	}
	no := firstNonEmpty(mapString(in, "externalOrderNo", "orderNo"), func() string {
		if source == "offline" {
			return fmt.Sprintf("OFFLINE-%d", time.Now().UnixMilli())
		}
		return fmt.Sprintf("LOCAL-%d", time.Now().UnixMilli())
	}())
	trade := strings.ToUpper(firstNonEmpty(mapString(in, "type", "tradeType"), "BUY"))
	if trade != "BUY" && trade != "SELL" {
		writeJSON(w, 422, envelope{"error": "type must be BUY or SELL"})
		return
	}
	fiatAmount := mapFloat(in, "fiatAmount", "amount", "total")
	rate := mapFloat(in, "rate", "price")
	assetAmount := mapFloat(in, "assetAmount")
	if assetAmount == 0 && rate > 0 {
		assetAmount = fiatAmount / rate
	}
	if fiatAmount <= 0 {
		writeJSON(w, 422, envelope{"error": "positive amount required"})
		return
	}
	asset := strings.ToUpper(firstNonEmpty(mapString(in, "asset"), func() string {
		if source == "offline" {
			return "LOCAL_GOODS"
		}
		return "USDT"
	}()))
	fiat := strings.ToUpper(firstNonEmpty(mapString(in, "fiatUnit", "fiat"), "BDT"))
	pmid := mapInt64(in, "paymentMethodId")
	pmi := mapString(in, "paymentMethodIdentifier", "payType")
	payID := mapInt64(in, "binancePayId", "payId")
	limit := mapFloat(in, "paymentTimeLimitMinutes")
	if limit <= 0 {
		limit = 15
	}
	deadline := time.Now().UTC().Add(time.Duration(limit * float64(time.Minute)))
	counterparty := mapString(in, "counterpartyName")
	status := "manager_queue"
	raw := mergeMaps(in, map[string]any{"assetAmount": assetAmount, "paymentTimeLimitMinutes": limit})
	assigned := s.pickAgent(r.Context(), u, accountID, pmid, 0)
	if assigned > 0 {
		status = "assigned"
	}
	pg := `INSERT INTO orders(tenant_id,exchange_account_id,external_order_no,status,trade_type,asset,fiat,price,amount,total,counterparty_name,assigned_user_id,raw_json,order_source,external_status,payment_method_id,payment_method_identifier,binance_pay_id,payment_deadline_at,source_note,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`
	my := `INSERT INTO orders(tenant_id,exchange_account_id,external_order_no,status,trade_type,asset,fiat,price,amount,total,counterparty_name,assigned_user_id,raw_json,order_source,external_status,payment_method_id,payment_method_identifier,binance_pay_id,payment_deadline_at,source_note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
	id, err := s.insertID(r.Context(), pg, my, u.TenantID, sqlNullInt64(accountID), no, status, trade, asset, fiat, rate, assetAmount, fiatAmount, counterparty, sqlNullInt64(assigned), rawJSON(raw), source, mapString(in, "externalStatus"), pmid, pmi, payID, deadline, mapString(in, "sourceNote"))
	if err != nil {
		replyDBError(w, err)
		return
	}
	if assigned > 0 {
		s.createAssignment(r.Context(), u.TenantID, id, assigned, "lead", fiatAmount, u.ID)
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "order_created", "order", asString(id), r, map[string]any{"source": source, "credentialId": accountID})
	s.svc.Publish(r.Context(), events.Event{TenantID: u.TenantID, Type: "order.created", Data: map[string]any{"id": id, "orderNo": no}})
	o, _ := s.getOrder(r.Context(), u, id, "orders.view")
	writeJSON(w, 201, s.orderMap(r.Context(), u, o, true))
}

func (s *Server) pickAgent(ctx context.Context, u ctxUser, accountID, paymentMethodID, exclude int64) int64 {
	q := `SELECT u.id FROM users u JOIN user_preferences p ON p.user_id=u.id WHERE u.tenant_id=` + s.store.Bind(1) + ` AND u.status='active' AND u.role_code='agent' AND p.order_accepting=TRUE AND p.ready_to_receive_orders=TRUE ORDER BY (SELECT COUNT(*) FROM orders o WHERE o.assigned_user_id=u.id AND o.status NOT IN ('completed','cancelled','expired')) ASC,u.last_seen_at DESC`
	rows, err := s.store.DB.QueryContext(ctx, q, u.TenantID)
	if err != nil {
		return 0
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		if rows.Scan(&id) != nil || id == exclude {
			continue
		}
		candidate := ctxUser{ID: id, TenantID: u.TenantID}
		candidate.Permissions = s.permissionCodes(ctx, candidate)
		if accountID <= 0 || s.accountPerm(ctx, candidate, accountID, "orders.view") {
			return id
		}
	}
	return 0
}
func (s *Server) createAssignment(ctx context.Context, tenantID, orderID, userID int64, role string, amount float64, by int64) {
	q := `INSERT INTO order_assignments(tenant_id,order_id,user_id,role,assigned_amount,direction,status,assigned_by,created_at,updated_at) VALUES(` + s.store.Bind(1) + `,` + s.store.Bind(2) + `,` + s.store.Bind(3) + `,` + s.store.Bind(4) + `,` + s.store.Bind(5) + `,'','assigned',` + s.store.Bind(6) + `,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
	_, _ = s.store.DB.ExecContext(ctx, q, tenantID, orderID, userID, role, amount, sqlNullInt64(by))
}

func (s *Server) ordersSync(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if r.ContentLength > 0 {
		if !decode(w, r, &in) {
			return
		}
	} else {
		in = map[string]any{}
	}
	id := mapInt64(in, "credentialId")
	if id == 0 {
		id = asInt64(requestString(r, "credentialId"))
	}
	var ids []int64
	if id > 0 {
		ids = []int64{id}
	} else {
		for _, o := range s.credentialOptions(r.Context(), u) {
			if strings.ToLower(asString(o["status"])) != "disabled" {
				ids = append(ids, asInt64(o["id"]))
			}
		}
	}
	created, updated := 0, 0
	errs := []string{}
	for _, cid := range ids {
		if !s.accountPerm(r.Context(), u, cid, "binance.sync") {
			continue
		}
		c, up, err := s.syncOrdersForCredential(r.Context(), u, cid, false)
		created += c
		updated += up
		if err != nil {
			errs = append(errs, fmt.Sprintf("%d: %s", cid, err))
		}
	}
	writeJSON(w, 200, map[string]any{"ok": len(errs) == 0, "created": created, "updated": updated, "errors": errs})
}
func (s *Server) syncOrdersForCredential(ctx context.Context, u ctxUser, accountID int64, background bool) (int, int, error) {
	cred, err := s.svc.Credential(ctx, u.TenantID, accountID)
	if err != nil {
		return 0, 0, err
	}
	const rowsPerPage = 20
	maxPages := s.cfg.BinanceSyncMaxPages
	if maxPages < 1 {
		maxPages = 1
	}
	created, updated, seen := 0, 0, 0
	for page := 1; page <= maxPages; page++ {
		res, callErr := s.svc.Binance.Call(ctx, s.svc.BinanceCredential(cred), "listOrders", nil, map[string]any{"page": page, "rows": rowsPerPage}, background)
		s.updateUsage(ctx, u.TenantID, "api_requests", 1)
		if callErr != nil {
			return created, updated, callErr
		}
		items := responseDataSlice(res)
		seen += len(items)
		for _, v := range items {
			m, ok := v.(map[string]any)
			if !ok {
				continue
			}
			wasCreated, changed, e := s.upsertBinanceOrder(ctx, u, accountID, m)
			if e != nil {
				return created, updated, e
			}
			if wasCreated {
				created++
			} else if changed {
				updated++
			}
		}
		if len(items) < rowsPerPage {
			break
		}
	}
	_, _ = s.store.DB.ExecContext(ctx, `UPDATE exchange_accounts SET last_sync_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=`+s.store.Bind(1)+` AND id=`+s.store.Bind(2), u.TenantID, accountID)
	s.updateUsage(ctx, u.TenantID, "orders_synced", int64(seen))
	if created+updated > 0 {
		if err := s.accountingReconcileAllCarryover(ctx, u.TenantID); err != nil {
			return created, updated, fmt.Errorf("carryover reconciliation: %w", err)
		}
		s.svc.Publish(ctx, events.Event{TenantID: u.TenantID, Type: "orders.synced", Data: map[string]any{"credentialId": accountID, "count": seen, "created": created, "updated": updated}})
	}
	return created, updated, nil
}

func (s *Server) upsertBinanceOrder(ctx context.Context, u ctxUser, accountID int64, m map[string]any) (bool, bool, error) {
	no := mapString(m, "orderNumber", "orderNo", "adOrderNo", "orderId")
	if no == "" {
		return false, false, nil
	}
	status := normalizeOrderStatus(firstMapValue(m, "orderStatus", "status"))
	trade := strings.ToUpper(mapString(m, "tradeType"))
	asset := mapString(m, "asset")
	fiat := firstNonEmpty(mapString(m, "fiatUnit", "fiat"), "BDT")
	price := mapFloat(m, "price", "unitPrice")
	assetAmt := mapFloat(m, "quantity", "amount", "assetAmount")
	total := mapFloat(m, "totalPrice", "totalAmount", "fiatAmount")
	if total == 0 && price > 0 && assetAmt > 0 {
		total = price * assetAmt
	}
	counterparty := mapString(m, "counterPartNickName", "counterpartyName", "counterPartyNickName", "buyerNickname", "sellerNickname")
	extStatus := mapString(m, "orderStatus", "status")
	pmID := mapInt64(m, "paymentMethodId")
	payID := mapInt64(m, "payId")
	pmi := mapString(m, "payType", "tradeMethodIdentifier", "tradeMethodName")
	deadline := parseAnyTime(firstMapValue(m, "payEndTime", "paymentDeadlineAt", "expireTime"))
	completionRaw := firstMapValue(m, "completedAt", "completeTime", "completedTime", "orderCompleteTime", "finishTime")
	var completedAt any
	if completionRaw != nil && strings.TrimSpace(asString(completionRaw)) != "" {
		completedAt = parseAnyTime(completionRaw)
	} else if status == "completed" || status == "released" {
		completedAt = time.Now().UTC()
	}
	markCompleted := func() {
		if completedAt == nil {
			return
		}
		_, _ = s.store.DB.ExecContext(ctx, `UPDATE orders SET completed_at=COALESCE(completed_at,`+s.store.Bind(1)+`) WHERE tenant_id=`+s.store.Bind(2)+` AND exchange_account_id=`+s.store.Bind(3)+` AND external_order_no=`+s.store.Bind(4), completedAt, u.TenantID, accountID, no)
	}
	raw := rawJSON(m)
	sourceHash := hashToken(raw)
	netAsset, feeAsset := accountingOrderAssetFacts(trade, assetAmt, m)
	if s.store.Driver == "postgres" {
		var inserted bool
		err := s.store.DB.QueryRowContext(ctx, `INSERT INTO orders(tenant_id,exchange_account_id,external_order_no,status,trade_type,asset,fiat,price,amount,total,counterparty_name,accounting_net_asset,accounting_fee_asset,accounting_fact_version,raw_json,source_hash,order_source,external_status,payment_method_id,payment_method_identifier,binance_pay_id,payment_deadline_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,1,$14,$15,'binance',$16,$17,$18,$19,$20,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,exchange_account_id,external_order_no) DO UPDATE SET status=EXCLUDED.status,trade_type=EXCLUDED.trade_type,asset=EXCLUDED.asset,fiat=EXCLUDED.fiat,price=EXCLUDED.price,amount=EXCLUDED.amount,total=EXCLUDED.total,counterparty_name=EXCLUDED.counterparty_name,accounting_net_asset=EXCLUDED.accounting_net_asset,accounting_fee_asset=EXCLUDED.accounting_fee_asset,accounting_fact_version=1,raw_json=EXCLUDED.raw_json,source_hash=EXCLUDED.source_hash,external_status=EXCLUDED.external_status,payment_method_id=EXCLUDED.payment_method_id,payment_method_identifier=EXCLUDED.payment_method_identifier,binance_pay_id=EXCLUDED.binance_pay_id,payment_deadline_at=EXCLUDED.payment_deadline_at,updated_at=CURRENT_TIMESTAMP WHERE orders.source_hash IS DISTINCT FROM EXCLUDED.source_hash OR orders.accounting_fact_version<1 RETURNING (xmax=0)`, u.TenantID, accountID, no, status, trade, asset, fiat, price, assetAmt, total, counterparty, netAsset, feeAsset, raw, sourceHash, extStatus, pmID, pmi, payID, deadline).Scan(&inserted)
		if err == sql.ErrNoRows {
			markCompleted()
			return false, false, nil
		}
		if err == nil {
			markCompleted()
		}
		if err == nil && inserted {
			s.autoAssignSyncedOrder(ctx, u, accountID, no)
		}
		return inserted, err == nil, err
	}
	var existingHash string
	var existingFactVersion int
	err := s.store.DB.QueryRowContext(ctx, `SELECT source_hash,accounting_fact_version FROM orders WHERE tenant_id=? AND exchange_account_id=? AND external_order_no=?`, u.TenantID, accountID, no).Scan(&existingHash, &existingFactVersion)
	exists := err == nil
	if err != nil && err != sql.ErrNoRows {
		return false, false, err
	}
	if exists && existingHash == sourceHash && existingFactVersion >= 1 {
		markCompleted()
		return false, false, nil
	}
	_, err = s.store.DB.ExecContext(ctx, `INSERT INTO orders(tenant_id,exchange_account_id,external_order_no,status,trade_type,asset,fiat,price,amount,total,counterparty_name,accounting_net_asset,accounting_fee_asset,accounting_fact_version,raw_json,source_hash,order_source,external_status,payment_method_id,payment_method_identifier,binance_pay_id,payment_deadline_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,'binance',?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE status=VALUES(status),trade_type=VALUES(trade_type),asset=VALUES(asset),fiat=VALUES(fiat),price=VALUES(price),amount=VALUES(amount),total=VALUES(total),counterparty_name=VALUES(counterparty_name),accounting_net_asset=VALUES(accounting_net_asset),accounting_fee_asset=VALUES(accounting_fee_asset),accounting_fact_version=1,raw_json=VALUES(raw_json),source_hash=VALUES(source_hash),external_status=VALUES(external_status),payment_method_id=VALUES(payment_method_id),payment_method_identifier=VALUES(payment_method_identifier),binance_pay_id=VALUES(binance_pay_id),payment_deadline_at=VALUES(payment_deadline_at),updated_at=CURRENT_TIMESTAMP`, u.TenantID, accountID, no, status, trade, asset, fiat, price, assetAmt, total, counterparty, netAsset, feeAsset, raw, sourceHash, extStatus, pmID, pmi, payID, deadline)
	if err == nil {
		markCompleted()
	}
	if err == nil && !exists {
		s.autoAssignSyncedOrder(ctx, u, accountID, no)
	}
	return !exists, err == nil, err
}

func (s *Server) autoAssignSyncedOrder(ctx context.Context, u ctxUser, accountID int64, no string) {
	var enabled bool = true
	_ = s.store.DB.QueryRowContext(ctx, `SELECT auto_assign FROM chat_account_controls WHERE tenant_id=`+s.store.Bind(1)+` AND exchange_account_id=`+s.store.Bind(2), u.TenantID, accountID).Scan(&enabled)
	if !enabled {
		return
	}
	var id int64
	var amount float64
	_ = s.store.DB.QueryRowContext(ctx, `SELECT id,total FROM orders WHERE tenant_id=`+s.store.Bind(1)+` AND exchange_account_id=`+s.store.Bind(2)+` AND external_order_no=`+s.store.Bind(3), u.TenantID, accountID, no).Scan(&id, &amount)
	agent := s.pickAgent(ctx, u, accountID, 0, 0)
	if agent > 0 {
		_, _ = s.store.DB.ExecContext(ctx, `UPDATE orders SET assigned_user_id=`+s.store.Bind(1)+`,status=CASE WHEN status IN ('unpaid','paid','appeal') THEN status ELSE 'assigned' END,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2), agent, id)
		s.createAssignment(ctx, u.TenantID, id, agent, "lead", amount, 0)
		s.svc.Notify(ctx, u.TenantID, agent, "order_assigned", "New P2P order assigned", no, map[string]any{"orderId": id, "credentialId": accountID})
	}
}

func (s *Server) refreshBinanceOrderRecord(ctx context.Context, u ctxUser, o orderRecord, orderNo string, background bool) (orderRecord, error) {
	if o.AccountID <= 0 {
		return o, fmt.Errorf("offline order")
	}
	if strings.TrimSpace(orderNo) == "" {
		orderNo = o.ExternalNo
	}
	cred, err := s.svc.Credential(ctx, u.TenantID, o.AccountID)
	if err != nil {
		return o, err
	}
	res, err := s.svc.Binance.Call(ctx, s.svc.BinanceCredential(cred), "getUserOrderDetail", nil, map[string]any{"adOrderNo": orderNo}, background)
	s.updateUsage(ctx, u.TenantID, "api_requests", 1)
	if err != nil {
		return o, err
	}
	detail := responseDataMap(res)
	if len(detail) > 0 {
		if _, _, err = s.upsertBinanceOrder(ctx, u, o.AccountID, detail); err != nil {
			return o, err
		}
	}
	return s.getOrder(ctx, u, o.ID, "orders.view")
}

func (s *Server) refreshCounterpartyStats(ctx context.Context, u ctxUser, o orderRecord, background bool) error {
	if o.AccountID <= 0 {
		return fmt.Errorf("offline order")
	}
	cred, err := s.svc.Credential(ctx, u.TenantID, o.AccountID)
	if err != nil {
		return err
	}
	res, err := s.svc.Binance.Call(ctx, s.svc.BinanceCredential(cred), "queryCounterPartyOrderStatistic", nil, map[string]any{"orderNumber": o.ExternalNo}, background)
	s.updateUsage(ctx, u.TenantID, "api_requests", 1)
	if err != nil {
		return err
	}
	var rawText string
	if err := s.store.DB.QueryRowContext(ctx, `SELECT raw_json FROM orders WHERE tenant_id=`+s.store.Bind(1)+` AND id=`+s.store.Bind(2), u.TenantID, o.ID).Scan(&rawText); err != nil {
		return err
	}
	raw := jsonMap(rawText)
	raw["counterpartyStats"] = binance.Data(res)
	_, err = s.store.DB.ExecContext(ctx, `UPDATE orders SET raw_json=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=`+s.store.Bind(2)+` AND id=`+s.store.Bind(3), rawJSON(raw), u.TenantID, o.ID)
	return err
}

func (s *Server) orderBinanceRefresh(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.view")
	if err != nil {
		replyDBError(w, err)
		return
	}
	if o.AccountID <= 0 {
		writeJSON(w, 422, envelope{"error": "offline_order"})
		return
	}
	var in map[string]any
	_ = json.NewDecoder(r.Body).Decode(&in)
	o, err = s.refreshBinanceOrderRecord(r.Context(), u, o, firstNonEmpty(mapString(in, "binanceOrderNumber"), o.ExternalNo), false)
	if err != nil {
		writeJSON(w, 502, envelope{"error": "binance_refresh_failed", "message": friendlyBinanceError(err)})
		return
	}
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}
func (s *Server) orderBinanceCounterparty(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.view")
	if err != nil {
		replyDBError(w, err)
		return
	}
	if o.AccountID <= 0 {
		writeJSON(w, 422, envelope{"error": "offline_order"})
		return
	}
	cred, _ := s.svc.Credential(r.Context(), u.TenantID, o.AccountID)
	res, err := s.svc.Binance.Call(r.Context(), s.svc.BinanceCredential(cred), "queryCounterPartyOrderStatistic", nil, map[string]any{"orderNumber": o.ExternalNo}, false)
	s.updateUsage(r.Context(), u.TenantID, "api_requests", 1)
	if err != nil {
		writeJSON(w, 502, envelope{"error": "binance_counterparty_failed", "message": friendlyBinanceError(err)})
		return
	}
	raw := jsonMap(o.Raw)
	raw["counterpartyStats"] = binance.Data(res)
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE orders SET raw_json=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2), rawJSON(raw), o.ID)
	o, _ = s.getOrder(r.Context(), u, o.ID, "orders.view")
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}
func (s *Server) orderBinanceChatSync(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "binance.chat")
	if err != nil {
		replyDBError(w, err)
		return
	}
	if o.AccountID <= 0 {
		writeJSON(w, 422, envelope{"error": "offline_order"})
		return
	}
	n, err := s.syncBinanceChat(r.Context(), u, o, false)
	if err != nil {
		writeJSON(w, 502, envelope{"error": "binance_chat_sync_failed", "message": friendlyBinanceError(err)})
		return
	}
	o, _ = s.getOrder(r.Context(), u, o.ID, "orders.view")
	out := s.orderMap(r.Context(), u, o, true)
	out["syncedMessages"] = n
	writeJSON(w, 200, out)
}
func (s *Server) orderBinanceAutoSync(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	o, err := s.getOrder(r.Context(), u, id, "orders.view")
	if err != nil {
		replyDBError(w, err)
		return
	}
	if o.AccountID <= 0 {
		writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
		return
	}
	// Refresh the authoritative order first. Counterparty/chat requests are then
	// independent and run concurrently, avoiding both the legacy serial latency
	// chain and a raw_json lost-update race with the detail upsert.
	o, err = s.refreshBinanceOrderRecord(r.Context(), u, o, o.ExternalNo, true)
	errs := []string{}
	if err != nil {
		errs = append(errs, err.Error())
	} else {
		var wg sync.WaitGroup
		ch := make(chan error, 2)
		wg.Add(2)
		go func(order orderRecord) {
			defer wg.Done()
			if _, e := s.syncBinanceChat(r.Context(), u, order, true); e != nil {
				ch <- e
			}
		}(o)
		go func(order orderRecord) {
			defer wg.Done()
			if e := s.refreshCounterpartyStats(r.Context(), u, order, true); e != nil {
				ch <- e
			}
		}(o)
		wg.Wait()
		close(ch)
		for e := range ch {
			errs = append(errs, e.Error())
		}
	}
	o, _ = s.getOrder(r.Context(), u, id, "orders.view")
	out := s.orderMap(r.Context(), u, o, true)
	out["syncErrors"] = errs
	out["syncOk"] = len(errs) == 0
	writeJSON(w, 200, out)
}

func (s *Server) orderAdditionalKYC(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.final_action")
	if err != nil {
		replyDBError(w, err)
		return
	}
	if o.AccountID <= 0 {
		writeJSON(w, 422, envelope{"error": "offline_order"})
		return
	}
	cred, _ := s.svc.Credential(r.Context(), u.TenantID, o.AccountID)
	_, err = s.svc.Binance.Call(r.Context(), s.svc.BinanceCredential(cred), "verifiedAdditionalKyc", nil, map[string]any{"orderNumber": o.ExternalNo}, false)
	if err != nil {
		writeJSON(w, 502, envelope{"error": "binance_kyc_failed", "message": friendlyBinanceError(err)})
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "binance_additional_kyc_verified", "order", asString(o.ID), r, nil)
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}

func (s *Server) orderCompleteAction(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.final_action")
	if err != nil {
		replyDBError(w, err)
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	action := strings.ToLower(mapString(in, "action"))
	if action == "" {
		action = "complete"
	}
	switch action {
	case "paid_mark":
		action = "mark_paid"
	case "release_coin":
		action = "release"
	}
	if o.AccountID > 0 && !s.accountPerm(r.Context(), u, o.AccountID, "orders.final_action") {
		writeJSON(w, 403, envelope{"error": "forbidden"})
		return
	}
	if action == "quick_release" {
		if !s.hasPerm(u, "orders.quick_release") || (o.AccountID > 0 && !s.accountPerm(r.Context(), u, o.AccountID, "orders.quick_release")) {
			writeJSON(w, 403, envelope{"error": "forbidden", "permission": "orders.quick_release"})
			return
		}
	}
	approvalID, approvalReady, approvalIssues, approvalErr := s.ensureFinalActionApproval(r.Context(), u, o, action)
	if approvalErr != nil {
		replyDBError(w, approvalErr)
		return
	}
	if approvalID > 0 && !approvalReady {
		writeJSON(w, 428, envelope{"error": "manager_approval_required", "message": "A manager must approve this final action before Binance execution.", "approvalRequired": true, "approvalId": approvalID, "issues": approvalIssues, "order": s.orderMap(r.Context(), u, o, true)})
		return
	}
	if s.finalActionNeedsVerification(r.Context(), u, o, action) {
		token := mapString(in, "localVerificationToken", "verificationToken", "token")
		if !s.consumeFinalActionVerification(r.Context(), r, u, o, action, token) {
			writeJSON(w, 428, envelope{"error": "verification_required", "action": action, "localVerificationRequired": true})
			return
		}
	}
	nextStatus := o.Status
	if o.AccountID > 0 {
		cred, e := s.svc.Credential(r.Context(), u.TenantID, o.AccountID)
		if e != nil {
			replyDBError(w, e)
			return
		}
		bc := s.svc.BinanceCredential(cred)
		switch action {
		case "mark_paid", "paid":
			if strings.ToUpper(o.TradeType) != "BUY" {
				writeJSON(w, 422, envelope{"error": "mark_paid_requires_buy_order"})
				return
			}
			payID := mapInt64(in, "payId")
			if payID == 0 {
				payID = o.BinancePayID
			}
			if payID == 0 || strings.TrimSpace(o.ExternalNo) == "" {
				if refreshed, refreshErr := s.refreshBinanceOrderRecord(r.Context(), u, o, o.ExternalNo, false); refreshErr == nil {
					o = refreshed
					payID = o.BinancePayID
				}
			}
			if payID <= 0 {
				writeJSON(w, 422, envelope{"error": "binance_pay_id_required", "message": "Sync the Binance order detail and select its payment method before Mark as Paid."})
				return
			}
			if approvalID > 0 && !s.claimApprovalExecution(r.Context(), u.TenantID, approvalID) {
				writeJSON(w, 409, envelope{"error": "approval_not_executable", "approvalId": approvalID})
				return
			}
			_, e = s.svc.Binance.Call(r.Context(), bc, "markOrderAsPaid", nil, map[string]any{"orderNumber": o.ExternalNo, "payId": payID}, false)
			if e != nil {
				s.finishApprovalExecution(r.Context(), u.TenantID, approvalID, false, friendlyBinanceError(e))
			}
			s.updateUsage(r.Context(), u.TenantID, "api_requests", 1)
			nextStatus = "paid"
		case "release", "quick_release":
			if strings.ToUpper(o.TradeType) != "SELL" {
				writeJSON(w, 422, envelope{"error": "release_requires_sell_order"})
				return
			}
			if refreshed, refreshErr := s.refreshBinanceOrderRecord(r.Context(), u, o, o.ExternalNo, false); refreshErr == nil {
				o = refreshed
			}
			payID := mapInt64(in, "payId")
			if payID == 0 {
				payID = o.BinancePayID
			}
			if payID <= 0 {
				writeJSON(w, 422, envelope{"error": "binance_pay_id_required", "message": "Sync the Binance order detail before Release."})
				return
			}
			payload := map[string]any{"orderNumber": o.ExternalNo, "payId": payID}
			policy := s.releaseVerificationPolicy(r.Context(), u, o.AccountID)
			fundPwdFlow := strings.EqualFold(mapString(policy, "binanceMethod"), "FUND_PWD") || strings.EqualFold(mapString(in, "authType"), "FUND_PWD")
			if fundPwdFlow {
				fundPassword := asString(in["fundPassword"])
				if fundPassword == "" {
					fundPassword = s.releaseFundPassword(r.Context(), o.AccountID)
				}
				if fundPassword == "" {
					writeJSON(w, 428, envelope{"error": "fund_password_required", "fundPasswordRequired": true, "releaseVerificationPolicy": policy, "order": s.orderMap(r.Context(), u, o, true)})
					return
				}
				keyResp, keyErr := s.svc.Binance.Call(r.Context(), bc, "getC2cRsaPublicKey", nil, nil, false)
				s.updateUsage(r.Context(), u.TenantID, "api_requests", 1)
				if keyErr != nil {
					writeJSON(w, 502, envelope{"error": "fund_password_rsa_key_failed", "message": friendlyBinanceError(keyErr)})
					return
				}
				publicKey := binance.FindRSAPublicKey(binance.Data(keyResp))
				cipher, encErr := binance.EncryptRSAOAEPBase64(publicKey, fundPassword)
				if encErr != nil {
					writeJSON(w, 502, envelope{"error": "fund_password_rsa_encrypt_failed", "message": encErr.Error()})
					return
				}
				payload["authType"] = "FUND_PWD"
				payload["code"] = cipher
				payload["confirmPaidType"] = "normal"
			} else {
				for _, k := range []string{"authType", "code", "confirmPaidType", "emailVerifyCode", "googleVerifyCode", "mobileVerifyCode", "yubikeyVerifyCode"} {
					if v, ok := in[k]; ok && strings.TrimSpace(fmt.Sprint(v)) != "" {
						payload[k] = v
					}
				}
			}
			// Binance documents checkIfCanReleaseCoin with the same confirmation
			// payload. FUND_PWD follows the migrated CS-confirmed direct flow:
			// fetch RSA key -> OAEP-SHA256 encrypt locally -> releaseCoin.
			if !fundPwdFlow {
				check, checkErr := s.svc.Binance.Call(r.Context(), bc, "checkIfCanReleaseCoin", nil, payload, false)
				s.updateUsage(r.Context(), u.TenantID, "api_requests", 1)
				if checkErr != nil {
					if s.writeReleaseVerificationError(w, r, u, o, policy, payload, checkErr) {
						return
					}
					e = checkErr
					break
				}
				if allowed, known := binanceBooleanResult(check); !known || !allowed {
					writeJSON(w, 409, envelope{"error": "binance_release_not_allowed", "check": binance.Data(check)})
					return
				}
			}
			if approvalID > 0 && !s.claimApprovalExecution(r.Context(), u.TenantID, approvalID) {
				writeJSON(w, 409, envelope{"error": "approval_not_executable", "approvalId": approvalID})
				return
			}
			_, e = s.svc.Binance.Call(r.Context(), bc, "releaseCoin", nil, payload, false)
			if e != nil {
				s.finishApprovalExecution(r.Context(), u.TenantID, approvalID, false, friendlyBinanceError(e))
			}
			s.updateUsage(r.Context(), u.TenantID, "api_requests", 1)
			if e != nil && s.writeReleaseVerificationError(w, r, u, o, policy, payload, e) {
				return
			}
			nextStatus = "completed"
		case "cancel":
			_, e = s.svc.Binance.Call(r.Context(), bc, "cancelOrder", nil, map[string]any{"orderNumber": o.ExternalNo, "orderCancelReasonCode": mapInt64(in, "orderCancelReasonCode"), "orderCancelAdditionalInfo": mapString(in, "reason", "orderCancelAdditionalInfo")}, false)
			s.updateUsage(r.Context(), u.TenantID, "api_requests", 1)
			nextStatus = "cancelled"
		case "complete":
			nextStatus = "completed"
		default:
			writeJSON(w, 422, envelope{"error": "unknown_action"})
			return
		}
		if e != nil {
			writeJSON(w, 502, envelope{"error": "binance_action_failed", "message": friendlyBinanceError(e)})
			return
		}
	}
	if o.AccountID <= 0 {
		if approvalID > 0 && !s.claimApprovalExecution(r.Context(), u.TenantID, approvalID) {
			writeJSON(w, 409, envelope{"error": "approval_not_executable", "approvalId": approvalID})
			return
		}
		switch action {
		case "cancel":
			nextStatus = "cancelled"
		case "complete", "release", "quick_release":
			nextStatus = "completed"
		case "mark_paid", "paid":
			nextStatus = "paid"
		}
	}
	_, err = s.store.DB.ExecContext(r.Context(), `UPDATE orders SET status=`+s.store.Bind(1)+`,final_action_by=`+s.store.Bind(2)+`,completed_at=CASE WHEN `+s.store.Bind(3)+` IN ('completed','cancelled') THEN CURRENT_TIMESTAMP ELSE completed_at END,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(4)+` AND tenant_id=`+s.store.Bind(5), nextStatus, u.ID, nextStatus, o.ID, u.TenantID)
	if err != nil {
		s.finishApprovalExecution(r.Context(), u.TenantID, approvalID, false, err.Error())
		replyDBError(w, err)
		return
	}
	s.finishApprovalExecution(r.Context(), u.TenantID, approvalID, true, "")
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "order_final_action_"+action, "order", asString(o.ID), r, map[string]any{"status": nextStatus, "approvalId": approvalID})
	s.svc.Publish(r.Context(), events.Event{TenantID: u.TenantID, Type: "order.updated", Data: map[string]any{"id": o.ID, "status": nextStatus}})
	o, _ = s.getOrder(r.Context(), u, o.ID, "orders.view")
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}
func binanceBooleanResult(v map[string]any) (bool, bool) {
	d := binance.Data(v)
	switch x := d.(type) {
	case bool:
		return x, true
	case float64:
		return x != 0, true
	case string:
		x = strings.TrimSpace(strings.ToLower(x))
		if x == "true" || x == "1" || x == "yes" {
			return true, true
		}
		if x == "false" || x == "0" || x == "no" {
			return false, true
		}
	case map[string]any:
		for _, k := range []string{"allowed", "canRelease", "success", "result"} {
			if raw, ok := x[k]; ok {
				return binanceBooleanResult(map[string]any{"data": raw})
			}
		}
	}
	return false, false
}

func inferReleaseRequirementsFromError(err error) map[string]any {
	message := ""
	code := ""
	var be *binance.Error
	if errors.As(err, &be) {
		message = firstNonEmpty(be.Message, be.Error())
		code = be.Code
	} else if err != nil {
		message = err.Error()
	}
	lower := strings.ToLower(message)
	fields := []map[string]any{}
	hidden := map[string]any{}
	add := func(name, label, placeholder, fieldType string) {
		for _, field := range fields {
			if asString(field["name"]) == name {
				return
			}
		}
		fields = append(fields, map[string]any{"name": name, "label": label, "placeholder": placeholder, "type": fieldType, "autocomplete": "one-time-code"})
	}
	if strings.Contains(lower, "email") {
		add("emailVerifyCode", "Email verification code", "Enter the email code required by Binance", "text")
	}
	if strings.Contains(lower, "mobile") || strings.Contains(lower, "phone") || strings.Contains(lower, "sms") {
		add("mobileVerifyCode", "SMS / mobile verification code", "Enter the SMS code required by Binance", "text")
	}
	if strings.Contains(lower, "google") || strings.Contains(lower, "gauth") || strings.Contains(lower, "totp") || strings.Contains(lower, "authenticator") {
		add("googleVerifyCode", "Google Authenticator code", "Enter the Authenticator code required by Binance", "text")
	}
	if strings.Contains(lower, "yubi") || strings.Contains(lower, "yubikey") {
		add("yubikeyVerifyCode", "YubiKey verification code", "Enter the YubiKey code required by Binance", "text")
	}
	if strings.Contains(lower, "fund_pwd") || strings.Contains(lower, "fund password") || strings.Contains(lower, "fund transfer password") || strings.Contains(lower, "payment password") || strings.Contains(lower, "asset password") {
		hidden["authType"] = "FUND_PWD"
		add("code", "Fund password / release verification code", "Enter the Fund Transfer Password required by Binance", "password")
	} else if strings.Contains(lower, "fido") || strings.Contains(lower, "fingerprint") || strings.Contains(lower, "biometric") || strings.Contains(lower, "passkey") {
		hidden["authType"] = "FIDO2"
		add("code", "FIDO2 verification token/code", "Enter the FIDO2 token/code required by Binance", "text")
	}
	if strings.Contains(lower, "confirmpaidtype") || strings.Contains(lower, "confirm paid") || strings.Contains(lower, "paid type") {
		hidden["confirmPaidType"] = "normal"
	}
	return map[string]any{"rawCode": code, "fields": fields, "hidden": hidden, "hasSpecificRequirement": len(fields) > 0 || len(hidden) > 0}
}

func releaseRequirementsFromPayload(payload map[string]any) map[string]any {
	fields := []map[string]any{}
	hidden := map[string]any{}
	add := func(name, label, placeholder, fieldType string) {
		fields = append(fields, map[string]any{"name": name, "label": label, "placeholder": placeholder, "type": fieldType, "autocomplete": "one-time-code"})
	}
	authType := strings.ToUpper(mapString(payload, "authType"))
	if authType == "FUND_PWD" {
		hidden["authType"] = "FUND_PWD"
		add("code", "Fund password / release verification code", "Enter a fresh Fund Transfer Password", "password")
	} else if authType == "FIDO2" {
		hidden["authType"] = "FIDO2"
		add("code", "FIDO2 verification token/code", "Enter a fresh FIDO2 token/code", "text")
	}
	for _, spec := range []struct{ Key, Label, Placeholder string }{
		{"googleVerifyCode", "Google Authenticator code", "Enter a fresh Authenticator code"},
		{"mobileVerifyCode", "SMS / mobile verification code", "Enter a fresh SMS code"},
		{"emailVerifyCode", "Email verification code", "Enter a fresh email code"},
		{"yubikeyVerifyCode", "YubiKey verification code", "Enter a fresh YubiKey code"},
	} {
		if strings.TrimSpace(mapString(payload, spec.Key)) != "" {
			add(spec.Key, spec.Label, spec.Placeholder, "text")
		}
	}
	return map[string]any{"fields": fields, "hidden": hidden, "hasSpecificRequirement": len(fields) > 0 || len(hidden) > 0}
}

func genericReleaseVerificationRejected(err error) bool {
	message := strings.ToLower(friendlyBinanceError(err))
	var be *binance.Error
	code := ""
	if errors.As(err, &be) {
		code = be.Code
		message = strings.ToLower(firstNonEmpty(be.Message, message))
	}
	return code == "100001003" || strings.Contains(message, "verification failed") || strings.Contains(message, "verify failed") || strings.Contains(message, "invalid verification") || strings.Contains(message, "expired verification") || strings.Contains(message, "incorrect code") || strings.Contains(message, "wrong code")
}

func (s *Server) writeReleaseVerificationError(w http.ResponseWriter, r *http.Request, u ctxUser, o orderRecord, policy, payload map[string]any, err error) bool {
	requirements := inferReleaseRequirementsFromError(err)
	rejected := genericReleaseVerificationRejected(err)
	if !mapBool(requirements, "hasSpecificRequirement") && rejected {
		requirements = releaseRequirementsFromPayload(payload)
	}
	if !mapBool(requirements, "hasSpecificRequirement") {
		return false
	}
	message := "Binance needs extra release verification. Enter only the required value and try again."
	if rejected {
		message = "Verification failed. Enter a fresh code for the same Binance verification method and try again."
	}
	writeJSON(w, 428, envelope{
		"error": "binance_release_verification_required", "message": message,
		"verificationRequired": true, "verificationRejected": rejected,
		"releaseRequirements": requirements, "releaseVerificationPolicy": policy,
		"order": s.orderMap(r.Context(), u, o, true),
	})
	return true
}

func (s *Server) finalActionNeedsVerification(ctx context.Context, u ctxUser, o orderRecord, action string) bool {
	if o.AccountID <= 0 {
		return false
	}
	v := s.svc.GetSetting(ctx, "credential", o.AccountID, "release_verification", map[string]any{})
	m, _ := v.(map[string]any)
	return mapBool(m, "localVerificationEnabled") && (action == "release" || action == "quick_release")
}

func challengeID() string { b := make([]byte, 16); _, _ = rand.Read(b); return hex.EncodeToString(b) }
func finalActionSessionHash(r *http.Request) string {
	c, err := r.Cookie("p2pflow_session")
	if err != nil || strings.TrimSpace(c.Value) == "" {
		return ""
	}
	return hashToken(c.Value)
}
func (s *Server) consumeFinalActionVerification(ctx context.Context, r *http.Request, u ctxUser, o orderRecord, action, token string) bool {
	if !s.finalActionNeedsVerification(ctx, u, o, action) {
		return true
	}
	if strings.TrimSpace(token) == "" {
		return false
	}
	res, err := s.store.DB.ExecContext(ctx, `UPDATE final_action_challenges SET used_at=CURRENT_TIMESTAMP WHERE tenant_id=`+s.store.Bind(1)+` AND order_id=`+s.store.Bind(2)+` AND user_id=`+s.store.Bind(3)+` AND action=`+s.store.Bind(4)+` AND verification_token_hash=`+s.store.Bind(5)+` AND session_hash=`+s.store.Bind(6)+` AND verified_at IS NOT NULL AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP`, u.TenantID, o.ID, u.ID, action, hashToken(token), finalActionSessionHash(r))
	if err != nil {
		return false
	}
	n, _ := res.RowsAffected()
	return n == 1
}
func (s *Server) finalVerificationStart(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.final_action")
	if err != nil {
		replyDBError(w, err)
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	action := strings.ToLower(firstNonEmpty(mapString(in, "action"), "release"))
	if action == "release_coin" {
		action = "release"
	}
	if action != "release" && action != "quick_release" {
		writeJSON(w, 422, envelope{"error": "verification_only_for_release"})
		return
	}
	if action == "quick_release" && (!s.hasPerm(u, "orders.quick_release") || (o.AccountID > 0 && !s.accountPerm(r.Context(), u, o.AccountID, "orders.quick_release"))) {
		writeJSON(w, 403, envelope{"error": "forbidden", "permission": "orders.quick_release"})
		return
	}
	method := strings.ToUpper(firstNonEmpty(mapString(in, "method"), "USER_PASSWORD"))
	if method == "PASSWORD" {
		method = "USER_PASSWORD"
	}
	if method == "OTP" {
		method = "EMAIL_OTP"
	}
	if method != "USER_PASSWORD" && method != "SECRET_CODE" && method != "EMAIL_OTP" {
		writeJSON(w, 422, envelope{"error": "unsupported_verification_method"})
		return
	}
	id := challengeID()
	code := ""
	if method == "EMAIL_OTP" {
		b := make([]byte, 3)
		_, _ = rand.Read(b)
		code = fmt.Sprintf("%06d", (int(b[0])<<16|int(b[1])<<8|int(b[2]))%1000000)
	}
	hash := ""
	if code != "" {
		hash, _ = security.HashPassword(code)
	}
	_, err = s.store.DB.ExecContext(r.Context(), `INSERT INTO final_action_challenges(id,tenant_id,order_id,user_id,action,method,challenge_hash,attempts,verification_token_hash,session_hash,expires_at,created_at) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`,`+s.store.Bind(3)+`,`+s.store.Bind(4)+`,`+s.store.Bind(5)+`,`+s.store.Bind(6)+`,`+s.store.Bind(7)+`,0,'',`+s.store.Bind(8)+`,`+s.store.Bind(9)+`,CURRENT_TIMESTAMP)`, id, u.TenantID, o.ID, u.ID, action, method, hash, finalActionSessionHash(r), time.Now().Add(5*time.Minute))
	if err != nil {
		replyDBError(w, err)
		return
	}
	if code != "" {
		if mailErr := s.sendMail(u.Email, "P2PFlow release verification", fmt.Sprintf("Your P2PFlow release verification code is %s. It expires in 5 minutes.", code)); mailErr != nil {
			_, _ = s.store.DB.ExecContext(r.Context(), `DELETE FROM final_action_challenges WHERE id=`+s.store.Bind(1), id)
			writeJSON(w, 503, envelope{"error": "mail_delivery_failed", "message": "Release verification OTP could not be delivered. Configure SMTP or use another local verification method."})
			return
		}
	}
	writeJSON(w, 200, map[string]any{"ok": true, "challengeId": id, "action": action, "method": method, "emailMasked": func() string {
		if method == "EMAIL_OTP" {
			return maskEmail(u.Email)
		}
		return ""
	}(), "expiresInSeconds": 300, "delivery": func() string {
		if code != "" {
			return "email"
		}
		return "local"
	}()})
}
func (s *Server) finalVerificationVerify(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.final_action")
	if err != nil {
		replyDBError(w, err)
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	id := mapString(in, "challengeId")
	value := mapString(in, "value", "code")
	var method, hash, action, sessionHash string
	var attempts int
	var exp time.Time
	var verified, used sql.NullTime
	err = s.store.DB.QueryRowContext(r.Context(), `SELECT method,challenge_hash,action,attempts,session_hash,expires_at,verified_at,used_at FROM final_action_challenges WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` AND order_id=`+s.store.Bind(3)+` AND user_id=`+s.store.Bind(4), id, u.TenantID, o.ID, u.ID).Scan(&method, &hash, &action, &attempts, &sessionHash, &exp, &verified, &used)
	if err != nil || used.Valid || time.Now().After(exp) || sessionHash == "" || sessionHash != finalActionSessionHash(r) {
		writeJSON(w, 400, envelope{"error": "challenge_invalid_or_expired"})
		return
	}
	if attempts >= 5 {
		writeJSON(w, 429, envelope{"error": "verification_locked"})
		return
	}
	ok := false
	switch strings.ToUpper(method) {
	case "EMAIL_OTP":
		ok = security.CheckPassword(hash, value)
	case "USER_PASSWORD":
		var ph string
		_ = s.store.DB.QueryRowContext(r.Context(), `SELECT password_hash FROM users WHERE id=`+s.store.Bind(1), u.ID).Scan(&ph)
		ok = security.CheckPassword(ph, value)
	case "SECRET_CODE":
		var sh string
		_ = s.store.DB.QueryRowContext(r.Context(), `SELECT secret_code_hash FROM user_security WHERE user_id=`+s.store.Bind(1), u.ID).Scan(&sh)
		ok = sh != "" && security.CheckPassword(sh, value)
	}
	attempts++
	if !ok {
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE final_action_challenges SET attempts=`+s.store.Bind(1)+` WHERE id=`+s.store.Bind(2), attempts, id)
		writeJSON(w, 401, envelope{"error": "verification_failed", "attemptsRemaining": maxInt(0, 5-attempts)})
		return
	}
	token := challengeID() + challengeID()
	_, err = s.store.DB.ExecContext(r.Context(), `UPDATE final_action_challenges SET attempts=`+s.store.Bind(1)+`,verified_at=CURRENT_TIMESTAMP,verification_token_hash=`+s.store.Bind(2)+` WHERE id=`+s.store.Bind(3)+` AND used_at IS NULL`, attempts, hashToken(token), id)
	if err != nil {
		replyDBError(w, err)
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "final_action_local_verification_passed", "order", asString(o.ID), r, map[string]any{"action": action, "method": method})
	writeJSON(w, 200, map[string]any{"ok": true, "verified": true, "challengeId": id, "action": action, "method": method, "token": token, "verificationToken": token, "localVerificationToken": token, "expiresInSeconds": int(time.Until(exp).Seconds())})
}

func (s *Server) orderAssign(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.assign")
	if err != nil {
		replyDBError(w, err)
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	agent := mapInt64(in, "agentId", "userId")
	if agent <= 0 {
		writeJSON(w, 422, envelope{"error": "agentId required"})
		return
	}
	var tenant, status string
	_ = tenant
	err = s.store.DB.QueryRowContext(r.Context(), `SELECT CAST(tenant_id AS CHAR),status FROM users WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), agent, u.TenantID).Scan(&tenant, &status)
	if s.store.Driver == "postgres" {
		var tid int64
		err = s.store.DB.QueryRowContext(r.Context(), `SELECT tenant_id,status FROM users WHERE id=$1 AND tenant_id=$2`, agent, u.TenantID).Scan(&tid, &status)
	}
	if err != nil || status != "active" {
		writeJSON(w, 404, envelope{"error": "agent_not_found"})
		return
	}
	candidate := ctxUser{ID: agent, TenantID: u.TenantID}
	candidate.Permissions = s.permissionCodes(r.Context(), candidate)
	if o.AccountID > 0 && !s.accountPerm(r.Context(), candidate, o.AccountID, "orders.view") {
		writeJSON(w, 422, envelope{"error": "agent_has_no_account_permission"})
		return
	}
	if mapBool(in, "forceLeaveCurrent") {
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE order_assignments SET status='left',leave_reason='manager_force_reassign',updated_at=CURRENT_TIMESTAMP WHERE order_id=`+s.store.Bind(1)+` AND status='assigned'`, o.ID)
	}
	_, err = s.store.DB.ExecContext(r.Context(), `UPDATE orders SET assigned_user_id=`+s.store.Bind(1)+`,status=CASE WHEN status IN ('unpaid','paid','appeal') THEN status ELSE 'assigned' END,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2), agent, o.ID)
	if err != nil {
		replyDBError(w, err)
		return
	}
	s.createAssignment(r.Context(), u.TenantID, o.ID, agent, firstNonEmpty(mapString(in, "role"), "lead"), func() float64 {
		v := mapFloat(in, "assignedAmount")
		if v == 0 {
			return o.Total
		}
		return v
	}(), u.ID)
	s.svc.Notify(r.Context(), u.TenantID, agent, "order_assigned", "Order assigned", o.ExternalNo, map[string]any{"orderId": o.ID})
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "order_assigned", "order", asString(o.ID), r, map[string]any{"agentId": agent})
	o, _ = s.getOrder(r.Context(), u, o.ID, "orders.view")
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}

func (s *Server) orderLeave(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.manage")
	if err != nil {
		replyDBError(w, err)
		return
	}
	if o.AssignedUserID != u.ID && !s.hasPerm(u, "orders.assign") {
		writeJSON(w, 403, envelope{"error": "not_assigned"})
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE order_assignments SET status='left',leave_reason=`+s.store.Bind(1)+`,leave_note=`+s.store.Bind(2)+`,updated_at=CURRENT_TIMESTAMP WHERE order_id=`+s.store.Bind(3)+` AND user_id=`+s.store.Bind(4)+` AND status='assigned'`, mapString(in, "reason"), mapString(in, "note"), o.ID, u.ID)
	next := s.pickAgent(r.Context(), u, o.AccountID, o.PaymentMethodID, u.ID)
	newStatus := "manager_queue"
	if next > 0 {
		newStatus = "assigned"
		s.createAssignment(r.Context(), u.TenantID, o.ID, next, "lead", o.Total, u.ID)
		s.svc.Notify(r.Context(), u.TenantID, next, "order_assigned", "Order reassigned", o.ExternalNo, map[string]any{"orderId": o.ID})
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE orders SET assigned_user_id=`+s.store.Bind(1)+`,status=CASE WHEN status IN ('unpaid','paid','appeal') THEN status ELSE `+s.store.Bind(2)+` END,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3), sqlNullInt64(next), newStatus, o.ID)
	o, _ = s.getOrder(r.Context(), u, o.ID, "orders.view")
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}

func (s *Server) orderRequestCoagent(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.split")
	if err != nil {
		replyDBError(w, err)
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	amount := mapFloat(in, "requiredAmount")
	if amount == 0 {
		amount = o.Total
	}
	next := s.pickAgent(r.Context(), u, o.AccountID, o.PaymentMethodID, o.AssignedUserID)
	status := "pending"
	if next > 0 {
		status = "assigned"
	}
	pg := `INSERT INTO coagent_requests(tenant_id,order_id,requested_by,required_amount,reason,status,assigned_user_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`
	my := `INSERT INTO coagent_requests(tenant_id,order_id,requested_by,required_amount,reason,status,assigned_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
	id, err := s.insertID(r.Context(), pg, my, u.TenantID, o.ID, u.ID, amount, mapString(in, "reason"), status, sqlNullInt64(next))
	if err != nil {
		replyDBError(w, err)
		return
	}
	if next > 0 {
		s.createAssignment(r.Context(), u.TenantID, o.ID, next, "co_agent", amount, u.ID)
		s.svc.Notify(r.Context(), u.TenantID, next, "coagent_assigned", "Co-agent assistance requested", o.ExternalNo, map[string]any{"orderId": o.ID, "requestId": id, "amount": amount})
	}
	o, _ = s.getOrder(r.Context(), u, o.ID, "orders.view")
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}
func (s *Server) orderHeartbeat(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.view")
	if err != nil {
		replyDBError(w, err)
		return
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE users SET last_seen_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), u.ID)
	writeJSON(w, 200, map[string]any{"ok": true, "orderId": o.ID, "at": time.Now().UTC()})
}

func (s *Server) orderSplits(ctx context.Context, u ctxUser, orderID int64) []map[string]any {
	var tradeType string
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COALESCE(trade_type,'') FROM orders WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), orderID, u.TenantID).Scan(&tradeType)
	defaultDirection := "receive"
	if strings.EqualFold(tradeType, "BUY") {
		defaultDirection = "send"
	}
	rows, err := s.store.DB.QueryContext(ctx, `SELECT s.id,s.payment_account_id,COALESCE(p.name,''),COALESCE(p.account_number,''),s.assigned_user_id,COALESCE(u.name,''),s.amount,s.commission,s.reference,s.status,s.metadata_json,s.created_at,s.updated_at FROM payment_splits s LEFT JOIN payment_accounts p ON p.id=s.payment_account_id LEFT JOIN users u ON u.id=s.assigned_user_id WHERE s.tenant_id=`+s.store.Bind(1)+` AND s.order_id=`+s.store.Bind(2)+` ORDER BY s.id`, u.TenantID, orderID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []map[string]any{}
	canEdit := s.hasPerm(u, "orders.split")
	for rows.Next() {
		var id, pa, uid int64
		var pn, pan, un, ref, st, raw string
		var amt, com float64
		var ca, ua time.Time
		if rows.Scan(&id, &pa, &pn, &pan, &uid, &un, &amt, &com, &ref, &st, &raw, &ca, &ua) != nil {
			continue
		}
		meta := jsonMap(raw)
		direction := strings.ToLower(firstNonEmpty(mapString(meta, "direction"), defaultDirection))
		proofID := mapInt64(meta, "proofId")
		proofURL := ""
		if proofID > 0 {
			proofURL = fmt.Sprintf("/api/proofs/%d", proofID)
		}
		note := mapString(meta, "note")
		transactionRef := firstNonEmpty(mapString(meta, "transactionReference", "transactionId"), ref)
		out = append(out, map[string]any{
			"id": id, "orderId": orderID,
			"paymentAccountId": func() any {
				if pa > 0 {
					return pa
				}
				return nil
			}(),
			"account": func() any {
				if pa <= 0 {
					return nil
				}
				return map[string]any{"id": pa, "name": pn, "accountNumber": pan}
			}(),
			"agentId": func() any {
				if uid > 0 {
					return uid
				}
				return nil
			}(),
			"assignedUserId": func() any {
				if uid > 0 {
					return uid
				}
				return nil
			}(),
			"agent": func() any {
				if uid <= 0 {
					return nil
				}
				return map[string]any{"id": uid, "name": un}
			}(),
			"direction": direction,
			"amount":    amt, "plannedAmount": amt, "actualAmount": amt,
			"commission": com, "actualCharge": com, "transactionChargeAmount": com,
			"transactionChargeMode": func() string {
				if mapBool(meta, "manualCharge") {
					return "manual"
				}
				return "stored"
			}(),
			"transactionChargeSource": firstNonEmpty(mapString(meta, "transactionChargeSource"), "stored"),
			"transactionReference":    transactionRef, "reference": transactionRef,
			"note": note, "status": st, "metadata": meta,
			"proofId": proofID, "proofUrl": proofURL, "hasProof": proofID > 0,
			"viewerCanEdit": canEdit, "viewerCanDelete": canEdit,
			"createdAt": ca, "updatedAt": ua,
		})
	}
	return out
}
func (s *Server) orderAssignments(ctx context.Context, orderID int64) []map[string]any {
	rows, err := s.store.DB.QueryContext(ctx, `SELECT a.id,a.user_id,COALESCE(u.name,''),a.role,a.assigned_amount,a.actual_amount,a.direction,a.status,a.leave_reason,a.leave_note,a.created_at,a.updated_at FROM order_assignments a LEFT JOIN users u ON u.id=a.user_id WHERE a.order_id=`+s.store.Bind(1)+` ORDER BY a.id`, orderID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, uid int64
		var name, role, dir, st, reason, note string
		var aa, act float64
		var ca, ua time.Time
		if rows.Scan(&id, &uid, &name, &role, &aa, &act, &dir, &st, &reason, &note, &ca, &ua) == nil {
			out = append(out, map[string]any{"id": id, "agentId": uid, "userId": uid, "agent": map[string]any{"id": uid, "name": name}, "role": role, "assignedAmount": aa, "actualAmount": act, "direction": dir, "status": st, "leaveReason": reason, "leaveNote": note, "createdAt": ca, "updatedAt": ua})
		}
	}
	return out
}
func (s *Server) coagentRequests(ctx context.Context, orderID int64) []map[string]any {
	rows, err := s.store.DB.QueryContext(ctx, `SELECT id,requested_by,required_amount,reason,status,COALESCE(assigned_user_id,0),created_at,updated_at FROM coagent_requests WHERE order_id=`+s.store.Bind(1)+` ORDER BY id DESC`, orderID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, req, as int64
		var amt float64
		var reason, st string
		var ca, ua time.Time
		if rows.Scan(&id, &req, &amt, &reason, &st, &as, &ca, &ua) == nil {
			out = append(out, map[string]any{"id": id, "requestedByAgentId": req, "requiredAmount": amt, "reason": reason, "status": st, "assignedAgentId": as, "createdAt": ca, "updatedAt": ua})
		}
	}
	return out
}
func (s *Server) orderChats(ctx context.Context, orderID int64, limit int) []map[string]any {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.store.DB.QueryContext(ctx, `SELECT id,message_type,content,image_url,sender_name,is_self,status,external_message_id,external_uuid,sent_at FROM chats WHERE order_id=`+s.store.Bind(1)+` ORDER BY id DESC LIMIT `+fmt.Sprint(limit), orderID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id int64
		var typ, content, img, sender, st, mid, uuid string
		var self bool
		var sent time.Time
		if rows.Scan(&id, &typ, &content, &img, &sender, &self, &st, &mid, &uuid, &sent) == nil {
			out = append(out, map[string]any{"id": id, "type": typ, "messageType": typ, "content": content, "message": content, "imageUrl": img, "senderName": sender, "self": self, "isSelf": self, "status": st, "binanceMessageId": firstNonEmpty(uuid, mid), "sentAt": sent, "createdAt": sent})
		}
	}
	sort.Slice(out, func(i, j int) bool { return asInt64(out[i]["id"]) < asInt64(out[j]["id"]) })
	return out
}

func (s *Server) orderSplitCreate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.split")
	if err != nil {
		replyDBError(w, err)
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	if err := s.createSplit(r.Context(), u, o, in); err != nil {
		writeJSON(w, 422, envelope{"error": "split_invalid", "message": err.Error()})
		return
	}
	o, _ = s.getOrder(r.Context(), u, o.ID, "orders.view")
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}
func (s *Server) createSplit(ctx context.Context, u ctxUser, o orderRecord, in map[string]any) error {
	amount := mapFloat(in, "amount", "actualAmount")
	if amount <= 0 {
		return fmt.Errorf("positive amount required")
	}
	pa := mapInt64(in, "paymentAccountId")
	uid := mapInt64(in, "agentId", "assignedUserId")
	if uid == 0 {
		uid = u.ID
	}
	if pa > 0 {
		var n int
		_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM payment_accounts WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), pa, u.TenantID).Scan(&n)
		if n == 0 {
			return fmt.Errorf("payment account not found")
		}
		if !u.IsOwner && !u.IsSuperAdmin && u.Role == "agent" {
			var owner sql.NullInt64
			_ = s.store.DB.QueryRowContext(ctx, `SELECT user_id FROM payment_accounts WHERE id=`+s.store.Bind(1), pa).Scan(&owner)
			if owner.Valid && owner.Int64 != u.ID && !s.hasPerm(u, "accounts.manage") {
				return fmt.Errorf("payment account not accessible")
			}
		}
	}
	direction := strings.ToLower(mapString(in, "direction"))
	if direction != "send" && direction != "receive" {
		direction = "receive"
		if strings.EqualFold(o.TradeType, "BUY") {
			direction = "send"
		}
	}
	meta := map[string]any{"direction": direction}
	for _, k := range []string{"note", "proofId", "transactionReference", "transactionId", "transactionChargeSource"} {
		if v, ok := in[k]; ok {
			meta[k] = v
		}
	}
	commission := mapFloat(in, "actualCharge", "commission")
	if _, ok := in["actualCharge"]; ok {
		meta["manualCharge"] = true
		meta["transactionChargeSource"] = "manual_actual"
	}
	reference := firstNonEmpty(mapString(in, "transactionReference", "reference"), "")
	status := firstNonEmpty(mapString(in, "status"), "completed")
	pg := `INSERT INTO payment_splits(tenant_id,order_id,payment_account_id,assigned_user_id,amount,commission,reference,status,metadata_json,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`
	my := `INSERT INTO payment_splits(tenant_id,order_id,payment_account_id,assigned_user_id,amount,commission,reference,status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
	id, err := s.insertID(ctx, pg, my, u.TenantID, o.ID, sqlNullInt64(pa), sqlNullInt64(uid), amount, commission, reference, status, rawJSON(meta))
	if err != nil {
		return err
	}
	if dataURL := strings.TrimSpace(mapString(in, "screenshotDataUrl")); dataURL != "" {
		proofID, proofErr := s.saveProofDataURL(ctx, u, o.ID, dataURL, "payment-split-proof")
		if proofErr != nil {
			_, _ = s.store.DB.ExecContext(ctx, `DELETE FROM payment_splits WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), id, u.TenantID)
			return proofErr
		}
		meta["proofId"] = proofID
		_, err = s.store.DB.ExecContext(ctx, `UPDATE payment_splits SET metadata_json=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2)+` AND tenant_id=`+s.store.Bind(3), rawJSON(meta), id, u.TenantID)
	}
	return err
}
func (s *Server) orderSplitBatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.split")
	if err != nil {
		replyDBError(w, err)
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	vals := extractSlice(firstMapValue(in, "splits", "items"))
	if len(vals) == 0 {
		if arr, ok := in["splits"].([]any); ok {
			vals = arr
		}
	}
	sharedProofID := int64(0)
	if dataURL := strings.TrimSpace(mapString(in, "screenshotDataUrl")); dataURL != "" {
		sharedProofID, err = s.saveProofDataURL(r.Context(), u, o.ID, dataURL, "payment-split-batch-proof")
		if err != nil {
			writeJSON(w, 422, envelope{"error": "proof_invalid", "message": err.Error()})
			return
		}
	}
	for _, v := range vals {
		m, ok := v.(map[string]any)
		if !ok {
			continue
		}
		item := mergeMaps(map[string]any{}, m)
		for _, k := range []string{"direction", "transactionReference", "transactionId", "note"} {
			if _, exists := item[k]; !exists {
				if value, ok := in[k]; ok {
					item[k] = value
				}
			}
		}
		if sharedProofID > 0 {
			item["proofId"] = sharedProofID
		}
		if err := s.createSplit(r.Context(), u, o, item); err != nil {
			writeJSON(w, 422, envelope{"error": "split_invalid", "message": err.Error()})
			return
		}
	}
	o, _ = s.getOrder(r.Context(), u, o.ID, "orders.view")
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}
func (s *Server) orderSplitPatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	var orderID, tenant int64
	var rawMeta string
	var currentCommission float64
	err := s.store.DB.QueryRowContext(r.Context(), `SELECT order_id,tenant_id,metadata_json,commission FROM payment_splits WHERE id=`+s.store.Bind(1), id).Scan(&orderID, &tenant, &rawMeta, &currentCommission)
	if err != nil || tenant != u.TenantID {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	o, err := s.getOrder(r.Context(), u, orderID, "orders.split")
	if err != nil {
		replyDBError(w, err)
		return
	}
	meta := jsonMap(rawMeta)
	for _, k := range []string{"note", "proofId", "transactionReference", "transactionId", "direction", "transactionChargeSource"} {
		if value, ok := in[k]; ok {
			meta[k] = value
		}
	}
	if dataURL := strings.TrimSpace(mapString(in, "screenshotDataUrl")); dataURL != "" {
		proofID, proofErr := s.saveProofDataURL(r.Context(), u, orderID, dataURL, "payment-split-proof")
		if proofErr != nil {
			writeJSON(w, 422, envelope{"error": "proof_invalid", "message": proofErr.Error()})
			return
		}
		meta["proofId"] = proofID
	}
	commission := currentCommission
	if _, ok := in["actualCharge"]; ok {
		commission = mapFloat(in, "actualCharge")
		meta["manualCharge"] = true
		meta["transactionChargeSource"] = "manual_actual"
	} else if _, ok := in["commission"]; ok {
		commission = mapFloat(in, "commission")
	}
	_, err = s.store.DB.ExecContext(r.Context(), `UPDATE payment_splits SET payment_account_id=COALESCE(`+s.store.Bind(1)+`,payment_account_id),assigned_user_id=COALESCE(`+s.store.Bind(2)+`,assigned_user_id),amount=CASE WHEN `+s.store.Bind(3)+`>0 THEN `+s.store.Bind(3)+` ELSE amount END,commission=`+s.store.Bind(4)+`,reference=CASE WHEN `+s.store.Bind(5)+`<>'' THEN `+s.store.Bind(5)+` ELSE reference END,status=CASE WHEN `+s.store.Bind(6)+`<>'' THEN `+s.store.Bind(6)+` ELSE status END,metadata_json=`+s.store.Bind(7)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(8), sqlNullInt64(mapInt64(in, "paymentAccountId")), sqlNullInt64(mapInt64(in, "agentId", "assignedUserId")), mapFloat(in, "amount", "actualAmount"), commission, mapString(in, "transactionReference", "reference"), mapString(in, "status"), rawJSON(meta), id)
	if err != nil {
		replyDBError(w, err)
		return
	}
	o, _ = s.getOrder(r.Context(), u, orderID, "orders.view")
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}
func (s *Server) orderSplitDelete(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	var oid, tenant int64
	if s.store.DB.QueryRowContext(r.Context(), `SELECT order_id,tenant_id FROM payment_splits WHERE id=`+s.store.Bind(1), id).Scan(&oid, &tenant) != nil || tenant != u.TenantID {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	if _, err := s.getOrder(r.Context(), u, oid, "orders.split"); err != nil {
		replyDBError(w, err)
		return
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `DELETE FROM payment_splits WHERE id=`+s.store.Bind(1), id)
	o, _ := s.getOrder(r.Context(), u, oid, "orders.view")
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}
func (s *Server) orderCompleteAgentTask(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.manage")
	if err != nil {
		replyDBError(w, err)
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	uid := mapInt64(in, "agentId")
	if uid == 0 {
		uid = u.ID
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE order_assignments SET status='completed',actual_amount=CASE WHEN `+s.store.Bind(1)+`>0 THEN `+s.store.Bind(1)+` ELSE actual_amount END,updated_at=CURRENT_TIMESTAMP WHERE order_id=`+s.store.Bind(2)+` AND user_id=`+s.store.Bind(3), mapFloat(in, "actualAmount"), o.ID, uid)
	o, _ = s.getOrder(r.Context(), u, o.ID, "orders.view")
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}
func (s *Server) orderManualFeedback(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.manage")
	if err != nil {
		replyDBError(w, err)
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	raw := jsonMap(o.Raw)
	raw["manualCounterpartyFeedback"] = in
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE orders SET raw_json=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2), rawJSON(raw), o.ID)
	o, _ = s.getOrder(r.Context(), u, o.ID, "orders.view")
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}
