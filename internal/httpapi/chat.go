package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"p2pflow/v2/internal/binance"
	"p2pflow/v2/internal/events"
)

var chatImageRate = struct {
	sync.Mutex
	hits map[int64][]time.Time
}{hits: map[int64][]time.Time{}}

func (s *Server) registerChatRoutes() {
	s.mux.HandleFunc("GET /api/chat-account-controls", s.requireUser(s.chatControlsGet))
	s.mux.HandleFunc("PATCH /api/chat-account-controls", s.requirePerm("settings.manage", s.chatControlsPatch))
	s.mux.HandleFunc("GET /api/chat-inbox", s.requirePerm("binance.chat", s.chatInbox))
	s.mux.HandleFunc("GET /api/chat-unread", s.requirePerm("binance.chat", s.chatUnread))
	s.mux.HandleFunc("PATCH /api/chat-unread", s.requirePerm("binance.chat", s.chatUnreadPatch))
	s.mux.HandleFunc("GET /api/orders/{id}/chat-delta", s.requirePerm("orders.view", s.chatDelta))
	s.mux.HandleFunc("POST /api/orders/{id}/chat", s.requirePerm("orders.manage", s.internalChatSend))
	s.mux.HandleFunc("POST /api/orders/{id}/binance-chat-send", s.requirePerm("binance.chat", s.binanceChatSend))
}

func (s *Server) chatControlsGet(w http.ResponseWriter, r *http.Request, u ctxUser) {
	opts := s.credentialOptions(r.Context(), u)
	rows, err := s.store.DB.QueryContext(r.Context(), `SELECT exchange_account_id,enabled,auto_sync,auto_assign,updated_at FROM chat_account_controls WHERE tenant_id=`+s.store.Bind(1), u.TenantID)
	if err != nil {
		replyDBError(w, err)
		return
	}
	defer rows.Close()
	by := map[int64]map[string]any{}
	for rows.Next() {
		var id int64
		var en, as, aa bool
		var at time.Time
		if rows.Scan(&id, &en, &as, &aa, &at) == nil {
			by[id] = map[string]any{"credentialId": id, "enabled": en, "autoSync": as, "autoAssign": aa, "updatedAt": at}
		}
	}
	var items []map[string]any
	for _, o := range opts {
		id := asInt64(o["id"])
		c := by[id]
		if c == nil {
			c = map[string]any{"credentialId": id, "enabled": true, "autoSync": true, "autoAssign": true}
		}
		c["credential"] = o
		items = append(items, c)
	}
	writeJSON(w, 200, map[string]any{"items": items, "credentials": opts})
}
func (s *Server) chatControlsPatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	id := mapInt64(in, "credentialId", "exchangeAccountId")
	if id <= 0 || !s.accountExists(r.Context(), u.TenantID, id) {
		writeJSON(w, 404, envelope{"error": "credential_not_found"})
		return
	}
	en := true
	as := true
	aa := true
	if _, ok := in["enabled"]; ok {
		en = mapBool(in, "enabled")
	}
	if _, ok := in["autoSync"]; ok {
		as = mapBool(in, "autoSync")
	}
	if _, ok := in["autoAssign"]; ok {
		aa = mapBool(in, "autoAssign")
	}
	if s.store.Driver == "postgres" {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO chat_account_controls(tenant_id,exchange_account_id,enabled,auto_sync,auto_assign,updated_at) VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,exchange_account_id) DO UPDATE SET enabled=EXCLUDED.enabled,auto_sync=EXCLUDED.auto_sync,auto_assign=EXCLUDED.auto_assign,updated_at=CURRENT_TIMESTAMP`, u.TenantID, id, en, as, aa)
	} else {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO chat_account_controls(tenant_id,exchange_account_id,enabled,auto_sync,auto_assign,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),auto_sync=VALUES(auto_sync),auto_assign=VALUES(auto_assign),updated_at=CURRENT_TIMESTAMP`, u.TenantID, id, en, as, aa)
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "chat_account_control_updated", "exchange_account", asString(id), r, map[string]any{"enabled": en, "autoSync": as, "autoAssign": aa})
	writeJSON(w, 200, map[string]any{"ok": true, "credentialId": id, "enabled": en, "autoSync": as, "autoAssign": aa})
}

