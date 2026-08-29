package httpapi

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"net/http"
	"strings"
	"time"
)

var notificationCategories = []map[string]any{
	{"id": "orders", "label": "Orders", "description": "New orders, status and assignment updates."},
	{"id": "messages", "label": "Messages", "description": "New Binance/P2P chat messages."},
	{"id": "payments", "label": "Payments", "description": "Payment account and split updates."},
	{"id": "accounting", "label": "Accounting", "description": "Accounting, closing and approval events."},
	{"id": "system", "label": "System", "description": "System and API health updates."},
	{"id": "security", "label": "Security", "description": "Login and security changes.", "mandatory": true},
	{"id": "billing", "label": "Billing", "description": "Invoices, subscription and payment updates."},
}

func (s *Server) registerNotificationRoutes() {
	s.mux.HandleFunc("GET /api/notifications", s.requireUser(s.notificationsGet))
	s.mux.HandleFunc("PATCH /api/notifications", s.requireUser(s.notificationsPatch))
	s.mux.HandleFunc("POST /api/notifications", s.requireUser(s.notificationsPost))
	s.mux.HandleFunc("GET /api/notification-center", s.requireUser(s.notificationCenter))
	s.mux.HandleFunc("GET /api/push", s.requireUser(s.pushConfig))
	s.mux.HandleFunc("PATCH /api/push/scope", s.requireUser(s.pushScope))
	s.mux.HandleFunc("POST /api/push/subscribe", s.requireUser(s.pushSubscribe))
	s.mux.HandleFunc("DELETE /api/push/subscribe", s.requireUser(s.pushUnsubscribe))
}

