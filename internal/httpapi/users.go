package httpapi

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"p2pflow/v2/internal/events"
	"p2pflow/v2/internal/security"
)

var defaultRolePermissions = map[string][]string{
	"admin":   {"*"},
	"manager": {"dashboard.view", "orders.view", "orders.create", "orders.manage", "orders.assign", "orders.split", "orders.final_action", "orders.quick_release", "binance.sync", "binance.chat", "ads.view", "ads.manage", "p2p.profile.view", "p2p.profile.sync", "accounts.view", "accounts.use", "accounts.manage", "accounts.manage_all", "ledger.adjust", "routing.manage", "users.manage", "roles.manage", "notifications.manage", "reports.view", "accounting.view", "accounting.manage", "accounting.close", "accounting.reopen", "activity.view", "audit.view", "approvals.manage", "extension.manage", "settings.manage", "market.view", "credentials.manage", "billing.view", "billing.manage"},
	"agent":   {"orders.view", "orders.manage", "orders.split", "orders.final_action", "ads.view", "ads.manage", "binance.chat", "p2p.profile.view", "accounts.view", "accounts.use", "accounting.view"},
	"auditor": {"dashboard.view", "orders.view", "ads.view", "p2p.profile.view", "accounts.view", "reports.view", "accounting.view", "activity.view", "audit.view"},
}

func (s *Server) registerUserRoutes() {
	s.mux.HandleFunc("GET /api/agents", s.requirePerm("users.manage", s.agentsList))
	s.mux.HandleFunc("POST /api/agents", s.requirePerm("users.manage", s.agentCreate))
	s.mux.HandleFunc("PATCH /api/agents/{id}", s.requirePerm("users.manage", s.agentUpdate))
	s.mux.HandleFunc("DELETE /api/agents/{id}", s.requirePerm("users.manage", s.agentDelete))
	s.mux.HandleFunc("GET /api/user-roles", s.requireUser(s.rolesList))
	s.mux.HandleFunc("POST /api/user-roles", s.requirePerm("roles.manage", s.roleCreate))
	s.mux.HandleFunc("PATCH /api/user-roles/{id}", s.requirePerm("roles.manage", s.roleUpdate))
	s.mux.HandleFunc("DELETE /api/user-roles/{id}", s.requirePerm("roles.manage", s.roleDelete))
	s.mux.HandleFunc("PATCH /api/me/order-acceptance", s.requireUser(s.orderAcceptancePatch))
	s.mux.HandleFunc("POST /api/activity/heartbeat", s.requireUser(s.activityHeartbeat))
	s.mux.HandleFunc("POST /api/activity/end", s.requireUser(s.activityEnd))
	s.mux.HandleFunc("GET /api/activity/users", s.requirePerm("activity.view", s.activityUsers))
}

func (s *Server) ensureDefaultRoles(ctx context.Context, tenantID int64) error {
	var n int
	if err := s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM roles WHERE tenant_id=`+s.store.Bind(1), tenantID).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	for _, code := range []string{"admin", "manager", "agent", "auditor"} {
		name := strings.ToUpper(code[:1]) + code[1:]
		var roleID int64
		if s.store.Driver == "postgres" {
			err := s.store.DB.QueryRowContext(ctx, `INSERT INTO roles(tenant_id,name,code,system_role,description,enabled,locked,created_at) VALUES($1,$2,$3,$3,$4,TRUE,TRUE,CURRENT_TIMESTAMP) RETURNING id`, tenantID, name, code, name+" role").Scan(&roleID)
			if err != nil {
				return err
			}
		} else {
			res, err := s.store.DB.ExecContext(ctx, `INSERT INTO roles(tenant_id,name,code,system_role,description,enabled,locked,created_at) VALUES(?,?,?,?,?,TRUE,TRUE,CURRENT_TIMESTAMP)`, tenantID, name, code, code, name+" role")
			if err != nil {
				return err
			}
			roleID, _ = res.LastInsertId()
		}
		perms := defaultRolePermissions[code]
		if len(perms) == 1 && perms[0] == "*" {
			rows, err := s.store.DB.QueryContext(ctx, `SELECT id FROM permissions`)
			if err == nil {
				for rows.Next() {
					var pid int64
					if rows.Scan(&pid) == nil {
						_, _ = s.store.DB.ExecContext(ctx, `INSERT INTO role_permissions(role_id,permission_id) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`)`, roleID, pid)
					}
				}
				rows.Close()
			}
		} else {
			for _, p := range perms {
				_, _ = s.store.DB.ExecContext(ctx, `INSERT INTO role_permissions(role_id,permission_id) SELECT `+s.store.Bind(1)+`,id FROM permissions WHERE code=`+s.store.Bind(2), roleID, p)
			}
		}
	}
	// attach owner(s) to admin role
	q := `INSERT INTO user_roles(user_id,role_id) SELECT u.id,r.id FROM users u JOIN roles r ON r.tenant_id=u.tenant_id AND r.code='admin' WHERE u.tenant_id=` + s.store.Bind(1) + ` AND u.is_owner=TRUE`
	if s.store.Driver == "postgres" {
		q += ` ON CONFLICT DO NOTHING`
	} else {
		q = strings.Replace(q, "INSERT INTO", "INSERT IGNORE INTO", 1)
	}
	_, _ = s.store.DB.ExecContext(ctx, q, tenantID)
	return nil
}