func (s *Server) chatInbox(w http.ResponseWriter, r *http.Request, u ctxUser) {
	accounts := s.accessibleAccounts(r.Context(), u, "binance.chat")
	rows, err := s.store.DB.QueryContext(r.Context(), s.orderSelectSQL()+` WHERE o.tenant_id=`+s.store.Bind(1)+` ORDER BY o.updated_at DESC LIMIT 500`, u.TenantID)
	if err != nil {
		replyDBError(w, err)
		return
	}
	orders := []orderRecord{}
	ids := []int64{}
	for rows.Next() {
		o, e := s.scanOrder(rows)
		if e != nil || o.AccountID <= 0 || !accounts[o.AccountID] {
			continue
		}
		orders = append(orders, o)
		ids = append(ids, o.ID)
	}
	rows.Close()
	latestChats := s.latestChatSnapshot(r.Context(), u, ids)
	unread, _, total := s.unreadSnapshot(r.Context(), u, ids)
	items := make([]map[string]any, 0, len(orders))
	for _, o := range orders {
		latest, ok := latestChats[o.ID]
		if !ok {
			continue
		}
		items = append(items, map[string]any{
			"orderId": o.ID, "orderNo": o.ExternalNo, "externalOrderNo": o.ExternalNo,
			"credentialId": o.AccountID, "credentialName": firstNonEmpty(o.AccountNick, o.AccountLabel), "p2pUsername": o.AccountNick,
			"counterpartyName": o.Counterparty, "status": o.Status, "unreadCount": unread[o.ID], "latest": latest,
		})
	}
	writeJSON(w, 200, map[string]any{"items": items, "unreadTotal": total, "credentialOptions": s.credentialOptions(r.Context(), u)})
}

func (s *Server) latestChatSnapshot(ctx context.Context, u ctxUser, ids []int64) map[int64]map[string]any {
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
	sub := `SELECT order_id,MAX(id) AS max_id FROM chats WHERE tenant_id=` + s.store.Bind(1) + ` AND order_id IN (` + strings.Join(placeholders, ",") + `) GROUP BY order_id`
	q := `SELECT c.order_id,c.id,c.message_type,c.content,c.image_url,c.sender_name,c.is_self,c.sent_at FROM chats c JOIN (` + sub + `) x ON x.max_id=c.id`
	rows, err := s.store.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var orderID, id int64
		var typ, content, imageURL, sender string
		var self bool
		var sent time.Time
		if rows.Scan(&orderID, &id, &typ, &content, &imageURL, &sender, &self, &sent) == nil {
			out[orderID] = map[string]any{"id": id, "type": typ, "content": content, "imageUrl": imageURL, "senderName": sender, "self": self, "sentAt": sent}
		}
	}
	return out
}

