package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"p2pflow/v2/internal/events"
)

const extensionTaskLease = 2 * time.Minute
const extensionDirectLease = 8 * time.Second

func (s *Server) registerExtensionRoutes() {
	s.mux.HandleFunc("GET /api/p2p-extension/admin", s.requirePerm("extension.manage", s.extensionAdmin))
	s.mux.HandleFunc("GET /api/p2p-extension/admin/list", s.requirePerm("extension.manage", s.extensionAdminList))
	s.mux.HandleFunc("POST /api/p2p-extension/admin/retry-task", s.requirePerm("extension.manage", s.extensionRetry))
	s.mux.HandleFunc("POST /api/p2p-extension/admin/delete-task", s.requirePerm("extension.manage", s.extensionDeleteTask))
	s.mux.HandleFunc("POST /api/p2p-extension/admin/delete-cache", s.requirePerm("extension.manage", s.extensionDeleteCache))
	s.mux.HandleFunc("GET /api/p2p-extension/task", s.extensionTaskClaim)
	s.mux.HandleFunc("GET /api/p2p-extension/status", s.extensionStatus)
	s.mux.HandleFunc("POST /api/p2p-extension/result", s.extensionResult)
	s.mux.HandleFunc("POST /api/orders/{id}/p2p-extension-collect", s.requirePerm("orders.view", s.extensionCollectOrder))
}

func (s *Server) extensionSettings(r *http.Request, tid int64) map[string]any {
	d := map[string]any{
		"enabled":                     true,
		"pollSeconds":                 s.cfg.ExtensionPollSeconds,
		"advertiserDetailUrlTemplate": "https://c2c.binance.com/en/advertiserDetail?advertiserNo={userNo}",
		"cacheHours":                  int64(24),
	}
	v := s.svc.GetSetting(r.Context(), "tenant", tid, "p2p_extension", d)
	if m, ok := v.(map[string]any); ok {
		return mergeMaps(d, m)
	}
	return d
}

func (s *Server) extensionMasterKey() string {
	if strings.TrimSpace(s.cfg.ExtensionToken) != "" {
		return s.cfg.ExtensionToken
	}
	return s.cfg.AppSecret
}

func (s *Server) extensionTenantToken(tid int64) string {
	if tid <= 0 || s.extensionMasterKey() == "" {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(s.extensionMasterKey()))
	_, _ = mac.Write([]byte("p2pflow-extension-tenant:" + strconv.FormatInt(tid, 10)))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("p2pv2.%d.%s", tid, sig)
}

func extensionRequestToken(r *http.Request) string {
	token := strings.TrimSpace(r.Header.Get("X-P2P-Extension-Token"))
	if token == "" {
		token = strings.TrimSpace(requestString(r, "token"))
	}
	return token
}

func (s *Server) extensionTenantFromRequest(r *http.Request) (int64, bool) {
	token := extensionRequestToken(r)
	parts := strings.Split(token, ".")
	if len(parts) != 3 || parts[0] != "p2pv2" {
		return 0, false
	}
	tid, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || tid <= 0 {
		return 0, false
	}
	expected := s.extensionTenantToken(tid)
	if expected == "" || !hmac.Equal([]byte(token), []byte(expected)) {
		return 0, false
	}
	return tid, true
}

func tokenHash(value string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(value)))
	return hex.EncodeToString(sum[:])
}

func (s *Server) extensionAdmin(w http.ResponseWriter, r *http.Request, u ctxUser) {
	cfg := s.extensionSettings(r, u.TenantID)
	writeJSON(w, 200, map[string]any{
		"ok": true, "serverUrlHint": firstNonEmpty(s.cfg.PublicBaseURL, requestOrigin(r)),
		"token": s.extensionTenantToken(u.TenantID), "tokenScope": "tenant", "tenantId": u.TenantID,
		"enabled": mapBool(cfg, "enabled"), "pollSeconds": mapInt64(cfg, "pollSeconds"),
		"advertiserDetailUrlTemplate": mapString(cfg, "advertiserDetailUrlTemplate"),
	})
}