func defaultNotificationPrefs() map[string]any {
	out := map[string]any{}
	for _, ch := range []string{"inApp", "email", "push"} {
		m := map[string]any{}
		for _, c := range notificationCategories {
			m[asString(c["id"])] = true
		}
		out[ch] = m
	}
	return out
}
func (s *Server) notificationPrefs(ctx context.Context, u ctxUser) map[string]any {
	base := defaultNotificationPrefs()
	rows, err := s.store.DB.QueryContext(ctx, `SELECT category,in_app,email,push FROM notification_preferences WHERE user_id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), u.ID, u.TenantID)
	loaded := false
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var cat string
			var inApp, email, push bool
			if rows.Scan(&cat, &inApp, &email, &push) == nil {
				loaded = true
				base["inApp"].(map[string]any)[cat] = inApp
				base["email"].(map[string]any)[cat] = email
				base["push"].(map[string]any)[cat] = push
			}
		}
	}
	if !loaded {
		var raw string
		if s.store.DB.QueryRowContext(ctx, `SELECT notifications_json FROM user_preferences WHERE user_id=`+s.store.Bind(1), u.ID).Scan(&raw) == nil {
			base = mergeMaps(base, jsonMap(raw))
		}
	}
	// Security alerts are mandatory regardless of stale/imported preference data.
	for _, ch := range []string{"inApp", "email", "push"} {
		if m, ok := base[ch].(map[string]any); ok {
			m["security"] = true
		}
	}
	return base
}
func (s *Server) recentNotifications(ctx context.Context, u ctxUser, limit int) []map[string]any {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	q := `SELECT n.id,n.kind,n.title,n.body,n.data_json,CASE WHEN n.user_id IS NULL THEN COALESCE(ns.is_read,FALSE) ELSE n.is_read END,n.created_at FROM notifications n LEFT JOIN notification_user_states ns ON ns.notification_id=n.id AND ns.user_id=` + s.store.Bind(1) + ` WHERE n.tenant_id=` + s.store.Bind(2) + ` AND (n.user_id IS NULL OR n.user_id=` + s.store.Bind(1) + `) ORDER BY n.id DESC LIMIT ` + asString(limit)
	rows, e := s.store.DB.QueryContext(ctx, q, u.ID, u.TenantID)
	if e != nil {
		return nil
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var kind, title, body, raw string
		var read bool
		var at time.Time
		if rows.Scan(&id, &kind, &title, &body, &raw, &read, &at) == nil {
			d := jsonMap(raw)
			cat := firstNonEmpty(mapString(d, "category"), kind)
			m := map[string]any{"id": id, "kind": kind, "type": kind, "category": cat, "title": title, "message": body, "body": body, "read": read, "status": func() string {
				if read {
					return "read"
				}
				return "unread"
			}(), "createdAt": at, "data": d, "orderId": mapInt64(d, "orderId")}
			out = append(out, m)
		}
	}
	return out
}
func (s *Server) notificationsGet(w http.ResponseWriter, r *http.Request, u ctxUser) {
	writeJSON(w, 200, map[string]any{"items": s.recentNotifications(r.Context(), u, 250), "preferences": s.notificationPrefs(r.Context(), u), "categories": notificationCategories, "backgroundNotifications": s.pushConfigData(r.Context(), u, strings.TrimSpace(r.Header.Get("X-P2PFlow-Device-Id")))})
}
func (s *Server) notificationsPatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	p := in
	if m, ok := in["preferences"].(map[string]any); ok {
		p = m
	}
	defaults := defaultNotificationPrefs()
	for _, ch := range []string{"inApp", "email", "push"} {
		src, _ := p[ch].(map[string]any)
		dst := defaults[ch].(map[string]any)
		for _, c := range notificationCategories {
			id := asString(c["id"])
			if c["mandatory"] == true {
				dst[id] = true
				continue
			}
			if v, ok := src[id]; ok {
				dst[id] = mapBool(map[string]any{"v": v}, "v")
			}
		}
	}
	raw := rawJSON(defaults)
	if s.store.Driver == "postgres" {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO user_preferences(user_id,tenant_id,order_accepting,ready_to_receive_orders,notifications_json,ui_json,updated_at) VALUES($1,$2,TRUE,TRUE,$3,'{}',CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET notifications_json=EXCLUDED.notifications_json,updated_at=CURRENT_TIMESTAMP`, u.ID, u.TenantID, raw)
	} else {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO user_preferences(user_id,tenant_id,order_accepting,ready_to_receive_orders,notifications_json,ui_json,updated_at) VALUES(?,?,TRUE,TRUE,?,'{}',CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE notifications_json=VALUES(notifications_json),updated_at=CURRENT_TIMESTAMP`, u.ID, u.TenantID, raw)
	}
	for _, c := range notificationCategories {
		cat := asString(c["id"])
		inApp := mapBool(defaults["inApp"].(map[string]any), cat)
		email := mapBool(defaults["email"].(map[string]any), cat)
		push := mapBool(defaults["push"].(map[string]any), cat)
		if c["mandatory"] == true {
			inApp, email, push = true, true, true
		}
		if s.store.Driver == "postgres" {
			_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO notification_preferences(tenant_id,user_id,category,in_app,email,push,updated_at) VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP) ON CONFLICT(user_id,category) DO UPDATE SET in_app=EXCLUDED.in_app,email=EXCLUDED.email,push=EXCLUDED.push,updated_at=CURRENT_TIMESTAMP`, u.TenantID, u.ID, cat, inApp, email, push)
		} else {
			_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO notification_preferences(tenant_id,user_id,category,in_app,email,push,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE in_app=VALUES(in_app),email=VALUES(email),push=VALUES(push),updated_at=CURRENT_TIMESTAMP`, u.TenantID, u.ID, cat, inApp, email, push)
		}
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "notification_preferences_updated", "user", asString(u.ID), r, nil)
	writeJSON(w, 200, map[string]any{"ok": true, "preferences": defaults, "categories": notificationCategories, "backgroundNotifications": s.pushConfigData(r.Context(), u, strings.TrimSpace(r.Header.Get("X-P2PFlow-Device-Id"))), "message": "Notification preferences saved."})
}
func (s *Server) notificationsPost(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	if id := mapInt64(in, "notificationId"); id > 0 {
		var recipient sql.NullInt64
		if err := s.store.DB.QueryRowContext(r.Context(), `SELECT user_id FROM notifications WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` AND (user_id IS NULL OR user_id=`+s.store.Bind(3)+`)`, id, u.TenantID, u.ID).Scan(&recipient); err != nil {
			writeJSON(w, 404, envelope{"error": "not_found"})
			return
		}
		if recipient.Valid {
			_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE notifications SET is_read=TRUE WHERE id=`+s.store.Bind(1)+` AND user_id=`+s.store.Bind(2), id, u.ID)
		} else if s.store.Driver == "postgres" {
			_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO notification_user_states(notification_id,tenant_id,user_id,is_read,read_at,created_at) VALUES($1,$2,$3,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(notification_id,user_id) DO UPDATE SET is_read=TRUE,read_at=CURRENT_TIMESTAMP`, id, u.TenantID, u.ID)
		} else {
			_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO notification_user_states(notification_id,tenant_id,user_id,is_read,read_at,created_at) VALUES(?,?,?,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE is_read=TRUE,read_at=CURRENT_TIMESTAMP`, id, u.TenantID, u.ID)
		}
		writeJSON(w, 200, map[string]any{"ok": true, "notificationId": id})
		return
	}
	if mapBool(in, "markRead") {
		res, _ := s.store.DB.ExecContext(r.Context(), `UPDATE notifications SET is_read=TRUE WHERE tenant_id=`+s.store.Bind(1)+` AND user_id=`+s.store.Bind(2)+` AND is_read=FALSE`, u.TenantID, u.ID)
		n, _ := res.RowsAffected()
		if s.store.Driver == "postgres" {
			_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO notification_user_states(notification_id,tenant_id,user_id,is_read,read_at,created_at) SELECT id,tenant_id,$1,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM notifications WHERE tenant_id=$2 AND user_id IS NULL ON CONFLICT(notification_id,user_id) DO UPDATE SET is_read=TRUE,read_at=CURRENT_TIMESTAMP`, u.ID, u.TenantID)
		} else {
			_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO notification_user_states(notification_id,tenant_id,user_id,is_read,read_at,created_at) SELECT id,tenant_id,?,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM notifications WHERE tenant_id=? AND user_id IS NULL ON DUPLICATE KEY UPDATE is_read=TRUE,read_at=CURRENT_TIMESTAMP`, u.ID, u.TenantID)
		}
		markedMessages := int64(0)
		if _, ok := in["includeChats"]; !ok || mapBool(in, "includeChats") {
			// Set-based unread watermark update avoids one query per order.
			if s.store.Driver == "postgres" {
				_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO chat_read_states(tenant_id,user_id,order_id,last_read_chat_id,updated_at) SELECT c.tenant_id,$1,c.order_id,MAX(c.id),CURRENT_TIMESTAMP FROM chats c WHERE c.tenant_id=$2 AND c.is_self=FALSE GROUP BY c.tenant_id,c.order_id ON CONFLICT(user_id,order_id) DO UPDATE SET last_read_chat_id=EXCLUDED.last_read_chat_id,updated_at=CURRENT_TIMESTAMP`, u.ID, u.TenantID)
			} else {
				_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO chat_read_states(tenant_id,user_id,order_id,last_read_chat_id,updated_at) SELECT c.tenant_id,?,c.order_id,MAX(c.id),CURRENT_TIMESTAMP FROM chats c WHERE c.tenant_id=? AND c.is_self=FALSE GROUP BY c.tenant_id,c.order_id ON DUPLICATE KEY UPDATE last_read_chat_id=VALUES(last_read_chat_id),updated_at=CURRENT_TIMESTAMP`, u.ID, u.TenantID)
			}
			_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(DISTINCT order_id) FROM chats WHERE tenant_id=`+s.store.Bind(1)+` AND is_self=FALSE`, u.TenantID).Scan(&markedMessages)
		}
		writeJSON(w, 200, map[string]any{"ok": true, "markedNotifications": n, "markedMessages": markedMessages})
		return
	}
	writeJSON(w, 400, envelope{"error": "invalid_action"})
}
func (s *Server) notificationCenter(w http.ResponseWriter, r *http.Request, u ctxUser) {
	items := []map[string]any{}
	nitems := s.recentNotifications(r.Context(), u, 80)
	notificationTotal := 0
	for _, n := range nitems {
		if n["read"] == false {
			n["kind"] = "notification"
			items = append(items, n)
			notificationTotal++
		}
	}
	unreadSQL := `SELECT x.order_id,x.external_order_no,x.last_id,x.unread_count,x.last_at,c.content,c.sender_name FROM (SELECT o.id AS order_id,o.external_order_no,MAX(c.id) AS last_id,COUNT(c.id) AS unread_count,MAX(c.sent_at) AS last_at FROM orders o JOIN chats c ON c.order_id=o.id AND c.is_self=FALSE LEFT JOIN chat_read_states rs ON rs.order_id=o.id AND rs.user_id=` + s.store.Bind(1) + ` WHERE o.tenant_id=` + s.store.Bind(2) + ` AND c.id>COALESCE(rs.last_read_chat_id,0) GROUP BY o.id,o.external_order_no) x JOIN chats c ON c.id=x.last_id ORDER BY x.last_at DESC LIMIT 30`
	rows, _ := s.store.DB.QueryContext(r.Context(), unreadSQL, u.ID, u.TenantID)
	chatTotal := int64(0)
	if rows != nil {
		for rows.Next() {
			var oid, last, count int64
			var no, content, sender string
			var at time.Time
			if rows.Scan(&oid, &no, &last, &count, &at, &content, &sender) == nil {
				items = append(items, map[string]any{"kind": "chat", "type": "chat_message", "title": "New message", "userName": firstNonEmpty(sender, "Counterparty"), "message": firstNonEmpty(content, "New Binance message"), "orderId": oid, "orderNo": no, "createdAt": at, "count": count})
				chatTotal += count
			}
		}
		rows.Close()
	}
	writeJSON(w, 200, map[string]any{"total": int64(notificationTotal) + chatTotal, "notificationTotal": notificationTotal, "chatTotal": chatTotal, "items": items})
}
func (s *Server) pushConfigData(ctx context.Context, u ctxUser, deviceID string) map[string]any {
	var total int
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM push_subscriptions ps JOIN trusted_devices td ON td.id=ps.trusted_device_id AND td.user_id=ps.user_id AND td.tenant_id=ps.tenant_id WHERE ps.user_id=`+s.store.Bind(1)+` AND ps.tenant_id=`+s.store.Bind(2)+` AND ps.disabled_at IS NULL AND td.revoked_at IS NULL AND td.expires_at>CURRENT_TIMESTAMP`, u.ID, u.TenantID).Scan(&total)
	supported := strings.TrimSpace(s.cfg.VAPIDPrivateKey) != "" && strings.TrimSpace(s.cfg.VAPIDSubject) != ""
	publicKey := ""
	delivery := "disabled: configure VAPID_PRIVATE_KEY and VAPID_SUBJECT"
	if supported {
		if k, err := vapidPublicKey(s.cfg.VAPIDPrivateKey, s.cfg.VAPIDPublicKey); err == nil {
			publicKey = k
			delivery = "rfc8291-aes128gcm-vapid"
		} else {
			supported = false
			delivery = "invalid VAPID configuration"
		}
	}
	currentSubscribed := false
	currentCredentialID := int64(0)
	deviceTrusted := false
	deviceID = strings.TrimSpace(deviceID)
	if deviceID != "" {
		var trustedCount, count int
		var credential sql.NullInt64
		q := `SELECT COUNT(td.id),COUNT(ps.id),MAX(ps.exchange_account_id) FROM trusted_devices td LEFT JOIN push_subscriptions ps ON ps.trusted_device_id=td.id AND ps.user_id=td.user_id AND ps.disabled_at IS NULL WHERE td.user_id=` + s.store.Bind(1) + ` AND td.tenant_id=` + s.store.Bind(2) + ` AND td.device_hash=` + s.store.Bind(3) + ` AND td.revoked_at IS NULL AND td.expires_at>CURRENT_TIMESTAMP`
		if s.store.DB.QueryRowContext(ctx, q, u.ID, u.TenantID, hashToken(deviceID)).Scan(&trustedCount, &count, &credential) == nil {
			deviceTrusted = trustedCount > 0
			currentSubscribed = deviceTrusted && count > 0
			if credential.Valid {
				currentCredentialID = credential.Int64
			}
		}
	}
	return map[string]any{
		"enabled": supported, "serverEnabled": supported, "supported": supported,
		"subscribed": total > 0, "subscriptionCount": total,
		"currentDeviceSubscribed": currentSubscribed, "currentDeviceTrusted": deviceTrusted,
		"currentDeviceNotificationCredentialId": currentCredentialID,
		"publicKey":                             publicKey, "applicationServerKey": publicKey, "vapidPublicKey": publicKey,
		"scope":    map[string]any{"tenantId": u.TenantID, "userId": u.ID, "notificationCredentialId": currentCredentialID},
		"delivery": delivery,
	}
}
func (s *Server) pushConfig(w http.ResponseWriter, r *http.Request, u ctxUser) {
	writeJSON(w, 200, s.pushConfigData(r.Context(), u, strings.TrimSpace(r.Header.Get("X-P2PFlow-Device-Id"))))
}
func (s *Server) pushScope(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	deviceID := firstNonEmpty(mapString(in, "deviceId"), strings.TrimSpace(r.Header.Get("X-P2PFlow-Device-Id")))
	credentialID := mapInt64(in, "notificationCredentialId", "credentialId")
	if deviceID == "" {
		writeJSON(w, 422, envelope{"error": "trusted_device_required"})
		return
	}
	var trustedID int64
	if s.store.DB.QueryRowContext(r.Context(), `SELECT id FROM trusted_devices WHERE user_id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` AND device_hash=`+s.store.Bind(3)+` AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP`, u.ID, u.TenantID, hashToken(deviceID)).Scan(&trustedID) != nil {
		writeJSON(w, 403, envelope{"error": "trusted_device_required"})
		return
	}
	if credentialID > 0 {
		var n int
		_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM exchange_accounts WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` AND status='active'`, credentialID, u.TenantID).Scan(&n)
		if n == 0 || (!u.IsOwner && !u.IsSuperAdmin && !s.accountPerm(r.Context(), u, credentialID, "orders.view") && !s.accountPerm(r.Context(), u, credentialID, "binance.chat")) {
			writeJSON(w, 403, envelope{"error": "credential_scope_forbidden"})
			return
		}
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE push_subscriptions SET exchange_account_id=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE trusted_device_id=`+s.store.Bind(2)+` AND user_id=`+s.store.Bind(3)+` AND disabled_at IS NULL`, nullInt64Value(credentialID), trustedID, u.ID)
	_ = s.svc.SetSetting(r.Context(), "user", u.ID, "push_scope", map[string]any{"deviceIdHash": hashToken(deviceID), "notificationCredentialId": credentialID})
	out := s.pushConfigData(r.Context(), u, deviceID)
	out["ok"] = true
	writeJSON(w, 200, out)
}

func (s *Server) pushSubscribe(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	sub := in
	if m, ok := in["subscription"].(map[string]any); ok {
		sub = m
	}
	deviceID := firstNonEmpty(mapString(in, "deviceId"), strings.TrimSpace(r.Header.Get("X-P2PFlow-Device-Id")))
	if deviceID == "" {
		writeJSON(w, 422, envelope{"error": "trusted_device_required"})
		return
	}
	var trustedID int64
	if s.store.DB.QueryRowContext(r.Context(), `SELECT id FROM trusted_devices WHERE user_id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` AND device_hash=`+s.store.Bind(3)+` AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP`, u.ID, u.TenantID, hashToken(deviceID)).Scan(&trustedID) != nil {
		writeJSON(w, 403, envelope{"error": "trusted_device_required"})
		return
	}
	endpoint := mapString(sub, "endpoint")
	if endpoint == "" {
		writeJSON(w, 422, envelope{"error": "endpoint_required"})
		return
	}
	if _, err := validatePushEndpoint(endpoint); err != nil {
		writeJSON(w, 422, envelope{"error": "invalid_push_endpoint", "message": err.Error()})
		return
	}
	keys, _ := sub["keys"].(map[string]any)
	p256dh, auth := mapString(keys, "p256dh"), mapString(keys, "auth")
	pubBytes, pubErr := decodeRawURLBase64(p256dh)
	authBytes, authErr := decodeRawURLBase64(auth)
	if pubErr != nil || authErr != nil || len(pubBytes) != 65 || len(authBytes) < 16 {
		writeJSON(w, 422, envelope{"error": "invalid_push_keys"})
		return
	}
	credentialID := mapInt64(in, "notificationCredentialId", "credentialId")
	if credentialID > 0 {
		var n int
		_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM exchange_accounts WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` AND status='active'`, credentialID, u.TenantID).Scan(&n)
		if n == 0 || (!u.IsOwner && !u.IsSuperAdmin && !s.accountPerm(r.Context(), u, credentialID, "orders.view") && !s.accountPerm(r.Context(), u, credentialID, "binance.chat")) {
			writeJSON(w, 403, envelope{"error": "credential_scope_forbidden"})
			return
		}
	}
	sum := sha256.Sum256([]byte(endpoint))
	h := hex.EncodeToString(sum[:])
	scopeObj := map[string]any{"deviceIdHash": hashToken(deviceID), "notificationCredentialId": credentialID}
	scope := rawJSON(scopeObj)
	if s.store.Driver == "postgres" {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO push_subscriptions(tenant_id,user_id,endpoint_hash,endpoint,p256dh,auth,scope_json,user_agent,trusted_device_id,exchange_account_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,endpoint_hash) DO UPDATE SET endpoint=EXCLUDED.endpoint,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,scope_json=EXCLUDED.scope_json,user_agent=EXCLUDED.user_agent,trusted_device_id=EXCLUDED.trusted_device_id,exchange_account_id=EXCLUDED.exchange_account_id,disabled_at=NULL,updated_at=CURRENT_TIMESTAMP`, u.TenantID, u.ID, h, endpoint, p256dh, auth, scope, r.UserAgent(), trustedID, nullInt64Value(credentialID))
	} else {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO push_subscriptions(tenant_id,user_id,endpoint_hash,endpoint,p256dh,auth,scope_json,user_agent,trusted_device_id,exchange_account_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE endpoint=VALUES(endpoint),p256dh=VALUES(p256dh),auth=VALUES(auth),scope_json=VALUES(scope_json),user_agent=VALUES(user_agent),trusted_device_id=VALUES(trusted_device_id),exchange_account_id=VALUES(exchange_account_id),disabled_at=NULL,updated_at=CURRENT_TIMESTAMP`, u.TenantID, u.ID, h, endpoint, p256dh, auth, scope, r.UserAgent(), trustedID, nullInt64Value(credentialID))
	}
	_ = s.svc.SetSetting(r.Context(), "user", u.ID, "push_scope", scopeObj)
	out := s.pushConfigData(r.Context(), u, deviceID)
	out["ok"] = true
	writeJSON(w, 200, out)
}

