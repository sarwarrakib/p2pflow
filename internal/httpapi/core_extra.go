package httpapi

import (
	"database/sql"
	"net/http"
	"time"
)

func (s *Server) bootstrap(w http.ResponseWriter, r *http.Request, u ctxUser) {
	ctx := r.Context()
	methods := []map[string]any{}
	if rows, err := s.store.DB.QueryContext(ctx, `SELECT DISTINCT identifier,name FROM exchange_payment_methods WHERE tenant_id=`+s.store.Bind(1)+` AND active=TRUE ORDER BY name`, u.TenantID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var id, name string
			if rows.Scan(&id, &name) == nil {
				methods = append(methods, map[string]any{"id": stableMethodID(id), "code": id, "identifier": id, "name": firstNonEmpty(name, id)})
			}
		}
	}
	agents := []map[string]any{}
	if rows, err := s.store.DB.QueryContext(ctx, `SELECT id,username,name,role_code,status,last_seen_at FROM users WHERE tenant_id=`+s.store.Bind(1)+` AND status='active' ORDER BY is_owner DESC,id`, u.TenantID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var id int64
			var username, name, role, status string
			var last sql.NullTime
			if rows.Scan(&id, &username, &name, &role, &status, &last) == nil {
				agents = append(agents, map[string]any{"id": id, "userId": id, "username": username, "name": name, "role": role, "enabled": status == "active", "online": last.Valid && time.Since(last.Time) < 2*time.Minute, "agentId": id})
			}
		}
	}
	accountUsers := []map[string]any{}
	if u.IsOwner || u.IsSuperAdmin || s.hasPerm(u, "accounts.manage") {
		for _, a := range agents {
			accountUsers = append(accountUsers, map[string]any{"id": a["id"], "username": a["username"], "name": a["name"], "role": a["role"], "agentId": a["id"]})
		}
	} else if s.hasPerm(u, "accounts.manage") || s.hasPerm(u, "accounts.use") {
		accountUsers = append(accountUsers, map[string]any{"id": u.ID, "username": u.Username, "name": u.Name, "role": u.Role, "agentId": u.ID})
	}
	notifications := s.recentNotifications(ctx, u, 50)
	settings := s.publicSettings(ctx, u.TenantID)
	settings["applicationVersion"] = s.cfg.Version
	writeJSON(w, http.StatusOK, map[string]any{
		"user": s.userSafe(ctx, u), "csrfToken": s.csrfToken(r), "orderAcceptance": s.orderAcceptance(ctx, u.ID),
		"paymentMethods": methods, "agents": agents, "accountUsers": accountUsers,
		"paymentAccountScope": map[string]any{"manageAll": u.IsOwner || u.IsSuperAdmin || s.hasPerm(u, "accounts.manage"), "ownerUserId": u.ID},
		"permissions":         s.permissionCatalog(ctx), "userRoles": s.rolesData(ctx, u.TenantID), "settings": settings, "notifications": notifications,
		"billing": s.currentSubscription(ctx, u.TenantID),
		"version": s.cfg.Version,
	})
}