func (s *Server) extensionAdminList(w http.ResponseWriter, r *http.Request, u ctxUser) {
	cfg := s.extensionSettings(r, u.TenantID)
	tasks := []map[string]any{}
	rows, _ := s.store.DB.QueryContext(r.Context(), `SELECT id,task_type,payload_json,status,attempt_count,result_json,last_error,claimed_at,lease_expires_at,completed_at,created_at,updated_at FROM extension_tasks WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY id DESC LIMIT 500`, u.TenantID)
	if rows != nil {
		for rows.Next() {
			var id int64
			var typ, raw, status, result, lastErr string
			var attempts int
			var claimed, lease, completed sql.NullTime
			var ca, ua time.Time
			if rows.Scan(&id, &typ, &raw, &status, &attempts, &result, &lastErr, &claimed, &lease, &completed, &ca, &ua) == nil {
				p := jsonMap(raw)
				rr := jsonMap(result)
				tasks = append(tasks, map[string]any{
					"id": id, "taskType": typ, "status": status, "attempts": attempts,
					"userNo": mapString(p, "userNo"), "counterpartyName": mapString(p, "counterpartyName"),
					"orderId": mapInt64(p, "orderId"), "orderNo": mapString(p, "orderNo"),
					"lastError": firstNonEmpty(lastErr, mapString(rr, "error", "lastError")),
					"claimedAt": nullTime(claimed), "leaseExpiresAt": nullTime(lease), "completedAt": nullTime(completed),
					"createdAt": ca, "updatedAt": ua,
				})
			}
		}
		rows.Close()
	}
	cache := []map[string]any{}
	cr, _ := s.store.DB.QueryContext(r.Context(), `SELECT id,cache_key,payload_json,expires_at,updated_at FROM extension_cache WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY updated_at DESC LIMIT 1000`, u.TenantID)
	if cr != nil {
		for cr.Next() {
			var id int64
			var key, raw string
			var exp sql.NullTime
			var ua time.Time
			if cr.Scan(&id, &key, &raw, &exp, &ua) == nil {
				data := jsonMap(raw)
				cache = append(cache, map[string]any{
					"id": id, "userNo": firstNonEmpty(mapString(data, "userNo"), strings.TrimPrefix(key, "user:")),
					"advertiserName": mapString(data, "advertiserName", "nickname", "counterpartyName"),
					"allTrades":      firstMapValue(data, "allTrades", "totalTradeCount"), "buyTrades": firstMapValue(data, "buyTrades", "completedBuyOrderNum"), "sellTrades": firstMapValue(data, "sellTrades", "completedSellOrderNum"),
					"followersCount": firstMapValue(data, "followersCount", "followers"), "followingCount": firstMapValue(data, "followingCount", "following"), "adsCount": firstMapValue(data, "adsCount", "adCount"),
					"positiveFeedback": firstMapValue(data, "positiveFeedback"), "negativeFeedback": firstMapValue(data, "negativeFeedback"), "feedbackReviews": firstMapValue(data, "feedbackTotalCount", "feedbackReviews"),
					"feedbackRows": len(extractSlice(data["feedbackComments"])), "warnings": firstMapValue(data, "warnings"), "collectedAt": firstMapValue(data, "collectedAt"),
					"expiresAt": nullTime(exp), "updatedAt": ua,
				})
			}
		}
		cr.Close()
	}
	writeJSON(w, 200, map[string]any{
		"ok": true, "serverUrlHint": firstNonEmpty(s.cfg.PublicBaseURL, requestOrigin(r)),
		"token": s.extensionTenantToken(u.TenantID), "tokenScope": "tenant", "tenantId": u.TenantID,
		"enabled": mapBool(cfg, "enabled"), "pollSeconds": mapInt64(cfg, "pollSeconds"),
		"advertiserDetailUrlTemplate": mapString(cfg, "advertiserDetailUrlTemplate"), "tasks": tasks, "cache": cache,
	})
}