func (s *Server) permissionCatalog(ctx context.Context) []string {
	rows, err := s.store.DB.QueryContext(ctx, `SELECT code FROM permissions ORDER BY code`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var x string
		if rows.Scan(&x) == nil {
			out = append(out, x)
		}
	}
	return out
}
func (s *Server) rolesData(ctx context.Context, tenantID int64) []map[string]any {
	_ = s.ensureDefaultRoles(ctx, tenantID)
	permMap := map[int64][]string{}
	pRows, _ := s.store.DB.QueryContext(ctx, `SELECT rp.role_id,p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.tenant_id=`+s.store.Bind(1)+` ORDER BY rp.role_id,p.code`, tenantID)
	if pRows != nil {
		for pRows.Next() {
			var roleID int64
			var code string
			if pRows.Scan(&roleID, &code) == nil {
				permMap[roleID] = append(permMap[roleID], code)
			}
		}
		pRows.Close()
	}
	rows, err := s.store.DB.QueryContext(ctx, `SELECT id,name,code,system_role,description,enabled,locked FROM roles WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY id`, tenantID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id int64
		var name, code, systemRole, desc string
		var enabled, locked bool
		if rows.Scan(&id, &name, &code, &systemRole, &desc, &enabled, &locked) != nil {
			continue
		}
		out = append(out, map[string]any{"id": id, "name": name, "code": code, "systemRole": systemRole, "description": desc, "enabled": enabled, "locked": locked, "permissions": permMap[id]})
	}
	return out
}

func (s *Server) rolesList(w http.ResponseWriter, r *http.Request, u ctxUser) {
	writeJSON(w, 200, map[string]any{"items": s.rolesData(r.Context(), u.TenantID)})
}

