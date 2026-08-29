package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"p2pflow/v2/internal/binance"
	"p2pflow/v2/internal/events"
)

// RunWorkers runs durable background synchronization. It can run inside the
// web process for small installs or in cmd/p2pflow-worker for horizontal scale.
// Database leases prevent duplicate work across multiple worker instances.
func (s *Server) RunWorkers(ctx context.Context) {
	if !s.cfg.WorkerEnabled {
		<-ctx.Done()
		return
	}
	var wg sync.WaitGroup
	run := func(fn func(context.Context)) { wg.Add(1); go func() { defer wg.Done(); fn(ctx) }() }
	run(s.orderSyncLoop)
	run(s.adsSyncLoop)
	run(s.outboxLoop)
	run(s.chatSupervisor)
	run(s.billingLoop)
	run(s.notificationDeliveryLoop)
	run(s.maintenanceLoop)
	run(s.usageFlushLoop)
	<-ctx.Done()
	wg.Wait()
}

func (s *Server) usageFlushLoop(ctx context.Context) {
	t := time.NewTicker(10 * time.Second)
	defer t.Stop()
	defer func() {
		flushCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		s.flushUsage(flushCtx)
	}()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.flushUsage(ctx)
		}
	}
}

func (s *Server) maintenanceLoop(ctx context.Context) {
	// Run once shortly after worker start, then hourly. The lease keeps multiple
	// worker replicas from doing the same housekeeping simultaneously.
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	run := func() {
		if !s.claimLease(ctx, "maintenance:global", 55*time.Minute) {
			return
		}
		now := time.Now().UTC()
		_, _ = s.store.DB.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at<CURRENT_TIMESTAMP`)
		_, _ = s.store.DB.ExecContext(ctx, `UPDATE activity_sessions SET ended_at=CURRENT_TIMESTAMP,status='offline' WHERE status='online' AND last_heartbeat_at<`+s.store.Bind(1), now.Add(-2*time.Minute))
		_, _ = s.store.DB.ExecContext(ctx, `DELETE FROM security_challenges WHERE expires_at<`+s.store.Bind(1), now.Add(-7*24*time.Hour))
		_, _ = s.store.DB.ExecContext(ctx, `DELETE FROM device_auth_challenges WHERE expires_at<`+s.store.Bind(1), now.Add(-7*24*time.Hour))
		_, _ = s.store.DB.ExecContext(ctx, `DELETE FROM outbox_events WHERE status='published' AND published_at<`+s.store.Bind(1), now.Add(-7*24*time.Hour))
		_, _ = s.store.DB.ExecContext(ctx, `DELETE FROM billing_webhook_events WHERE status='processed' AND processed_at<`+s.store.Bind(1), now.Add(-180*24*time.Hour))
		_, _ = s.store.DB.ExecContext(ctx, `DELETE FROM worker_leases WHERE lease_key<>`+s.store.Bind(1)+` AND expires_at<`+s.store.Bind(2), "maintenance:global", now.Add(-24*time.Hour))
	}
	run()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			run()
		}
	}
}

func (s *Server) orderSyncLoop(ctx context.Context) {
	interval := s.cfg.BinanceOrderSyncInterval
	if interval < 2*time.Second {
		interval = 2 * time.Second
	}
	t := time.NewTicker(1 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.runDueExchangeSync(ctx, "orders", interval)
		}
	}
}
func (s *Server) adsSyncLoop(ctx context.Context) {
	interval := s.cfg.BinanceAdsSyncInterval
	if interval < 10*time.Second {
		interval = 10 * time.Second
	}
	t := time.NewTicker(3 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.runDueExchangeSync(ctx, "ads", interval)
		}
	}
}

func (s *Server) runDueExchangeSync(ctx context.Context, kind string, interval time.Duration) {
	col := "last_order_sync_at"
	if kind == "ads" {
		col = "last_ads_sync_at"
	}
	cutoff := time.Now().UTC().Add(-interval)
	workLimit := s.cfg.BinanceHTTPConcurrency - s.cfg.BinanceInteractiveReserve
	if workLimit < 1 {
		workLimit = 1
	}
	if workLimit > 50 {
		workLimit = 50
	}
	// Fetch more candidates than one worker can execute. With several worker
	// replicas they otherwise all select the same first N due accounts and the
	// lease losers sit idle. Claiming from a wider candidate window lets replicas
	// naturally spread across hundreds/thousands of exchange accounts.
	candidateLimit := workLimit * 10
	if candidateLimit < 50 {
		candidateLimit = 50
	}
	if candidateLimit > 500 {
		candidateLimit = 500
	}
	q := `SELECT a.id,a.tenant_id FROM exchange_accounts a LEFT JOIN exchange_sync_state st ON st.exchange_account_id=a.id WHERE a.status='active' AND (st.` + col + ` IS NULL OR st.` + col + `<` + s.store.Bind(1) + `) ORDER BY st.` + col + ` ASC LIMIT ` + fmt.Sprint(candidateLimit)
	rows, e := s.store.DB.QueryContext(ctx, q, cutoff)
	if e != nil {
		return
	}
	var candidates [][2]int64
	for rows.Next() {
		var id, tid int64
		if rows.Scan(&id, &tid) == nil {
			candidates = append(candidates, [2]int64{id, tid})
		}
	}
	rows.Close()
	jobs := make([][2]int64, 0, workLimit)
	for _, candidate := range candidates {
		if s.claimLease(ctx, kind+":"+fmt.Sprint(candidate[0]), 45*time.Second) {
			jobs = append(jobs, candidate)
			if len(jobs) >= workLimit {
				break
			}
		}
	}
	var wg sync.WaitGroup
	for _, j := range jobs {
		j := j
		wg.Add(1)
		go func() {
			defer wg.Done()
			u := ctxUser{TenantID: j[1], IsOwner: true, IsSuperAdmin: true, Permissions: []string{"*"}}
			var err error
			if kind == "orders" {
				_, _, err = s.syncOrdersForCredential(ctx, u, j[0], true)
			} else {
				_, _, err = s.syncAdsCredential(ctx, u, j[0], true)
			}
			s.setSyncState(ctx, j[1], j[0], kind, err)
		}()
	}
	wg.Wait()
}

func (s *Server) setSyncState(ctx context.Context, tid, cid int64, kind string, err error) {
	errText := ""
	if err != nil {
		errText = err.Error()
		if len(errText) > 1000 {
			errText = errText[:1000]
		}
	}
	col := "last_order_sync_at"
	if kind == "ads" {
		col = "last_ads_sync_at"
	}
	if s.store.Driver == "postgres" {
		q := `INSERT INTO exchange_sync_state(exchange_account_id,tenant_id,` + col + `,last_error,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP,$3,CURRENT_TIMESTAMP) ON CONFLICT(exchange_account_id) DO UPDATE SET ` + col + `=CURRENT_TIMESTAMP,last_error=EXCLUDED.last_error,updated_at=CURRENT_TIMESTAMP`
		_, _ = s.store.DB.ExecContext(ctx, q, cid, tid, errText)
	} else {
		q := `INSERT INTO exchange_sync_state(exchange_account_id,tenant_id,` + col + `,last_error,updated_at) VALUES(?,?,CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE ` + col + `=CURRENT_TIMESTAMP,last_error=VALUES(last_error),updated_at=CURRENT_TIMESTAMP`
		_, _ = s.store.DB.ExecContext(ctx, q, cid, tid, errText)
	}
}

func (s *Server) claimLease(ctx context.Context, key string, ttl time.Duration) bool {
	owner := s.workerOwnerID()
	exp := time.Now().UTC().Add(ttl)
	if s.store.Driver == "postgres" {
		var got string
		e := s.store.DB.QueryRowContext(ctx, `INSERT INTO worker_leases(lease_key,owner_id,expires_at,updated_at) VALUES($1,$2,$3,CURRENT_TIMESTAMP) ON CONFLICT(lease_key) DO UPDATE SET owner_id=EXCLUDED.owner_id,expires_at=EXCLUDED.expires_at,updated_at=CURRENT_TIMESTAMP WHERE worker_leases.expires_at<CURRENT_TIMESTAMP OR worker_leases.owner_id=EXCLUDED.owner_id RETURNING owner_id`, key, owner, exp).Scan(&got)
		return e == nil && got == owner
	}
	_, _ = s.store.DB.ExecContext(ctx, `INSERT INTO worker_leases(lease_key,owner_id,expires_at,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE owner_id=IF(expires_at<CURRENT_TIMESTAMP OR owner_id=VALUES(owner_id),VALUES(owner_id),owner_id),expires_at=IF(expires_at<CURRENT_TIMESTAMP OR owner_id=VALUES(owner_id),VALUES(expires_at),expires_at),updated_at=CURRENT_TIMESTAMP`, key, owner, exp)
	var got string
	_ = s.store.DB.QueryRowContext(ctx, `SELECT owner_id FROM worker_leases WHERE lease_key=? AND expires_at>CURRENT_TIMESTAMP`, key).Scan(&got)
	return got == owner
}
func (s *Server) workerOwnerID() string {
	return s.cfg.InstanceID
}

func (s *Server) outboxLoop(ctx context.Context) {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.processOutbox(ctx)
		}
	}
}
func (s *Server) processOutbox(ctx context.Context) {
	_, _ = s.store.DB.ExecContext(ctx, `UPDATE outbox_events SET status='pending',claimed_at=NULL WHERE status='processing' AND claimed_at<`+s.store.Bind(1), time.Now().UTC().Add(-5*time.Minute))
	rows, e := s.store.DB.QueryContext(ctx, `SELECT id,COALESCE(tenant_id,0),topic,event_key,payload_json FROM outbox_events WHERE status='pending' AND available_at<=CURRENT_TIMESTAMP ORDER BY id LIMIT 100`)
	if e != nil {
		return
	}
	type row struct {
		id, tid         int64
		topic, key, raw string
	}
	var list []row
	for rows.Next() {
		var x row
		if rows.Scan(&x.id, &x.tid, &x.topic, &x.key, &x.raw) == nil {
			list = append(list, x)
		}
	}
	rows.Close()
	for _, x := range list {
		res, e := s.store.DB.ExecContext(ctx, `UPDATE outbox_events SET status='processing',claimed_at=CURRENT_TIMESTAMP,attempt_count=attempt_count+1 WHERE id=`+s.store.Bind(1)+` AND status='pending'`, x.id)
		if e != nil {
			continue
		}
		n, _ := res.RowsAffected()
		if n != 1 {
			continue
		}
		var payload any
		_ = json.Unmarshal([]byte(x.raw), &payload)
		if err := s.svc.Publish(ctx, events.Event{TenantID: x.tid, Type: x.topic, Data: map[string]any{"key": x.key, "payload": payload}}); err != nil {
			_, _ = s.store.DB.ExecContext(ctx, `UPDATE outbox_events SET status='pending',claimed_at=NULL,available_at=`+s.store.Bind(1)+` WHERE id=`+s.store.Bind(2), time.Now().UTC().Add(5*time.Second), x.id)
			continue
		}
		_, _ = s.store.DB.ExecContext(ctx, `UPDATE outbox_events SET status='published',published_at=CURRENT_TIMESTAMP,claimed_at=NULL WHERE id=`+s.store.Bind(1), x.id)
	}
}

func (s *Server) chatSupervisor(ctx context.Context) {
	active := map[int64]context.CancelFunc{}
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	refresh := func() {
		rows, e := s.store.DB.QueryContext(ctx, `SELECT id,tenant_id FROM exchange_accounts WHERE status='active'`)
		if e != nil {
			return
		}
		seen := map[int64]bool{}
		for rows.Next() {
			var cid, tid int64
			if rows.Scan(&cid, &tid) != nil {
				continue
			}
			seen[cid] = true
			if _, ok := active[cid]; !ok {
				cctx, cancel := context.WithCancel(ctx)
				active[cid] = cancel
				go s.runChatStream(cctx, tid, cid)
			}
		}
		rows.Close()
		for id, cancel := range active {
			if !seen[id] {
				cancel()
				delete(active, id)
			}
		}
	}
	refresh()
	for {
		select {
		case <-ctx.Done():
			for _, c := range active {
				c()
			}
			return
		case <-t.C:
			refresh()
		}
	}
}

func (s *Server) runChatStream(ctx context.Context, tid, cid int64) {
	backoff := s.cfg.BinanceChatReconnectMin
	if backoff < time.Second {
		backoff = time.Second
	}
	max := s.cfg.BinanceChatReconnectMax
	if max < backoff {
		max = 30 * time.Second
	}
	for {
		if ctx.Err() != nil {
			return
		}
		if !s.claimLease(ctx, "chat:"+fmt.Sprint(cid), 2*time.Minute) {
			sleepContext(ctx, 30*time.Second)
			continue
		}
		cred, e := s.svc.Credential(ctx, tid, cid)
		if e != nil {
			sleepContext(ctx, backoff)
			continue
		}
		cr, e := s.svc.Binance.Call(ctx, s.svc.BinanceCredential(cred), "retrieveChatCredential", nil, nil, true)
		if e != nil {
			s.updateChatState(ctx, tid, cid, "error", e.Error(), false)
			sleepContext(ctx, backoff)
			backoff = minDuration(max, backoff*2)
			continue
		}
		d := mapAny(binance.Data(cr))
		base := strings.TrimRight(anyString(d["chatWssUrl"]), "/")
		listen := anyString(d["listenKey"])
		token := anyString(d["listenToken"])
		if base == "" || listen == "" || token == "" {
			s.updateChatState(ctx, tid, cid, "error", "missing chat credentials", false)
			sleepContext(ctx, backoff)
			continue
		}
		raw := base + "/" + url.PathEscape(listen) + "?token=" + url.QueryEscape(token) + "&clientType=web"
		ws, e := binance.DialWebSocket(ctx, raw)
		if e != nil {
			s.updateChatState(ctx, tid, cid, "error", e.Error(), false)
			sleepContext(ctx, backoff)
			backoff = minDuration(max, backoff*2)
			continue
		}
		backoff = s.cfg.BinanceChatReconnectMin
		if backoff < time.Second {
			backoff = time.Second
		}
		s.registerLiveChatConn(cid, ws)
		s.updateChatState(ctx, tid, cid, "connected", "", true)
		for {
			readCtx, cancel := context.WithTimeout(ctx, 75*time.Second)
			_, b, e := ws.ReadMessage(readCtx)
			cancel()
			if e != nil {
				s.unregisterLiveChatConn(cid, ws)
				_ = ws.Close()
				s.updateChatState(ctx, tid, cid, "reconnecting", e.Error(), false)
				break
			}
			s.claimLease(ctx, "chat:"+fmt.Sprint(cid), 2*time.Minute)
			s.processChatPayload(ctx, tid, cid, b)
		}
	}
}

func (s *Server) updateChatState(ctx context.Context, tid, cid int64, status, errText string, connected bool) {
	if len(errText) > 1000 {
		errText = errText[:1000]
	}
	if s.store.Driver == "postgres" {
		connectedExpr := "last_chat_connected_at"
		if connected {
			connectedExpr = "CURRENT_TIMESTAMP"
		}
		q := `INSERT INTO exchange_sync_state(exchange_account_id,tenant_id,last_chat_connected_at,chat_status,last_error,updated_at) VALUES($1,$2,` + func() string {
			if connected {
				return "CURRENT_TIMESTAMP"
			}
			return "NULL"
		}() + `,$3,$4,CURRENT_TIMESTAMP) ON CONFLICT(exchange_account_id) DO UPDATE SET last_chat_connected_at=` + connectedExpr + `,chat_status=EXCLUDED.chat_status,last_error=EXCLUDED.last_error,updated_at=CURRENT_TIMESTAMP`
		_, _ = s.store.DB.ExecContext(ctx, q, cid, tid, status, errText)
	} else {
		if connected {
			_, _ = s.store.DB.ExecContext(ctx, `INSERT INTO exchange_sync_state(exchange_account_id,tenant_id,last_chat_connected_at,chat_status,last_error,updated_at) VALUES(?,?,CURRENT_TIMESTAMP,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE last_chat_connected_at=CURRENT_TIMESTAMP,chat_status=VALUES(chat_status),last_error=VALUES(last_error),updated_at=CURRENT_TIMESTAMP`, cid, tid, status, errText)
		} else {
			_, _ = s.store.DB.ExecContext(ctx, `INSERT INTO exchange_sync_state(exchange_account_id,tenant_id,chat_status,last_error,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE chat_status=VALUES(chat_status),last_error=VALUES(last_error),updated_at=CURRENT_TIMESTAMP`, cid, tid, status, errText)
		}
	}
}

func (s *Server) processChatPayload(ctx context.Context, tid, cid int64, b []byte) {
	var v any
	if json.Unmarshal(b, &v) != nil {
		return
	}
	for _, m := range collectMessageMaps(v) {
		orderNo := anyString(firstAny(m, "orderNo", "orderNumber"))
		if orderNo == "" {
			continue
		}
		var oid int64
		if s.store.DB.QueryRowContext(ctx, `SELECT id FROM orders WHERE tenant_id=`+s.store.Bind(1)+` AND exchange_account_id=`+s.store.Bind(2)+` AND external_order_no=`+s.store.Bind(3), tid, cid, orderNo).Scan(&oid) != nil {
			continue
		}
		mid := anyString(firstAny(m, "id", "messageId"))
		uuid := anyString(m["uuid"])
		var n int64
		if uuid != "" {
			_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM chats WHERE exchange_account_id=`+s.store.Bind(1)+` AND external_uuid=`+s.store.Bind(2), cid, uuid).Scan(&n)
		} else if mid != "" {
			_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM chats WHERE exchange_account_id=`+s.store.Bind(1)+` AND external_message_id=`+s.store.Bind(2), cid, mid).Scan(&n)
		}
		if n > 0 {
			continue
		}
		typ := firstString(anyString(firstAny(m, "type", "chatMessageType")), "text")
		content := anyString(m["content"])
		img := firstString(anyString(m["imageUrl"]), anyString(m["thumbnailUrl"]))
		sender := firstString(anyString(m["fromNickName"]), anyString(m["senderName"]))
		self := anyBool(m["self"])
		status := firstString(anyString(m["status"]), func() string {
			if self {
				return "read"
			}
			return "unread"
		}())
		sent := anyTime(firstAny(m, "createTime", "timestamp"))
		_, e := s.insertChat(ctx, tid, cid, oid, mid, uuid, typ, content, img, sender, self, status, sent)
		if e == nil {
			_, _ = s.store.DB.ExecContext(ctx, `UPDATE exchange_sync_state SET last_chat_event_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE exchange_account_id=`+s.store.Bind(1), cid)
			s.svc.Publish(ctx, events.Event{TenantID: tid, Type: "chat.message", Data: map[string]any{"orderId": oid, "credentialId": cid}})
		}
	}
}

func collectMessageMaps(v any) []map[string]any {
	var out []map[string]any
	var walk func(any)
	walk = func(x any) {
		switch z := x.(type) {
		case map[string]any:
			if firstAny(z, "orderNo", "orderNumber") != nil && (firstAny(z, "content", "imageUrl", "type", "chatMessageType") != nil) {
				out = append(out, z)
			}
			for _, v := range z {
				walk(v)
			}
		case []any:
			for _, v := range z {
				walk(v)
			}
		}
	}
	walk(v)
	return out
}
func mapAny(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}
func firstAny(m map[string]any, keys ...string) any {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			return v
		}
	}
	return nil
}
func anyString(v any) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(v))
}
func firstString(v ...string) string {
	for _, x := range v {
		if strings.TrimSpace(x) != "" {
			return x
		}
	}
	return ""
}
func anyBool(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case float64:
		return x != 0
	case string:
		return strings.EqualFold(x, "true") || x == "1"
	}
	return false
}
func anyTime(v any) time.Time {
	switch x := v.(type) {
	case float64:
		if x > 1e12 {
			return time.UnixMilli(int64(x)).UTC()
		}
		if x > 1e9 {
			return time.Unix(int64(x), 0).UTC()
		}
	case string:
		for _, f := range []string{time.RFC3339Nano, time.RFC3339} {
			if t, e := time.Parse(f, x); e == nil {
				return t
			}
		}
	}
	return time.Now().UTC()
}
func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
func sleepContext(ctx context.Context, d time.Duration) {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
	case <-t.C:
	}
}

func (s *Server) billingLoop(ctx context.Context) {
	t := time.NewTicker(6 * time.Hour)
	defer t.Stop()
	s.ensureRecurringInvoices(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.ensureRecurringInvoices(ctx)
		}
	}
}
func (s *Server) ensureRecurringInvoices(ctx context.Context) {
	if !s.claimLease(ctx, "billing-recurring", 30*time.Minute) {
		return
	}
	now := time.Now().UTC()
	_, _ = s.store.DB.ExecContext(ctx, `UPDATE billing_checkout_sessions SET status='expired',updated_at=CURRENT_TIMESTAMP WHERE status IN ('created','pending') AND expires_at IS NOT NULL AND expires_at<`+s.store.Bind(1), now)
	_, _ = s.store.DB.ExecContext(ctx, `UPDATE invoices SET status='overdue',updated_at=CURRENT_TIMESTAMP WHERE status='pending' AND due_at IS NOT NULL AND due_at<`+s.store.Bind(1), now)

	// Move unpaid subscriptions into a bounded grace period, then suspend the
	// workspace only after the grace deadline. We update row-by-row here instead
	// of using vendor-specific date arithmetic so PostgreSQL/MySQL/MariaDB keep
	// identical lifecycle semantics.
	rows, err := s.store.DB.QueryContext(ctx, `SELECT s.id,s.tenant_id,MIN(i.due_at),s.grace_until FROM subscriptions s JOIN invoices i ON i.subscription_id=s.id WHERE i.status='overdue' AND s.status NOT IN ('cancelled','suspended') GROUP BY s.id,s.tenant_id,s.grace_until`)
	if err == nil {
		type overdueSub struct {
			sid, tid int64
			due      time.Time
			grace    sql.NullTime
		}
		var overdue []overdueSub
		for rows.Next() {
			var x overdueSub
			if rows.Scan(&x.sid, &x.tid, &x.due, &x.grace) == nil {
				overdue = append(overdue, x)
			}
		}
		_ = rows.Close()
		for _, x := range overdue {
			grace := x.due.UTC().Add(s.cfg.BillingGracePeriod)
			if x.grace.Valid {
				grace = x.grace.Time.UTC()
			}
			if now.After(grace) {
				_, _ = s.store.DB.ExecContext(ctx, `UPDATE subscriptions SET status='suspended',past_due_since=COALESCE(past_due_since,`+s.store.Bind(1)+`),grace_until=`+s.store.Bind(2)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3), x.due.UTC(), grace, x.sid)
				_, _ = s.store.DB.ExecContext(ctx, `UPDATE tenants SET status='suspended',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1)+` AND status<>'disabled'`, x.tid)
				s.svc.Notify(ctx, x.tid, 0, "billing_suspended", "Workspace suspended", "The subscription grace period expired. Pay the overdue invoice to restore access.", map[string]any{"subscriptionId": x.sid, "graceUntil": grace})
			} else {
				_, _ = s.store.DB.ExecContext(ctx, `UPDATE subscriptions SET status='past_due',past_due_since=COALESCE(past_due_since,`+s.store.Bind(1)+`),grace_until=`+s.store.Bind(2)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3), x.due.UTC(), grace, x.sid)
				_, _ = s.store.DB.ExecContext(ctx, `UPDATE tenants SET status='past_due',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1)+` AND status NOT IN ('disabled','suspended')`, x.tid)
			}
		}
	}

	// Honour cancellation at the exact end of the paid period. A cancelled
	// workspace keeps its records but operational APIs are billing-gated.
	cancelRows, err := s.store.DB.QueryContext(ctx, `SELECT id,tenant_id FROM subscriptions WHERE cancel_at_period_end=TRUE AND current_period_end IS NOT NULL AND current_period_end<=`+s.store.Bind(1)+` AND status NOT IN ('cancelled','suspended')`, now)
	if err == nil {
		var items [][2]int64
		for cancelRows.Next() {
			var sid, tid int64
			if cancelRows.Scan(&sid, &tid) == nil {
				items = append(items, [2]int64{sid, tid})
			}
		}
		_ = cancelRows.Close()
		for _, x := range items {
			_, _ = s.store.DB.ExecContext(ctx, `UPDATE subscriptions SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), x[0])
			_, _ = s.store.DB.ExecContext(ctx, `UPDATE tenants SET status='suspended',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1)+` AND status<>'disabled'`, x[1])
		}
	}

	lead := s.cfg.BillingInvoiceLead
	if lead < 0 {
		lead = 0
	}
	cut := now.Add(lead)
	renewRows, err := s.store.DB.QueryContext(ctx, `SELECT s.id,s.tenant_id,s.current_period_end,p.monthly_price FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.status='active' AND s.cancel_at_period_end=FALSE AND s.current_period_end IS NOT NULL AND s.current_period_end<=`+s.store.Bind(1)+` AND p.monthly_price>0`, cut)
	if err != nil {
		return
	}
	type renewal struct {
		sid, tid int64
		end      time.Time
		amount   float64
	}
	var renewals []renewal
	for renewRows.Next() {
		var x renewal
		if renewRows.Scan(&x.sid, &x.tid, &x.end, &x.amount) == nil {
			renewals = append(renewals, x)
		}
	}
	_ = renewRows.Close()
	for _, x := range renewals {
		start := x.end.UTC()
		end := start.AddDate(0, 1, 0)
		due := start
		key := fmt.Sprintf("sub:%d:renewal:%s", x.sid, start.Format("20060102150405"))
		createdID := int64(0)
		err := s.svc.WithTx(ctx, func(tx *sql.Tx) error {
			id, err := s.insertInvoiceTx(ctx, tx, x.tid, x.sid, "renewal", s.cfg.BillingCurrency, x.amount, due, &start, &end, key)
			if err != nil {
				return err
			}
			createdID = id
			_, err = tx.ExecContext(ctx, `UPDATE subscriptions SET next_invoice_at=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2), end.Add(-lead), x.sid)
			return err
		})
		if err == nil && createdID > 0 {
			s.svc.Notify(ctx, x.tid, 0, "billing_invoice", "Subscription invoice created", "Your next monthly P2PFlow invoice is ready.", map[string]any{"subscriptionId": x.sid, "invoiceId": createdID, "amount": x.amount, "dueAt": due})
		}
	}
}