func (s *Server) extensionRetry(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	id := mapInt64(in, "id")
	res, _ := s.store.DB.ExecContext(r.Context(), `UPDATE extension_tasks SET status='pending',attempt_count=0,result_json=`+s.store.Bind(1)+`,claim_token_hash='',claimed_at=NULL,lease_expires_at=NULL,completed_at=NULL,last_error='',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2)+` AND tenant_id=`+s.store.Bind(3), `{}`, id, u.TenantID)
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, 404, envelope{"error": "Task not found"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "retried": true})
}

func (s *Server) extensionDeleteTask(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	var res sql.Result
	if mapBool(in, "all") {
		res, _ = s.store.DB.ExecContext(r.Context(), `DELETE FROM extension_tasks WHERE tenant_id=`+s.store.Bind(1), u.TenantID)
	} else {
		res, _ = s.store.DB.ExecContext(r.Context(), `DELETE FROM extension_tasks WHERE tenant_id=`+s.store.Bind(1)+` AND id=`+s.store.Bind(2), u.TenantID, mapInt64(in, "id"))
	}
	n, _ := res.RowsAffected()
	writeJSON(w, 200, map[string]any{"ok": true, "deleted": n})
}

func (s *Server) extensionDeleteCache(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	var res sql.Result
	if mapBool(in, "all") {
		res, _ = s.store.DB.ExecContext(r.Context(), `DELETE FROM extension_cache WHERE tenant_id=`+s.store.Bind(1), u.TenantID)
	} else {
		res, _ = s.store.DB.ExecContext(r.Context(), `DELETE FROM extension_cache WHERE tenant_id=`+s.store.Bind(1)+` AND id=`+s.store.Bind(2), u.TenantID, mapInt64(in, "id"))
	}
	n, _ := res.RowsAffected()
	writeJSON(w, 200, map[string]any{"ok": true, "deleted": n})
}

func (s *Server) extensionTaskClaim(w http.ResponseWriter, r *http.Request) {
	tid, ok := s.extensionTenantFromRequest(r)
	if !ok {
		writeJSON(w, 401, envelope{"ok": false, "error": "Invalid tenant-scoped extension token"})
		return
	}
	cfg := s.extensionSettings(r, tid)
	if !mapBool(cfg, "enabled") {
		writeJSON(w, 200, map[string]any{"ok": true, "enabled": false, "pollSeconds": mapInt64(cfg, "pollSeconds"), "task": nil})
		return
	}
	// A browser/extension crash must not leave work permanently claimed.
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE extension_tasks SET status='pending',claim_token_hash='',claimed_at=NULL,lease_expires_at=NULL,last_error='claim lease expired',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=`+s.store.Bind(1)+` AND status='claimed' AND lease_expires_at IS NOT NULL AND lease_expires_at<CURRENT_TIMESTAMP`, tid)

	tx, e := s.store.DB.BeginTx(r.Context(), nil)
	if e != nil {
		replyDBError(w, e)
		return
	}
	defer tx.Rollback()
	q := `SELECT id,payload_json FROM extension_tasks WHERE tenant_id=` + s.store.Bind(1) + ` AND attempt_count<5 AND (status='pending' OR (status='direct_pending' AND lease_expires_at<CURRENT_TIMESTAMP)) ORDER BY id LIMIT 1`
	if s.store.Driver == "postgres" {
		q += ` FOR UPDATE SKIP LOCKED`
	} else {
		q += ` FOR UPDATE`
	}
	var id int64
	var raw string
	if e = tx.QueryRowContext(r.Context(), q, tid).Scan(&id, &raw); e == sql.ErrNoRows {
		writeJSON(w, 200, map[string]any{"ok": true, "enabled": true, "pollSeconds": mapInt64(cfg, "pollSeconds"), "task": nil})
		return
	} else if e != nil {
		replyDBError(w, e)
		return
	}
	p := jsonMap(raw)
	resultToken := randomID("ext")
	leaseUntil := time.Now().UTC().Add(extensionTaskLease)
	_, e = tx.ExecContext(r.Context(), `UPDATE extension_tasks SET status='claimed',attempt_count=attempt_count+1,claim_token_hash=`+s.store.Bind(1)+`,claimed_at=CURRENT_TIMESTAMP,lease_expires_at=`+s.store.Bind(2)+`,last_error='',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3)+` AND tenant_id=`+s.store.Bind(4), tokenHash(resultToken), leaseUntil, id, tid)
	if e != nil {
		replyDBError(w, e)
		return
	}
	if e = tx.Commit(); e != nil {
		replyDBError(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "enabled": true, "pollSeconds": mapInt64(cfg, "pollSeconds"), "task": map[string]any{
		"id": id, "orderId": mapInt64(p, "orderId"), "orderNo": mapString(p, "orderNo"), "userNo": mapString(p, "userNo"),
		"counterpartyName": mapString(p, "counterpartyName"), "advertiserUrl": mapString(p, "advertiserUrl"), "resultToken": resultToken, "tenantId": tid,
	}})
}

func (s *Server) extensionStatus(w http.ResponseWriter, r *http.Request) {
	tid, ok := s.extensionTenantFromRequest(r)
	if !ok {
		writeJSON(w, 401, envelope{"ok": false, "error": "Invalid tenant-scoped extension token"})
		return
	}
	var pending, claimed, failed, cache int64
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM extension_tasks WHERE tenant_id=`+s.store.Bind(1)+` AND status IN ('pending','direct_pending')`, tid).Scan(&pending)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM extension_tasks WHERE tenant_id=`+s.store.Bind(1)+` AND status IN ('claimed','running')`, tid).Scan(&claimed)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM extension_tasks WHERE tenant_id=`+s.store.Bind(1)+` AND status='failed'`, tid).Scan(&failed)
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM extension_cache WHERE tenant_id=`+s.store.Bind(1), tid).Scan(&cache)
	cfg := s.extensionSettings(r, tid)
	writeJSON(w, 200, map[string]any{"ok": true, "tenantId": tid, "pending": pending, "claimed": claimed, "failed": failed, "cacheItems": cache, "pollSeconds": mapInt64(cfg, "pollSeconds")})
}

func extensionCollectorFlat(data, task map[string]any, userNo string) map[string]any {
	profile := mapFromAny(data["profile"])
	trade := mapFromAny(profile["tradeInfo"])
	visible := mapFromAny(profile["visibleTradeStats"])
	feedbackSummary := mapFromAny(profile["feedbackSummary"])
	feedback := mapFromAny(data["feedback"])
	positiveRows := extractSlice(feedback["positiveFirstPage"])
	negativeRows := extractSlice(feedback["negativeFirstPage"])
	comments := make([]any, 0, len(positiveRows)+len(negativeRows))
	appendRows := func(rows []any, fallback string) {
		for _, row := range rows {
			m := mapFromAny(row)
			comments = append(comments, map[string]any{
				"type": firstNonEmpty(mapString(m, "sentiment"), fallback), "by": firstNonEmpty(mapString(m, "reviewer"), "P2P user"),
				"text": mapString(m, "comment"), "date": firstNonEmpty(mapString(m, "date"), mapString(m, "postedOn")),
				"paymentMethod": mapString(m, "paymentMethod"), "lowVolume": mapBool(m, "lowVolume"), "rawText": mapString(m, "rawText"),
			})
		}
	}
	appendRows(negativeRows, "negative")
	appendRows(positiveRows, "positive")
	flat := map[string]any{
		"userNo": userNo, "nickname": firstNonEmpty(mapString(profile, "name"), mapString(task, "counterpartyName")), "advertiserName": firstNonEmpty(mapString(profile, "name"), mapString(task, "counterpartyName")),
		"allTrades": firstMapValue(trade, "allTrades", "totalTradeCount", "completedOrderNum"), "buyTrades": firstMapValue(trade, "buyTrades", "completedBuyOrderNum"), "sellTrades": firstMapValue(trade, "sellTrades", "completedSellOrderNum"),
		"thirtyDayTradeCount": firstMapValue(trade, "trades30d"), "thirtyDayCompletionRate": firstMapValue(trade, "completionRate30d"),
		"avgReleaseTimeMinutes30d": firstMapValue(trade, "avgReleaseTime"), "avgPayTimeMinutes30d": firstMapValue(trade, "avgPayTime"),
		"firstTradeDays": firstMapValue(trade, "firstTrade"), "tradingCounterparties": firstMapValue(trade, "counterparties"),
		"followersCount": firstMapValue(profile, "followersCount"), "followingCount": firstMapValue(profile, "followingCount"), "adsCount": firstMapValue(profile, "adsCount"),
		"verified": firstMapValue(profile, "verified"), "online": strings.EqualFold(mapString(profile, "status"), "online"), "joinedOn": firstMapValue(profile, "joinedOn"),
		"positiveFeedback": firstMapValue(feedbackSummary, "positive"), "negativeFeedback": firstMapValue(feedbackSummary, "negative"), "feedbackTotalCount": firstMapValue(feedbackSummary, "reviews"),
		"positiveFeedbackRate": firstMapValue(feedbackSummary, "positivePercent"), "feedbackRate": firstMapValue(feedbackSummary, "positivePercent"),
		"feedbackComments": comments, "positiveFeedbackRows": positiveRows, "negativeFeedbackRows": negativeRows,
		"warnings": data["warnings"], "collectedAt": firstMapValue(mapFromAny(data["meta"]), "collectedAt"), "lastFeedbackSource": "chrome_extension_dom",
		"rawCollectorData": data,
	}
	// Visible page text can fill trade metrics when the modal collector could not.
	for k, v := range visible {
		if flat[k] == nil || flat[k] == "" {
			flat[k] = v
		}
	}
	return flat
}

func (s *Server) extensionResult(w http.ResponseWriter, r *http.Request) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	taskID := mapInt64(in, "taskId", "crmTaskId")
	if taskID <= 0 {
		writeJSON(w, 422, envelope{"error": "task_id_required"})
		return
	}
	var tid int64
	var raw, status, claimHash string
	if s.store.DB.QueryRowContext(r.Context(), `SELECT tenant_id,payload_json,status,claim_token_hash FROM extension_tasks WHERE id=`+s.store.Bind(1), taskID).Scan(&tid, &raw, &status, &claimHash) != nil {
		writeJSON(w, 404, envelope{"error": "task_not_found"})
		return
	}
	p := jsonMap(raw)
	supplied := firstNonEmpty(mapString(in, "resultToken", "taskResultToken"), r.Header.Get("X-P2P-Extension-Task-Token"), requestString(r, "taskToken"))
	tenantAuthorized := false
	if requestTid, ok := s.extensionTenantFromRequest(r); ok && requestTid == tid {
		tenantAuthorized = true
	}
	taskAuthorized := supplied != "" && claimHash != "" && hmac.Equal([]byte(tokenHash(supplied)), []byte(claimHash))
	if !tenantAuthorized && !taskAuthorized {
		writeJSON(w, 401, envelope{"error": "invalid_task_or_tenant_token"})
		return
	}
	if status == "completed" {
		writeJSON(w, 200, map[string]any{"ok": true, "taskId": taskID, "duplicate": true})
		return
	}
	if !mapBool(in, "ok") {
		errText := firstNonEmpty(mapString(in, "error"), "Extension collection failed")
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE extension_tasks SET status='failed',result_json=`+s.store.Bind(1)+`,last_error=`+s.store.Bind(2)+`,claim_token_hash='',lease_expires_at=NULL,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3), rawJSON(in), errText, taskID)
		if oid := mapInt64(p, "orderId"); oid > 0 {
			s.updateOrderExtensionState(r.Context(), tid, oid, "failed", taskID, nil, errText)
		}
		_ = s.svc.Publish(r.Context(), events.Event{TenantID: tid, Type: "p2p.extension.failed", Data: map[string]any{"taskId": taskID, "orderId": mapInt64(p, "orderId"), "error": errText}})
		writeJSON(w, 200, map[string]any{"ok": true, "taskId": taskID, "failed": true})
		return
	}
	data := in
	if m, ok := in["data"].(map[string]any); ok {
		data = m
	}
	userNo := firstNonEmpty(mapString(data, "userNo"), mapString(p, "userNo"))
	if userNo == "" {
		writeJSON(w, 422, envelope{"error": "user_no_required"})
		return
	}
	flat := extensionCollectorFlat(data, p, userNo)
	cfg := s.extensionSettings(r, tid)
	cacheHours := mapInt64(cfg, "cacheHours")
	if cacheHours <= 0 || cacheHours > 168 {
		cacheHours = 24
	}
	expires := time.Now().UTC().Add(time.Duration(cacheHours) * time.Hour)
	key := "user:" + userNo
	if s.store.Driver == "postgres" {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO extension_cache(tenant_id,cache_key,payload_json,expires_at,updated_at) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,cache_key) DO UPDATE SET payload_json=EXCLUDED.payload_json,expires_at=EXCLUDED.expires_at,updated_at=CURRENT_TIMESTAMP`, tid, key, rawJSON(flat), expires)
	} else {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO extension_cache(tenant_id,cache_key,payload_json,expires_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE payload_json=VALUES(payload_json),expires_at=VALUES(expires_at),updated_at=CURRENT_TIMESTAMP`, tid, key, rawJSON(flat), expires)
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE extension_tasks SET status='completed',result_json=`+s.store.Bind(1)+`,last_error='',claim_token_hash='',lease_expires_at=NULL,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2), rawJSON(flat), taskID)
	if oid := mapInt64(p, "orderId"); oid > 0 {
		s.updateOrderExtensionState(r.Context(), tid, oid, "collected", taskID, flat, "")
	}
	_ = s.svc.Publish(r.Context(), events.Event{TenantID: tid, Type: "p2p.extension.data_collected", Data: map[string]any{"taskId": taskID, "orderId": mapInt64(p, "orderId"), "userNo": userNo}})
	writeJSON(w, 200, map[string]any{"ok": true, "taskId": taskID, "userNo": userNo})
}

func (s *Server) updateOrderExtensionState(ctx context.Context, tid, oid int64, state string, taskID int64, data map[string]any, errText string) {
	var orderRaw string
	if s.store.DB.QueryRowContext(ctx, `SELECT raw_json FROM orders WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), oid, tid).Scan(&orderRaw) != nil {
		return
	}
	om := jsonMap(orderRaw)
	om["extensionP2pDataStatus"] = state
	om["extensionP2pDataTaskId"] = taskID
	if data != nil {
		om["extensionP2pData"] = data
		om["counterpartyStats"] = mergeMaps(mapFromAny(om["counterpartyStats"]), data)
		om["lastCounterpartySyncedAt"] = time.Now().UTC()
		om["lastCounterpartyStatsError"] = ""
	} else if errText != "" {
		om["lastCounterpartyStatsError"] = errText
	}
	_, _ = s.store.DB.ExecContext(ctx, `UPDATE orders SET raw_json=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2)+` AND tenant_id=`+s.store.Bind(3), rawJSON(om), oid, tid)
}

func (s *Server) extensionCollectOrder(w http.ResponseWriter, r *http.Request, u ctxUser) {
	oid := parseID(r.PathValue("id"))
	o, e := s.getOrder(r.Context(), u, oid, "orders.view")
	if e != nil {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	raw := jsonMap(o.Raw)
	userNo := firstNonEmpty(findStringDeep(raw, "counterpartyUserNo", "counterPartUserNo", "userNo", "merchantNo", "advertiserNo"), mapString(raw, "counterpartyUserNo"))
	if userNo == "" {
		writeJSON(w, 200, map[string]any{"queued": false, "reason": "missing_counterparty_user_no", "order": s.orderMap(r.Context(), u, o, true)})
		return
	}
	key := "user:" + userNo
	var cached string
	if s.store.DB.QueryRowContext(r.Context(), `SELECT payload_json FROM extension_cache WHERE tenant_id=`+s.store.Bind(1)+` AND cache_key=`+s.store.Bind(2)+` AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)`, u.TenantID, key).Scan(&cached) == nil {
		data := jsonMap(cached)
		raw["extensionP2pDataStatus"] = "collected"
		raw["extensionP2pData"] = data
		raw["counterpartyStats"] = mergeMaps(mapFromAny(raw["counterpartyStats"]), data)
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE orders SET raw_json=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2)+` AND tenant_id=`+s.store.Bind(3), rawJSON(raw), oid, u.TenantID)
		o.Raw = rawJSON(raw)
		writeJSON(w, 200, map[string]any{"queued": false, "cached": true, "order": s.orderMap(r.Context(), u, o, true)})
		return
	}
	template := mapString(s.extensionSettings(r, u.TenantID), "advertiserDetailUrlTemplate")
	url := strings.ReplaceAll(template, "{userNo}", userNo)
	if !strings.HasPrefix(url, "https://c2c.binance.com/") || !strings.Contains(url, "/advertiserDetail") {
		writeJSON(w, 422, envelope{"error": "invalid_extension_advertiser_url_template"})
		return
	}
	resultToken := randomID("ext")
	leaseUntil := time.Now().UTC().Add(extensionDirectLease)
	payload := map[string]any{"orderId": oid, "orderNo": o.ExternalNo, "userNo": userNo, "counterpartyName": o.Counterparty, "advertiserUrl": url, "reason": "p2p_info_click"}
	pg := `INSERT INTO extension_tasks(tenant_id,exchange_account_id,task_type,payload_json,status,attempt_count,result_json,claim_token_hash,claimed_at,lease_expires_at,last_error,created_at,updated_at) VALUES($1,$2,'counterparty_profile',$3,'direct_pending',0,'{}',$4,CURRENT_TIMESTAMP,$5,'',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`
	my := `INSERT INTO extension_tasks(tenant_id,exchange_account_id,task_type,payload_json,status,attempt_count,result_json,claim_token_hash,claimed_at,lease_expires_at,last_error,created_at,updated_at) VALUES(?,?,'counterparty_profile',?,'direct_pending',0,'{}',?,CURRENT_TIMESTAMP,?,'',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
	id, e := s.insertID(r.Context(), pg, my, u.TenantID, sqlNullInt64(o.AccountID), rawJSON(payload), tokenHash(resultToken), leaseUntil)
	if e != nil {
		replyDBError(w, e)
		return
	}
	raw["extensionP2pDataStatus"] = "pending"
	raw["extensionP2pDataTaskId"] = id
	raw["extensionAdvertiserUrl"] = url
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE orders SET raw_json=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2)+` AND tenant_id=`+s.store.Bind(3), rawJSON(raw), oid, u.TenantID)
	o.Raw = rawJSON(raw)
	payload["id"] = id
	payload["resultToken"] = resultToken
	payload["tenantId"] = u.TenantID
	writeJSON(w, 200, map[string]any{"queued": true, "task": payload, "order": s.orderMap(r.Context(), u, o, true)})
}

func requestOrigin(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}