func (s *Server) roleCreate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in struct {
		Name, SystemRole, Description string
		Permissions                   []string
	}
	if !decode(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		writeJSON(w, 422, envelope{"error": "Role name required"})
		return
	}
	code := slug(in.Name)
	if i := strings.LastIndex(code, "-"); i > 0 {
		code = code[:i]
	}
	if in.SystemRole == "" {
		in.SystemRole = "agent"
	}
	var id int64
	err := s.svc.WithTx(r.Context(), func(tx *sql.Tx) error {
		if s.store.Driver == "postgres" {
			if err := tx.QueryRowContext(r.Context(), `INSERT INTO roles(tenant_id,name,code,system_role,description,enabled,locked,created_at) VALUES($1,$2,$3,$4,$5,TRUE,FALSE,CURRENT_TIMESTAMP) RETURNING id`, u.TenantID, in.Name, code, in.SystemRole, in.Description).Scan(&id); err != nil {
				return err
			}
		} else {
			res, err := tx.ExecContext(r.Context(), `INSERT INTO roles(tenant_id,name,code,system_role,description,enabled,locked,created_at) VALUES(?,?,?,?,?,TRUE,FALSE,CURRENT_TIMESTAMP)`, u.TenantID, in.Name, code, in.SystemRole, in.Description)
			if err != nil {
				return err
			}
			id, _ = res.LastInsertId()
		}
		return s.replaceRolePermissionsTx(r.Context(), tx, id, in.Permissions)
	})
	if err != nil {
		writeJSON(w, 409, envelope{"error": "role_save_failed"})
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "role_created", "role", asString(id), r, in)
	writeJSON(w, 201, envelope{"ok": true, "id": id})
}
func (s *Server) roleUpdate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	var in struct {
		Name, SystemRole, Description string
		Permissions                   []string
	}
	if !decode(w, r, &in) {
		return
	}
	var locked bool
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT locked FROM roles WHERE tenant_id=`+s.store.Bind(1)+` AND id=`+s.store.Bind(2), u.TenantID, id).Scan(&locked)
	err := s.svc.WithTx(r.Context(), func(tx *sql.Tx) error {
		if locked {
			_, err := tx.ExecContext(r.Context(), `UPDATE roles SET name=`+s.store.Bind(1)+`,description=`+s.store.Bind(2)+` WHERE tenant_id=`+s.store.Bind(3)+` AND id=`+s.store.Bind(4), in.Name, in.Description, u.TenantID, id)
			if err != nil {
				return err
			}
		} else {
			_, err := tx.ExecContext(r.Context(), `UPDATE roles SET name=`+s.store.Bind(1)+`,system_role=`+s.store.Bind(2)+`,description=`+s.store.Bind(3)+` WHERE tenant_id=`+s.store.Bind(4)+` AND id=`+s.store.Bind(5), in.Name, in.SystemRole, in.Description, u.TenantID, id)
			if err != nil {
				return err
			}
		}
		return s.replaceRolePermissionsTx(r.Context(), tx, id, in.Permissions)
	})
	if err != nil {
		writeJSON(w, 409, envelope{"error": "role_save_failed"})
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "role_updated", "role", asString(id), r, in)
	writeJSON(w, 200, envelope{"ok": true})
}
func (s *Server) roleDelete(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	var locked bool
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT locked FROM roles WHERE tenant_id=`+s.store.Bind(1)+` AND id=`+s.store.Bind(2), u.TenantID, id).Scan(&locked)
	if locked {
		writeJSON(w, 409, envelope{"error": "locked_role"})
		return
	}
	res, err := s.store.DB.ExecContext(r.Context(), `DELETE FROM roles WHERE tenant_id=`+s.store.Bind(1)+` AND id=`+s.store.Bind(2), u.TenantID, id)
	if err != nil {
		writeJSON(w, 409, envelope{"error": "role_in_use"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "role_deleted", "role", asString(id), r, nil)
	writeJSON(w, 200, envelope{"ok": true})
}
func (s *Server) replaceRolePermissionsTx(ctx context.Context, tx *sql.Tx, roleID int64, perms []string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM role_permissions WHERE role_id=`+s.store.Bind(1), roleID); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, p := range perms {
		p = strings.TrimSpace(p)
		if p == "" || seen[p] {
			continue
		}
		seen[p] = true
		if _, err := tx.ExecContext(ctx, `INSERT INTO role_permissions(role_id,permission_id) SELECT `+s.store.Bind(1)+`,id FROM permissions WHERE code=`+s.store.Bind(2), roleID, p); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) agentsList(w http.ResponseWriter, r *http.Request, u ctxUser) {
	_ = s.ensureDefaultRoles(r.Context(), u.TenantID)
	ctx := r.Context()
	permissionsByUser := map[int64][]string{}
	pq := `SELECT u.id,p.code FROM users u JOIN user_permissions up ON up.user_id=u.id JOIN permissions p ON p.id=up.permission_id WHERE u.tenant_id=` + s.store.Bind(1) + ` AND u.permissions_overridden=TRUE UNION ALL SELECT u.id,p.code FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN role_permissions rp ON rp.role_id=ur.role_id JOIN permissions p ON p.id=rp.permission_id WHERE u.tenant_id=` + s.store.Bind(2) + ` AND u.permissions_overridden=FALSE ORDER BY 1,2`
	if rs, err := s.store.DB.QueryContext(ctx, pq, u.TenantID, u.TenantID); err == nil {
		for rs.Next() {
			var uid int64
			var code string
			if rs.Scan(&uid, &code) == nil {
				permissionsByUser[uid] = append(permissionsByUser[uid], code)
			}
		}
		rs.Close()
	}
	type pref struct{ accepting, ready bool }
	prefs := map[int64]pref{}
	if rs, err := s.store.DB.QueryContext(ctx, `SELECT up.user_id,up.order_accepting,up.ready_to_receive_orders FROM user_preferences up JOIN users u ON u.id=up.user_id WHERE u.tenant_id=`+s.store.Bind(1), u.TenantID); err == nil {
		for rs.Next() {
			var id int64
			var a, b bool
			if rs.Scan(&id, &a, &b) == nil {
				prefs[id] = pref{a, b}
			}
		}
		rs.Close()
	}
	securityConfigured := map[int64]bool{}
	if rs, err := s.store.DB.QueryContext(ctx, `SELECT us.user_id,COALESCE(us.fallback_question,'') FROM user_security us JOIN users u ON u.id=us.user_id WHERE u.tenant_id=`+s.store.Bind(1), u.TenantID); err == nil {
		for rs.Next() {
			var id int64
			var q string
			if rs.Scan(&id, &q) == nil {
				securityConfigured[id] = strings.TrimSpace(q) != ""
			}
		}
		rs.Close()
	}
	actions := map[int64]int64{}
	if rs, err := s.store.DB.QueryContext(ctx, `SELECT user_id,COUNT(*) FROM audit_logs WHERE tenant_id=`+s.store.Bind(1)+` AND user_id IS NOT NULL AND created_at>=CURRENT_DATE GROUP BY user_id`, u.TenantID); err == nil {
		for rs.Next() {
			var id, n int64
			if rs.Scan(&id, &n) == nil {
				actions[id] = n
			}
		}
		rs.Close()
	}
	grantsByUser := map[int64]map[int64][]string{}
	gq := `SELECT eap.user_id,eap.exchange_account_id,eap.permission_code FROM exchange_account_permissions eap JOIN users u ON u.id=eap.user_id JOIN exchange_accounts ea ON ea.id=eap.exchange_account_id WHERE eap.tenant_id=` + s.store.Bind(1) + ` AND u.tenant_id=eap.tenant_id AND ea.tenant_id=eap.tenant_id ORDER BY eap.user_id,eap.exchange_account_id,eap.permission_code`
	if rs, err := s.store.DB.QueryContext(ctx, gq, u.TenantID); err == nil {
		for rs.Next() {
			var uid, cid int64
			var code string
			if rs.Scan(&uid, &cid, &code) == nil {
				if grantsByUser[uid] == nil {
					grantsByUser[uid] = map[int64][]string{}
				}
				grantsByUser[uid][cid] = append(grantsByUser[uid][cid], code)
			}
		}
		rs.Close()
	}
	rows, err := s.store.DB.QueryContext(ctx, `SELECT id,email,username,name,role_code,status,is_owner,include_profit_in_company_totals,assignment_accounting_enabled,last_seen_at,permissions_overridden FROM users WHERE tenant_id=`+s.store.Bind(1)+` ORDER BY is_owner DESC,id`, u.TenantID)
	if err != nil {
		writeJSON(w, 500, envelope{"error": "database"})
		return
	}
	defer rows.Close()
	var items []map[string]any
	for rows.Next() {
		var x ctxUser
		var status string
		var include, assign, over bool
		var last sql.NullTime
		if rows.Scan(&x.ID, &x.Email, &x.Username, &x.Name, &x.Role, &status, &x.IsOwner, &include, &assign, &last, &over) != nil {
			continue
		}
		x.TenantID = u.TenantID
		x.Permissions = permissionsByUser[x.ID]
		grantRows := []map[string]any{}
		var ids []int64
		for cid := range grantsByUser[x.ID] {
			ids = append(ids, cid)
		}
		sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
		for _, cid := range ids {
			grantRows = append(grantRows, map[string]any{"credentialId": cid, "permissions": grantsByUser[x.ID][cid]})
		}
		presenceStatus := "offline"
		if last.Valid && time.Since(last.Time) < 2*time.Minute {
			presenceStatus = "active"
		}
		pr := prefs[x.ID]
		safe := map[string]any{"id": x.ID, "username": x.Username, "name": x.Name, "role": x.Role, "agentId": func() any {
			if x.Role == "agent" {
				return x.ID
			}
			return nil
		}(), "permissions": x.Permissions, "email": x.Email, "binanceCredentialPermissions": grantRows, "securityFallbackConfigured": securityConfigured[x.ID], "assignmentAccountingEnabled": assign}
		items = append(items, map[string]any{"id": x.ID, "name": x.Name, "status": presenceStatus, "user": safe, "orderAcceptance": map[string]any{"accepting": pr.accepting, "ready": pr.ready}, "includeProfitInCompanyTotals": include, "presence": map[string]any{"page": "", "lastSeenAt": func() any {
			if last.Valid {
				return last.Time
			}
			return nil
		}()}, "activityToday": map[string]any{"openSeconds": 0, "activeSeconds": 0, "engagedSeconds": 0, "actions": actions[x.ID]}})
	}
	writeJSON(w, 200, map[string]any{"items": items, "binanceCredentialOptions": s.credentialOptions(ctx, u), "p2pCredentialOptions": s.credentialOptions(ctx, u), "binanceAccountPermissions": accountScopedPermissionCodes, "binanceAccountPermissionGroups": accountPermissionGroups()})
}

func (s *Server) subscriptionAllowsUser(ctx context.Context, tenantID int64) bool {
	var limit, count int64
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COALESCE(p.max_users,5) FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id WHERE t.id=`+s.store.Bind(1), tenantID).Scan(&limit)
	_ = s.store.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE tenant_id=`+s.store.Bind(1)+` AND status='active'`, tenantID).Scan(&count)
	return limit <= 0 || count < limit
}

func (s *Server) agentCreate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	s.agentSave(w, r, u, 0)
}
func (s *Server) agentUpdate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	s.agentSave(w, r, u, parseID(r.PathValue("id")))
}
func (s *Server) agentSave(w http.ResponseWriter, r *http.Request, u ctxUser, id int64) {
	var in struct {
		Username, Name, Email, Password, SecretCode, SecurityQuestion, SecurityAnswer, Role string
		UserRoleID                                                                          int64
		Permissions                                                                         []string
		BinanceCredentialPermissions                                                        []struct {
			CredentialID int64    `json:"credentialId"`
			Permissions  []string `json:"permissions"`
		}
		AllowNewOrders               bool
		AssignmentAccountingEnabled  bool
		SMSenabled                   bool `json:"smsEnabled"`
		IncludeProfitInCompanyTotals bool
		ClearSecurityFallback        bool
	}
	if !decode(w, r, &in) {
		return
	}
	in.Username = normalizePublicUsername(in.Username)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Name = strings.TrimSpace(in.Name)
	if !validPublicUsername(in.Username) || in.Name == "" || len(in.Name) > 160 || !validEmailAddress(in.Email) {
		writeJSON(w, 422, envelope{"error": "invalid_user_identity", "message": "Username must be globally unique and 3-60 safe characters; a valid email and name are required."})
		return
	}
	var usernameOwner int64
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COALESCE(MIN(id),0) FROM users WHERE LOWER(username)=`+s.store.Bind(1), strings.ToLower(in.Username)).Scan(&usernameOwner)
	if usernameOwner > 0 && usernameOwner != id {
		writeJSON(w, 409, envelope{"error": "username_taken"})
		return
	}
	if id == 0 && len(in.Password) < 12 {
		writeJSON(w, 422, envelope{"error": "password_min_12"})
		return
	}
	if in.Role == "" {
		in.Role = "agent"
	}
	if id == 0 && !u.IsSuperAdmin && !s.subscriptionAllowsUser(r.Context(), u.TenantID) {
		writeJSON(w, 402, envelope{"error": "plan_user_limit", "message": "Current subscription plan user limit reached."})
		return
	}
	if in.UserRoleID > 0 {
		_ = s.store.DB.QueryRowContext(r.Context(), `SELECT system_role FROM roles WHERE tenant_id=`+s.store.Bind(1)+` AND id=`+s.store.Bind(2), u.TenantID, in.UserRoleID).Scan(&in.Role)
	}
	var hash string
	var err error
	if in.Password != "" {
		hash, err = security.HashPassword(in.Password)
		if err != nil {
			writeJSON(w, 500, envelope{"error": "password_hash"})
			return
		}
	}
	err = s.svc.WithTx(r.Context(), func(tx *sql.Tx) error {
		if id == 0 {
			if s.store.Driver == "postgres" {
				err := tx.QueryRowContext(r.Context(), `INSERT INTO users(tenant_id,email,username,name,password_hash,status,role_code,is_owner,include_profit_in_company_totals,assignment_accounting_enabled,permissions_overridden,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'active',$6,FALSE,$7,$8,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`, u.TenantID, in.Email, in.Username, in.Name, hash, in.Role, in.IncludeProfitInCompanyTotals, in.AssignmentAccountingEnabled).Scan(&id)
				if err != nil {
					return err
				}
			} else {
				res, err := tx.ExecContext(r.Context(), `INSERT INTO users(tenant_id,email,username,name,password_hash,status,role_code,is_owner,include_profit_in_company_totals,assignment_accounting_enabled,permissions_overridden,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,FALSE,?,?,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, u.TenantID, in.Email, in.Username, in.Name, hash, in.Role, in.IncludeProfitInCompanyTotals, in.AssignmentAccountingEnabled)
				if err != nil {
					return err
				}
				id, _ = res.LastInsertId()
			}
			_, _ = tx.ExecContext(r.Context(), `INSERT INTO user_preferences(user_id,tenant_id,order_accepting,ready_to_receive_orders,notifications_json,ui_json,updated_at) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`,`+s.store.Bind(3)+`,`+s.store.Bind(4)+`,'{}','{}',CURRENT_TIMESTAMP)`, id, u.TenantID, in.AllowNewOrders, in.AllowNewOrders)
		} else {
			q := `UPDATE users SET email=` + s.store.Bind(1) + `,username=` + s.store.Bind(2) + `,name=` + s.store.Bind(3) + `,role_code=` + s.store.Bind(4) + `,include_profit_in_company_totals=` + s.store.Bind(5) + `,assignment_accounting_enabled=` + s.store.Bind(6) + `,permissions_overridden=TRUE,updated_at=CURRENT_TIMESTAMP`
			args := []any{in.Email, in.Username, in.Name, in.Role, in.IncludeProfitInCompanyTotals, in.AssignmentAccountingEnabled}
			if hash != "" {
				q += `,password_hash=` + s.store.Bind(len(args)+1)
				args = append(args, hash)
			}
			q += ` WHERE tenant_id=` + s.store.Bind(len(args)+1) + ` AND id=` + s.store.Bind(len(args)+2)
			args = append(args, u.TenantID, id)
			if _, err := tx.ExecContext(r.Context(), q, args...); err != nil {
				return err
			}
			_, _ = tx.ExecContext(r.Context(), `UPDATE user_preferences SET order_accepting=`+s.store.Bind(1)+`,ready_to_receive_orders=`+s.store.Bind(2)+`,updated_at=CURRENT_TIMESTAMP WHERE user_id=`+s.store.Bind(3), in.AllowNewOrders, in.AllowNewOrders, id)
		}
		if in.UserRoleID > 0 {
			_, _ = tx.ExecContext(r.Context(), `DELETE FROM user_roles WHERE user_id=`+s.store.Bind(1), id)
			_, _ = tx.ExecContext(r.Context(), `INSERT INTO user_roles(user_id,role_id) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`)`, id, in.UserRoleID)
		}
		if err := s.replaceUserPermissionsTx(r.Context(), tx, id, in.Permissions); err != nil {
			return err
		}
		if err := s.replaceAccountPermissionsTx(r.Context(), tx, u.TenantID, id, in.BinanceCredentialPermissions); err != nil {
			return err
		}
		if in.ClearSecurityFallback {
			_, _ = tx.ExecContext(r.Context(), `DELETE FROM user_security WHERE user_id=`+s.store.Bind(1), id)
		} else if strings.TrimSpace(in.SecurityQuestion) != "" && strings.TrimSpace(in.SecurityAnswer) != "" {
			answerHash, _ := security.HashPassword(strings.ToLower(strings.TrimSpace(in.SecurityAnswer)))
			if s.store.Driver == "postgres" {
				_, _ = tx.ExecContext(r.Context(), `INSERT INTO user_security(user_id,tenant_id,fallback_question,fallback_answer_hash,updated_at) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET fallback_question=EXCLUDED.fallback_question,fallback_answer_hash=EXCLUDED.fallback_answer_hash,updated_at=CURRENT_TIMESTAMP`, id, u.TenantID, in.SecurityQuestion, answerHash)
			} else {
				_, _ = tx.ExecContext(r.Context(), `INSERT INTO user_security(user_id,tenant_id,fallback_question,fallback_answer_hash,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE fallback_question=VALUES(fallback_question),fallback_answer_hash=VALUES(fallback_answer_hash),updated_at=CURRENT_TIMESTAMP`, id, u.TenantID, in.SecurityQuestion, answerHash)
			}
		}
		return nil
	})
	if err != nil {
		writeJSON(w, 409, envelope{"error": "user_save_failed", "detail": safeErr(err)})
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, func() string {
		if id > 0 {
			return "user_saved"
		}
		return "user_created"
	}(), "user", asString(id), r, map[string]any{"username": in.Username})
	writeJSON(w, func() int {
		if r.Method == "POST" {
			return 201
		}
		return 200
	}(), envelope{"ok": true, "id": id})
}
func (s *Server) agentDelete(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	if id == u.ID {
		writeJSON(w, 409, envelope{"error": "cannot_delete_self"})
		return
	}
	var owner bool
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT is_owner FROM users WHERE tenant_id=`+s.store.Bind(1)+` AND id=`+s.store.Bind(2), u.TenantID, id).Scan(&owner)
	if owner {
		writeJSON(w, 409, envelope{"error": "cannot_delete_owner"})
		return
	}
	_, err := s.store.DB.ExecContext(r.Context(), `DELETE FROM users WHERE tenant_id=`+s.store.Bind(1)+` AND id=`+s.store.Bind(2), u.TenantID, id)
	if err != nil {
		writeJSON(w, 409, envelope{"error": "user_delete_failed"})
		return
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "user_deleted", "user", asString(id), r, nil)
	writeJSON(w, 200, envelope{"ok": true})
}
func (s *Server) replaceUserPermissionsTx(ctx context.Context, tx *sql.Tx, userID int64, perms []string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM user_permissions WHERE user_id=`+s.store.Bind(1), userID); err != nil {
		return err
	}
	for _, p := range uniqueStrings(perms) {
		if _, err := tx.ExecContext(ctx, `INSERT INTO user_permissions(user_id,permission_id) SELECT `+s.store.Bind(1)+`,id FROM permissions WHERE code=`+s.store.Bind(2), userID, p); err != nil {
			return err
		}
	}
	return nil
}
func (s *Server) replaceAccountPermissionsTx(ctx context.Context, tx *sql.Tx, tenantID, userID int64, rows []struct {
	CredentialID int64    `json:"credentialId"`
	Permissions  []string `json:"permissions"`
}) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM exchange_account_permissions WHERE tenant_id=`+s.store.Bind(1)+` AND user_id=`+s.store.Bind(2), tenantID, userID); err != nil {
		return err
	}
	for _, row := range rows {
		if row.CredentialID <= 0 {
			return fmt.Errorf("invalid Binance credential id")
		}
		var accountCount int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM exchange_accounts WHERE tenant_id=`+s.store.Bind(1)+` AND id=`+s.store.Bind(2), tenantID, row.CredentialID).Scan(&accountCount); err != nil || accountCount != 1 {
			return fmt.Errorf("Binance credential %d is outside this workspace", row.CredentialID)
		}
		for _, code := range uniqueStrings(row.Permissions) {
			if !isAccountScopedPermission(code) {
				return fmt.Errorf("permission %s is not Binance-account scoped", code)
			}
			var globalCount int
			if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM user_permissions up JOIN permissions p ON p.id=up.permission_id WHERE up.user_id=`+s.store.Bind(1)+` AND p.code=`+s.store.Bind(2), userID, code).Scan(&globalCount); err != nil || globalCount != 1 {
				return fmt.Errorf("permission %s must also be enabled globally", code)
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO exchange_account_permissions(tenant_id,user_id,exchange_account_id,permission_code) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`,`+s.store.Bind(3)+`,`+s.store.Bind(4)+`)`, tenantID, userID, row.CredentialID, code); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Server) accountPermissionRows(ctx context.Context, tenantID, userID int64) []map[string]any {
	rows, err := s.store.DB.QueryContext(ctx, `SELECT eap.exchange_account_id,eap.permission_code FROM exchange_account_permissions eap JOIN exchange_accounts ea ON ea.id=eap.exchange_account_id WHERE eap.tenant_id=`+s.store.Bind(1)+` AND eap.user_id=`+s.store.Bind(2)+` AND ea.tenant_id=eap.tenant_id ORDER BY eap.exchange_account_id,eap.permission_code`, tenantID, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	m := map[int64][]string{}
	for rows.Next() {
		var id int64
		var p string
		if rows.Scan(&id, &p) == nil {
			m[id] = append(m[id], p)
		}
	}
	ids := make([]int64, 0, len(m))
	for id := range m {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	out := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		out = append(out, map[string]any{"credentialId": id, "permissions": m[id]})
	}
	return out
}
func uniqueStrings(in []string) []string {
	m := map[string]bool{}
	var out []string
	for _, x := range in {
		x = strings.TrimSpace(x)
		if x != "" && !m[x] {
			m[x] = true
			out = append(out, x)
		}
	}
	return out
}

func (s *Server) orderAcceptancePatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in struct {
		Accepting bool `json:"accepting"`
	}
	if !decode(w, r, &in) {
		return
	}
	if s.store.Driver == "postgres" {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO user_preferences(user_id,tenant_id,order_accepting,ready_to_receive_orders,notifications_json,ui_json,updated_at) VALUES($1,$2,$3,$3,'{}','{}',CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET order_accepting=EXCLUDED.order_accepting,ready_to_receive_orders=EXCLUDED.ready_to_receive_orders,updated_at=CURRENT_TIMESTAMP`, u.ID, u.TenantID, in.Accepting)
	} else {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO user_preferences(user_id,tenant_id,order_accepting,ready_to_receive_orders,notifications_json,ui_json,updated_at) VALUES(?,?,?,?,'{}','{}',CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE order_accepting=VALUES(order_accepting),ready_to_receive_orders=VALUES(ready_to_receive_orders),updated_at=CURRENT_TIMESTAMP`, u.ID, u.TenantID, in.Accepting, in.Accepting)
	}
	s.svc.Publish(r.Context(), events.Event{TenantID: u.TenantID, Type: "user.order_acceptance", Data: map[string]any{"userId": u.ID, "accepting": in.Accepting}})
	writeJSON(w, 200, map[string]any{"ok": true, "accepting": in.Accepting})
}

func (s *Server) activityHeartbeat(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	now := time.Now().UTC()
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE users SET last_seen_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), u.ID)
	var id int64
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT id FROM activity_sessions WHERE user_id=`+s.store.Bind(1)+` AND status='online' ORDER BY id DESC LIMIT 1`, u.ID).Scan(&id)
	if id > 0 {
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE activity_sessions SET last_heartbeat_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), id)
	} else if s.store.Driver == "postgres" {
		_ = s.store.DB.QueryRowContext(r.Context(), `INSERT INTO activity_sessions(tenant_id,user_id,started_at,last_heartbeat_at,status) VALUES($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'online') RETURNING id`, u.TenantID, u.ID).Scan(&id)
	} else {
		res, _ := s.store.DB.ExecContext(r.Context(), `INSERT INTO activity_sessions(tenant_id,user_id,started_at,last_heartbeat_at,status) VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'online')`, u.TenantID, u.ID)
		id, _ = res.LastInsertId()
	}
	writeJSON(w, 200, map[string]any{"ok": true, "sessionId": id, "at": now})
}
func (s *Server) activityEnd(w http.ResponseWriter, r *http.Request, u ctxUser) {
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE activity_sessions SET ended_at=CURRENT_TIMESTAMP,status='offline' WHERE user_id=`+s.store.Bind(1)+` AND status='online'`, u.ID)
	writeJSON(w, 200, envelope{"ok": true})
}
func (s *Server) activityUsers(w http.ResponseWriter, r *http.Request, u ctxUser) {
	rows, err := s.store.DB.QueryContext(r.Context(), `SELECT u.id,u.name,u.username,u.role_code,u.last_seen_at,COUNT(a.id) FROM users u LEFT JOIN audit_logs a ON a.user_id=u.id AND a.created_at>=CURRENT_DATE WHERE u.tenant_id=`+s.store.Bind(1)+` GROUP BY u.id,u.name,u.username,u.role_code,u.last_seen_at ORDER BY u.name`, u.TenantID)
	if err != nil {
		writeJSON(w, 500, envelope{"error": "database"})
		return
	}
	defer rows.Close()
	var items []map[string]any
	for rows.Next() {
		var id, actions int64
		var name, username, role string
		var last sql.NullTime
		if rows.Scan(&id, &name, &username, &role, &last, &actions) == nil {
			online := last.Valid && time.Since(last.Time) < 2*time.Minute
			items = append(items, map[string]any{"id": id, "name": name, "username": username, "role": role, "status": func() string {
				if online {
					return "active"
				}
				return "offline"
			}(), "lastSeenAt": func() any {
				if last.Valid {
					return last.Time
				}
				return nil
			}(), "activityToday": map[string]any{"actions": actions, "openSeconds": 0, "activeSeconds": 0, "engagedSeconds": 0}})
		}
	}
	writeJSON(w, 200, map[string]any{"items": items, "generatedAt": time.Now().UTC()})
}