func (s *Server) pushUnsubscribe(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	_ = decode(w, r, &in)
	endpoint := mapString(in, "endpoint")
	deviceID := firstNonEmpty(mapString(in, "deviceId"), strings.TrimSpace(r.Header.Get("X-P2PFlow-Device-Id")))
	trustedID := int64(0)
	if deviceID != "" {
		_ = s.store.DB.QueryRowContext(r.Context(), `SELECT id FROM trusted_devices WHERE user_id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` AND device_hash=`+s.store.Bind(3), u.ID, u.TenantID, hashToken(deviceID)).Scan(&trustedID)
	}
	if endpoint != "" {
		sum := sha256.Sum256([]byte(endpoint))
		args := []any{u.ID, hex.EncodeToString(sum[:])}
		q := `UPDATE push_subscriptions SET disabled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=` + s.store.Bind(1) + ` AND endpoint_hash=` + s.store.Bind(2)
		if trustedID > 0 {
			q += ` AND trusted_device_id=` + s.store.Bind(3)
			args = append(args, trustedID)
		}
		_, _ = s.store.DB.ExecContext(r.Context(), q, args...)
	} else if trustedID > 0 {
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE push_subscriptions SET disabled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=`+s.store.Bind(1)+` AND trusted_device_id=`+s.store.Bind(2), u.ID, trustedID)
	} else {
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE push_subscriptions SET disabled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=`+s.store.Bind(1), u.ID)
	}
	out := s.pushConfigData(r.Context(), u, deviceID)
	out["ok"] = true
	writeJSON(w, 200, out)
}

func nullInt64Value(v int64) any {
	if v <= 0 {
		return nil
	}
	return v
}