func (s *Server) dashboard(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.hasPerm(u, "dashboard.view") && !s.hasPerm(u, "orders.view") {
		writeJSON(w, 403, envelope{"error": "forbidden"})
		return
	}
	ctx := r.Context()
	now := time.Now().UTC()
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	var total, open, completed, unread int64
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*),COALESCE(SUM(CASE WHEN LOWER(status) IN ('completed','complete','released','cancelled','canceled','expired') THEN 0 ELSE 1 END),0),COALESCE(SUM(CASE WHEN LOWER(status) IN ('completed','complete','released') THEN 1 ELSE 0 END),0) FROM orders WHERE tenant_id=`+s.store.Bind(1), u.TenantID).Scan(&total, &open, &completed)
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM chats c LEFT JOIN chat_read_states r ON r.order_id=c.order_id AND r.user_id=`+s.store.Bind(1)+` WHERE c.tenant_id=`+s.store.Bind(2)+` AND c.is_self=FALSE AND c.id>COALESCE(r.last_read_chat_id,0)`, u.ID, u.TenantID).Scan(&unread)
	var ads, exchangeAccounts, users, holdOrders, pendingApprovals int64
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM advertisements WHERE tenant_id=`+s.store.Bind(1)+` AND LOWER(status) NOT IN ('4','closed','deleted')`, u.TenantID).Scan(&ads)
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND status='active'`, u.TenantID).Scan(&exchangeAccounts)
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE tenant_id=`+s.store.Bind(1)+` AND status='active'`, u.TenantID).Scan(&users)
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM orders WHERE tenant_id=`+s.store.Bind(1)+` AND LOWER(status) IN ('manager_queue','hold','on_hold','pending_manager')`, u.TenantID).Scan(&holdOrders)
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM approvals WHERE tenant_id=`+s.store.Bind(1)+` AND status='pending'`, u.TenantID).Scan(&pendingApprovals)

	var buySentToday, sellReceivedToday float64
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COALESCE(SUM(CASE WHEN direction IN ('send','cashout','out') THEN ABS(amount) ELSE 0 END),0),COALESCE(SUM(CASE WHEN direction IN ('receive','topup','in') THEN ABS(amount) ELSE 0 END),0) FROM payment_account_ledger WHERE tenant_id=`+s.store.Bind(1)+` AND created_at>=`+s.store.Bind(2), u.TenantID, dayStart).Scan(&buySentToday, &sellReceivedToday)

	type accountDash struct {
		ID      int64
		OwnerID int64
		Method  string
		Active  bool
		Balance float64
		BuyCap  float64
		SellCap float64
		RecvCap float64
	}
	accounts := make([]accountDash, 0)
	accountRows, err := s.store.DB.QueryContext(ctx, `SELECT id,COALESCE(user_id,0),method_identifier,status,details_json FROM payment_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND status<>'deleted' ORDER BY id`, u.TenantID)
	if err == nil {
		defer accountRows.Close()
		for accountRows.Next() {
			var id, owner int64
			var method, status, raw string
			if accountRows.Scan(&id, &owner, &method, &status, &raw) != nil {
				continue
			}
			details := jsonMap(raw)
			balance := s.currentPaymentBalance(ctx, id, details)
			received, sent := s.paymentTodayUsage(ctx, id)
			sendLimit := asFloat(details["sendLimit"])
			receiveLimit := asFloat(details["receiveLimit"])
			buyCap := max0(balance)
			if sendLimit > 0 {
				remaining := max0(sendLimit - sent)
				if balance > 0 && remaining > balance {
					remaining = balance
				}
				buyCap = remaining
			}
			sellCap := 0.0
			if receiveLimit > 0 {
				sellCap = max0(receiveLimit - received)
			}
			accounts = append(accounts, accountDash{ID: id, OwnerID: owner, Method: firstNonEmpty(method, "Payment"), Active: status == "active", Balance: balance, BuyCap: buyCap, SellCap: sellCap, RecvCap: sellCap})
		}
	}

	methodIndex := map[string]map[string]any{}
	var totalCashBalance, buyCapacity, sellReceiveCapacity float64
	for _, a := range accounts {
		totalCashBalance += a.Balance
		if a.Active {
			buyCapacity += a.BuyCap
			sellReceiveCapacity += a.SellCap
		}
		m := methodIndex[a.Method]
		if m == nil {
			m = map[string]any{"paymentMethodId": stableMethodID(a.Method), "code": a.Method, "name": a.Method, "accountCount": int64(0), "activeAccountCount": int64(0), "buyCapacity": 0.0, "sellReceiveCapacity": 0.0, "receiveLimitCapacity": 0.0, "binanceAssetCapacity": 0.0, "currentBalance": 0.0}
			methodIndex[a.Method] = m
		}
		m["accountCount"] = asInt64(m["accountCount"]) + 1
		m["currentBalance"] = asFloat(m["currentBalance"]) + a.Balance
		if a.Active {
			m["activeAccountCount"] = asInt64(m["activeAccountCount"]) + 1
			m["buyCapacity"] = asFloat(m["buyCapacity"]) + a.BuyCap
			m["sellReceiveCapacity"] = asFloat(m["sellReceiveCapacity"]) + a.SellCap
			m["receiveLimitCapacity"] = asFloat(m["receiveLimitCapacity"]) + a.RecvCap
		}
	}
	byMethod := make([]map[string]any, 0, len(methodIndex))
	for _, m := range methodIndex {
		// The supplied C2C SAPI does not expose a generic funding-wallet balance
		// endpoint for this screen, so the safe local capacity is reported here.
		m["binanceAssetCapacity"] = m["sellReceiveCapacity"]
		byMethod = append(byMethod, m)
	}

	byAgent := []map[string]any{}
	userRows, err := s.store.DB.QueryContext(ctx, `SELECT id,name,status,last_seen_at FROM users WHERE tenant_id=`+s.store.Bind(1)+` AND status='active' ORDER BY is_owner DESC,id`, u.TenantID)
	if err == nil {
		defer userRows.Close()
		for userRows.Next() {
			var id int64
			var name, status string
			var last sql.NullTime
			if userRows.Scan(&id, &name, &status, &last) != nil {
				continue
			}
			var accountCount int64
			var currentBalance, userBuyCap, userSellCap float64
			for _, a := range accounts {
				if a.OwnerID != id {
					continue
				}
				accountCount++
				currentBalance += a.Balance
				if a.Active {
					userBuyCap += a.BuyCap
					userSellCap += a.SellCap
				}
			}
			var activeOrders, actions int64
			_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM orders WHERE tenant_id=`+s.store.Bind(1)+` AND assigned_user_id=`+s.store.Bind(2)+` AND LOWER(status) NOT IN ('completed','complete','released','cancelled','canceled','expired')`, u.TenantID, id).Scan(&activeOrders)
			_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM audit_logs WHERE tenant_id=`+s.store.Bind(1)+` AND user_id=`+s.store.Bind(2)+` AND created_at>=`+s.store.Bind(3), u.TenantID, id, dayStart).Scan(&actions)
			online := last.Valid && now.Sub(last.Time) < 3*time.Minute
			presenceStatus := "offline"
			if online {
				presenceStatus = "online"
			}
			byAgent = append(byAgent, map[string]any{"agentId": id, "id": id, "name": name, "status": presenceStatus, "manualStatus": "dynamic", "presence": map[string]any{"status": presenceStatus, "online": online, "page": "", "lastSeenAt": nullTime(last)}, "activityToday": map[string]any{"activeSeconds": 0, "actions": actions}, "accountCount": accountCount, "currentBalance": currentBalance, "buyCapacity": userBuyCap, "sellReceiveCapacity": userSellCap, "activeOrders": activeOrders, "userStatus": status})
		}
	}

	totals := map[string]any{"buySentToday": buySentToday, "sellReceivedToday": sellReceivedToday, "totalCashBalance": totalCashBalance, "buyCapacity": buyCapacity, "sellReceiveCapacity": sellReceiveCapacity, "pendingOrders": open, "holdOrders": holdOrders, "pendingApprovals": pendingApprovals}
	data := map[string]any{
		"totals": totals, "byMethod": byMethod, "byAgent": byAgent, "notifications": s.recentNotifications(ctx, u, 20), "settings": s.publicSettings(ctx, u.TenantID), "lastUpdated": now,
		"orders":      map[string]any{"total": total, "open": open, "completed": completed},
		"summary":     map[string]any{"totalOrders": total, "openOrders": open, "completedOrders": completed, "unreadMessages": unread, "activeAds": ads, "exchangeAccounts": exchangeAccounts, "users": users},
		"totalOrders": total, "openOrders": open, "completedOrders": completed, "unreadMessages": unread, "activeAds": ads, "generatedAt": now,
	}
	if s.hasPerm(u, "accounting.view") {
		data["business"] = map[string]any{"summary": s.computeClosingSummary(r, u), "generatedAt": now}
	}
	writeJSON(w, http.StatusOK, data)
}

func (s *Server) navigationCounts(w http.ResponseWriter, r *http.Request, u ctxUser) {
	ctx := r.Context()
	var orders, chats, approvals int64
	if s.hasPerm(u, "orders.view") {
		_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM orders WHERE tenant_id=`+s.store.Bind(1)+` AND LOWER(status) NOT IN ('completed','complete','released','cancelled','canceled','expired')`, u.TenantID).Scan(&orders)
		_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM chats c LEFT JOIN chat_read_states r ON r.order_id=c.order_id AND r.user_id=`+s.store.Bind(1)+` WHERE c.tenant_id=`+s.store.Bind(2)+` AND c.is_self=FALSE AND c.id>COALESCE(r.last_read_chat_id,0)`, u.ID, u.TenantID).Scan(&chats)
	}
	if s.hasPerm(u, "approvals.manage") {
		_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM approvals WHERE tenant_id=`+s.store.Bind(1)+` AND status='pending'`, u.TenantID).Scan(&approvals)
	}
	writeJSON(w, http.StatusOK, map[string]any{"orders": orders, "chats": chats, "approvals": approvals, "generatedAt": time.Now().UTC()})
}