func (s *Server) chatUnread(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var ids []int64
	rows, _ := s.store.DB.QueryContext(r.Context(), `SELECT id FROM orders WHERE tenant_id=`+s.store.Bind(1), u.TenantID)
	if rows != nil {
		for rows.Next() {
			var id int64
			if rows.Scan(&id) == nil {
				ids = append(ids, id)
			}
		}
		rows.Close()
	}
	counts, latest, total := s.unreadSnapshot(r.Context(), u, ids)
	writeJSON(w, 200, map[string]any{"counts": counts, "latestByOrder": latest, "total": total})
}
func (s *Server) chatUnreadPatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	orderID := mapInt64(in, "orderId")
	if orderID <= 0 {
		writeJSON(w, 422, envelope{"error": "orderId required"})
		return
	}
	if _, err := s.getOrder(r.Context(), u, orderID, "orders.view"); err != nil {
		replyDBError(w, err)
		return
	}
	last := mapInt64(in, "lastReadChatId", "chatId")
	if last == 0 {
		_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(id),0) FROM chats WHERE order_id=`+s.store.Bind(1), orderID).Scan(&last)
	}
	if s.store.Driver == "postgres" {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO chat_read_states(tenant_id,user_id,order_id,last_read_chat_id,updated_at) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP) ON CONFLICT(user_id,order_id) DO UPDATE SET last_read_chat_id=GREATEST(chat_read_states.last_read_chat_id,EXCLUDED.last_read_chat_id),updated_at=CURRENT_TIMESTAMP`, u.TenantID, u.ID, orderID, last)
	} else {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO chat_read_states(tenant_id,user_id,order_id,last_read_chat_id,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE last_read_chat_id=GREATEST(last_read_chat_id,VALUES(last_read_chat_id)),updated_at=CURRENT_TIMESTAMP`, u.TenantID, u.ID, orderID, last)
	}
	writeJSON(w, 200, map[string]any{"ok": true, "orderId": orderID, "lastReadChatId": last})
}
func (s *Server) chatDelta(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.view")
	if err != nil {
		replyDBError(w, err)
		return
	}
	after := asInt64(requestString(r, "afterId"))
	limit := int(asInt64(requestString(r, "limit")))
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.store.DB.QueryContext(r.Context(), `SELECT id,message_type,content,image_url,sender_name,is_self,status,external_message_id,external_uuid,sent_at FROM chats WHERE order_id=`+s.store.Bind(1)+` AND id>`+s.store.Bind(2)+` ORDER BY id ASC LIMIT `+strconv.Itoa(limit), o.ID, after)
	if err != nil {
		replyDBError(w, err)
		return
	}
	defer rows.Close()
	var items []map[string]any
	last := after
	for rows.Next() {
		var id int64
		var typ, c, img, sender, st, mid, uuid string
		var self bool
		var sent time.Time
		if rows.Scan(&id, &typ, &c, &img, &sender, &self, &st, &mid, &uuid, &sent) == nil {
			last = id
			items = append(items, map[string]any{"id": id, "type": typ, "content": c, "imageUrl": img, "senderName": sender, "self": self, "status": st, "binanceMessageId": firstNonEmpty(uuid, mid), "sentAt": sent})
		}
	}
	writeJSON(w, 200, map[string]any{"items": items, "afterId": after, "lastId": last})
}

func (s *Server) internalChatSend(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "orders.manage")
	if err != nil {
		replyDBError(w, err)
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	msg := mapString(in, "message", "content")
	if msg == "" {
		writeJSON(w, 422, envelope{"error": "message required"})
		return
	}
	id, err := s.insertChat(r.Context(), u.TenantID, o.AccountID, o.ID, "", "", "text", msg, "", u.Name, true, "read", time.Now().UTC())
	if err != nil {
		replyDBError(w, err)
		return
	}
	s.svc.Publish(r.Context(), events.Event{TenantID: u.TenantID, Type: "chat.message", Data: map[string]any{"orderId": o.ID, "chatId": id}})
	writeJSON(w, 200, s.orderMap(r.Context(), u, o, true))
}

func (s *Server) syncBinanceChat(ctx context.Context, u ctxUser, o orderRecord, background bool) (int, error) {
	cred, err := s.svc.Credential(ctx, u.TenantID, o.AccountID)
	if err != nil {
		return 0, err
	}
	res, err := s.svc.Binance.Call(ctx, s.svc.BinanceCredential(cred), "retrieveChatMessages", map[string]any{"orderNo": o.ExternalNo, "page": 1, "rows": 20, "sort": "desc"}, nil, background)
	s.updateUsage(ctx, u.TenantID, "api_requests", 1)
	if err != nil {
		return 0, err
	}
	items := responseDataSlice(res)
	n := 0
	for _, v := range items {
		m, ok := v.(map[string]any)
		if !ok {
			continue
		}
		if s.upsertChatMessage(ctx, u, o, m) == nil {
			n++
		}
	}
	if n > 0 {
		s.svc.Publish(ctx, events.Event{TenantID: u.TenantID, Type: "chat.synced", Data: map[string]any{"orderId": o.ID, "count": n}})
	}
	return n, nil
}
func (s *Server) upsertChatMessage(ctx context.Context, u ctxUser, o orderRecord, m map[string]any) error {
	mid := mapString(m, "id", "messageId")
	uuid := mapString(m, "uuid")
	typ := firstNonEmpty(mapString(m, "type", "chatMessageType"), "text")
	content := mapString(m, "content")
	img := firstNonEmpty(mapString(m, "imageUrl"), mapString(m, "thumbnailUrl"))
	sender := mapString(m, "fromNickName", "senderName")
	self := mapBool(m, "self")
	status := firstNonEmpty(mapString(m, "status"), func() string {
		if self {
			return "read"
		}
		return "unread"
	}())
	sent := parseAnyTime(firstMapValue(m, "createTime", "timestamp"))
	var n int
	if uuid != "" {
		_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM chats WHERE exchange_account_id=`+s.store.Bind(1)+` AND external_uuid=`+s.store.Bind(2), o.AccountID, uuid).Scan(&n)
	} else if mid != "" {
		_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM chats WHERE exchange_account_id=`+s.store.Bind(1)+` AND external_message_id=`+s.store.Bind(2), o.AccountID, mid).Scan(&n)
	}
	if n > 0 {
		return nil
	}
	_, err := s.insertChat(ctx, u.TenantID, o.AccountID, o.ID, mid, uuid, typ, content, img, sender, self, status, sent)
	return err
}
func (s *Server) insertChat(ctx context.Context, tenantID, accountID, orderID int64, mid, uuid, typ, content, img, sender string, self bool, status string, sent time.Time) (int64, error) {
	pg := `INSERT INTO chats(tenant_id,exchange_account_id,order_id,external_message_id,external_uuid,message_type,content,image_url,sender_name,is_self,status,sent_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP) RETURNING id`
	my := `INSERT INTO chats(tenant_id,exchange_account_id,order_id,external_message_id,external_uuid,message_type,content,image_url,sender_name,is_self,status,sent_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`
	return s.insertID(ctx, pg, my, tenantID, sqlNullInt64(accountID), orderID, mid, uuid, typ, content, img, sender, self, status, sent)
}

func (s *Server) binanceChatSend(w http.ResponseWriter, r *http.Request, u ctxUser) {
	o, err := s.getOrder(r.Context(), u, parseID(r.PathValue("id")), "binance.chat")
	if err != nil {
		replyDBError(w, err)
		return
	}
	if o.AccountID <= 0 {
		writeJSON(w, 422, envelope{"error": "offline_order"})
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	message := mapString(in, "message", "content")
	media := mapString(in, "mediaDataUrl")
	mediaName := firstNonEmpty(mapString(in, "mediaName"), "image.jpg")
	typ := "text"
	content := message
	imageURL := ""
	if media != "" {
		typ = "image"
		imageURL, err = s.uploadBinanceChatImage(r.Context(), u, o, media, mediaName)
		if err != nil {
			writeJSON(w, 502, envelope{"error": "image_upload_failed", "message": friendlyBinanceError(err)})
			return
		}
		content = imageURL
	}
	if content == "" {
		writeJSON(w, 422, envelope{"error": "message_or_media_required"})
		return
	}

	uuid := fmt.Sprintf("%d-%d", time.Now().UnixMilli(), u.ID)
	payload := map[string]any{"type": typ, "uuid": uuid, "orderNo": o.ExternalNo, "content": content, "self": true, "clientType": "web", "createTime": time.Now().UnixMilli(), "sendStatus": 0}
	transport := "persistent"
	if err = s.sendViaLiveChatConn(o.AccountID, payload); err != nil {
		// When the HTTP server and workers are separate processes there is no
		// in-process socket registry. Fall back to the documented credential ->
		// WSS flow so sending remains correct in horizontally scaled installs.
		transport = "direct-fallback"
		cred, credErr := s.svc.Credential(r.Context(), u.TenantID, o.AccountID)
		if credErr != nil {
			replyDBError(w, credErr)
			return
		}
		cr, callErr := s.svc.Binance.Call(r.Context(), s.svc.BinanceCredential(cred), "retrieveChatCredential", nil, nil, false)
		s.updateUsage(r.Context(), u.TenantID, "api_requests", 1)
		if callErr != nil {
			writeJSON(w, 502, envelope{"error": "chat_credential_failed", "message": friendlyBinanceError(callErr)})
			return
		}
		d := responseDataMap(cr)
		base := mapString(d, "chatWssUrl")
		key := mapString(d, "listenKey")
		token := mapString(d, "listenToken")
		if base == "" || key == "" || token == "" {
			writeJSON(w, 502, envelope{"error": "invalid_chat_credential"})
			return
		}
		wsURL := strings.TrimRight(base, "/") + "/" + url.PathEscape(key) + "?token=" + url.QueryEscape(token) + "&clientType=web"
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		defer cancel()
		ws, dialErr := binance.DialWebSocket(ctx, wsURL)
		if dialErr != nil {
			writeJSON(w, 502, envelope{"error": "chat_ws_connect_failed", "message": dialErr.Error()})
			return
		}
		if writeErr := ws.WriteJSON(payload); writeErr != nil {
			_ = ws.Close()
			writeJSON(w, 502, envelope{"error": "chat_ws_send_failed", "message": writeErr.Error()})
			return
		}
		_ = ws.Close()
	}

	id, err := s.insertChat(r.Context(), u.TenantID, o.AccountID, o.ID, "", uuid, typ, func() string {
		if typ == "text" {
			return message
		}
		return ""
	}(), imageURL, u.Name, true, "sent", time.Now().UTC())
	if err != nil {
		replyDBError(w, err)
		return
	}
	s.updateUsage(r.Context(), u.TenantID, "chat_messages", 1)
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "binance_chat_message_sent", "order", asString(o.ID), r, map[string]any{"uuid": uuid, "type": typ, "transport": transport})
	s.svc.Publish(r.Context(), events.Event{TenantID: u.TenantID, Type: "chat.message", Data: map[string]any{"orderId": o.ID, "chatId": id}})
	writeJSON(w, 200, map[string]any{"ok": true, "transport": transport, "chat": map[string]any{"id": id, "type": typ, "content": message, "imageUrl": imageURL, "senderName": u.Name, "self": true, "status": "sent", "binanceMessageId": uuid, "sentAt": time.Now().UTC()}, "order": s.orderMap(r.Context(), u, o, true)})
}

func allowImageRequest(accountID int64) bool {
	now := time.Now()
	cut := now.Add(-time.Minute)
	chatImageRate.Lock()
	defer chatImageRate.Unlock()
	arr := chatImageRate.hits[accountID]
	j := 0
	for _, t := range arr {
		if t.After(cut) {
			arr[j] = t
			j++
		}
	}
	arr = arr[:j]
	if len(arr) >= 35 {
		chatImageRate.hits[accountID] = arr
		return false
	}
	chatImageRate.hits[accountID] = append(arr, now)
	return true
}
func (s *Server) uploadBinanceChatImage(ctx context.Context, u ctxUser, o orderRecord, dataURL, name string) (string, error) {
	if !allowImageRequest(o.AccountID) {
		return "", fmt.Errorf("Binance image pre-signed URL rate limit reached; retry shortly")
	}
	cred, err := s.svc.Credential(ctx, u.TenantID, o.AccountID)
	if err != nil {
		return "", err
	}
	res, err := s.svc.Binance.Call(ctx, s.svc.BinanceCredential(cred), "getChatImagePreSignedUrl", nil, map[string]any{"imageName": name}, false)
	s.updateUsage(ctx, u.TenantID, "api_requests", 1)
	if err != nil {
		return "", err
	}
	d := responseDataMap(res)
	pre := mapString(d, "preSignedUrl", "presignedUrl")
	img := mapString(d, "imageUrl")
	if pre == "" || img == "" {
		return "", fmt.Errorf("Binance did not return preSignedUrl/imageUrl")
	}
	comma := strings.Index(dataURL, ",")
	payload64 := dataURL
	if comma >= 0 {
		payload64 = dataURL[comma+1:]
	}
	b, err := base64.StdEncoding.DecodeString(payload64)
	if err != nil {
		return "", err
	}
	if int64(len(b)) > s.cfg.MaxUploadBytes {
		return "", fmt.Errorf("image too large")
	}
	req, err := http.NewRequestWithContext(ctx, "PUT", pre, bytes.NewReader(b))
	if err != nil {
		return "", err
	}
	resHTTP, err := s.svc.Binance.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resHTTP.Body.Close()
	if resHTTP.StatusCode < 200 || resHTTP.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resHTTP.Body, 4096))
		return "", fmt.Errorf("pre-signed upload failed %d %s", resHTTP.StatusCode, string(body))
	}
	s.updateUsage(ctx, u.TenantID, "storage_bytes", int64(len(b)))
	return img, nil
}

// registerLiveChatConn exposes a worker-owned Binance chat WebSocket to the
// HTTP process when workers run in-process. Horizontal deployments may run
// workers separately; binanceChatSend keeps a direct-connect fallback for that
// case, so this is an optimization rather than a correctness dependency.
func (s *Server) registerLiveChatConn(accountID int64, ws *binance.WSConn) {
	if accountID <= 0 || ws == nil {
		return
	}
	s.chatMu.Lock()
	s.chatConns[accountID] = ws
	s.chatMu.Unlock()
}

func (s *Server) unregisterLiveChatConn(accountID int64, ws *binance.WSConn) {
	s.chatMu.Lock()
	if current := s.chatConns[accountID]; current == ws {
		delete(s.chatConns, accountID)
	}
	s.chatMu.Unlock()
}

func (s *Server) sendViaLiveChatConn(accountID int64, payload any) error {
	s.chatMu.RLock()
	ws := s.chatConns[accountID]
	s.chatMu.RUnlock()
	if ws == nil {
		return fmt.Errorf("persistent chat connection unavailable")
	}
	if err := ws.WriteJSON(payload); err != nil {
		s.unregisterLiveChatConn(accountID, ws)
		return err
	}
	return nil
}
