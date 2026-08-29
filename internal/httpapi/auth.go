package httpapi

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"p2pflow/v2/internal/security"
)

func (s *Server) registerAuthRoutes() {
	s.mux.HandleFunc("POST /api/public/signup", s.signup)
	s.mux.HandleFunc("POST /api/login", s.login)
	s.mux.HandleFunc("POST /api/logout", s.requireUser(s.logout))
	s.mux.HandleFunc("GET /api/plans", s.plans)
}
func (s *Server) signup(w http.ResponseWriter, r *http.Request) {
	var in struct{ Name, Email, Password, Workspace, Username, PlanCode string }
	if !decode(w, r, &in) {
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Name = strings.TrimSpace(in.Name)
	in.Workspace = strings.TrimSpace(in.Workspace)
	explicitUsername := strings.TrimSpace(in.Username) != ""
	in.Username = normalizePublicUsername(in.Username)
	if !explicitUsername {
		local := "user"
		if parts := strings.SplitN(in.Email, "@", 2); len(parts) > 0 {
			if normalized := normalizePublicUsername(parts[0]); normalized != "" {
				local = normalized
			}
		}
		suffix := strings.TrimPrefix(randomID(""), "_")
		if len(suffix) > 8 {
			suffix = suffix[:8]
		}
		in.Username = strings.TrimRight(local, ".-_") + "-" + strings.ToLower(suffix)
	}
	if !validPublicUsername(in.Username) {
		writeJSON(w, 400, envelope{"error": "invalid_username", "message": "Username must be 3-60 characters using letters, numbers, dot, underscore or hyphen."})
		return
	}
	if in.Name == "" {
		in.Name = in.Username
	}
	if !validEmailAddress(in.Email) || len(in.Password) < 12 || len(in.Password) > 256 || in.Workspace == "" || len(in.Workspace) > 160 || len(in.Name) > 160 {
		writeJSON(w, 400, envelope{"error": "invalid_signup", "message": "Use a valid email/workspace and a 12-256 character password."})
		return
	}
	var existing int
	if err := s.store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM users WHERE LOWER(username)=`+s.store.Bind(1), strings.ToLower(in.Username)).Scan(&existing); err != nil {
		writeJSON(w, 500, envelope{"error": "username_check"})
		return
	}
	if existing > 0 {
		if explicitUsername {
			writeJSON(w, 409, envelope{"error": "username_taken", "message": "That username is already in use."})
			return
		}
		// The generated suffix is random, but avoid turning an extremely unlikely
		// collision into a confusing database constraint error.
		in.Username = "user-" + strings.ToLower(strings.TrimPrefix(randomID(""), "_"))[:12]
	}
	hash, err := security.HashPassword(in.Password)
	if err != nil {
		writeJSON(w, 500, envelope{"error": "password_hash"})
		return
	}
	var tenantID, userID, planID int64
	planCode := strings.TrimSpace(in.PlanCode)
	if planCode == "" {
		planCode = "starter"
	}
	err = s.svc.WithTx(r.Context(), func(tx *sql.Tx) error {
		if s.store.Driver == "postgres" {
			if err := tx.QueryRowContext(r.Context(), `INSERT INTO tenants(name,slug,status,created_at,updated_at) VALUES($1,$2,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`, in.Workspace, slug(in.Workspace)).Scan(&tenantID); err != nil {
				return err
			}
			if err := tx.QueryRowContext(r.Context(), `INSERT INTO users(tenant_id,email,username,name,password_hash,status,role_code,is_owner,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'active','admin',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`, tenantID, in.Email, in.Username, in.Name, hash).Scan(&userID); err != nil {
				return err
			}
		} else {
			res, err := tx.ExecContext(r.Context(), `INSERT INTO tenants(name,slug,status,created_at,updated_at) VALUES(?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, in.Workspace, slug(in.Workspace))
			if err != nil {
				return err
			}
			tenantID, _ = res.LastInsertId()
			res, err = tx.ExecContext(r.Context(), `INSERT INTO users(tenant_id,email,username,name,password_hash,status,role_code,is_owner,created_at,updated_at) VALUES(?,?,?,?,?,'active','admin',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, tenantID, in.Email, in.Username, in.Name, hash)
			if err != nil {
				return err
			}
			userID, _ = res.LastInsertId()
		}
		_, _ = tx.ExecContext(r.Context(), `INSERT INTO user_preferences(user_id,tenant_id,order_accepting,ready_to_receive_orders,notifications_json,ui_json,updated_at) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`,TRUE,TRUE,'{}','{}',CURRENT_TIMESTAMP)`, userID, tenantID)
		if s.cfg.SuperAdminEmail != "" && strings.EqualFold(in.Email, s.cfg.SuperAdminEmail) {
			_, _ = tx.ExecContext(r.Context(), `UPDATE users SET is_super_admin=TRUE WHERE id=`+s.store.Bind(1), userID)
		}
		_ = tx.QueryRowContext(r.Context(), `SELECT id FROM plans WHERE code=`+s.store.Bind(1)+` AND status='active'`, planCode).Scan(&planID)
		if planID == 0 {
			_ = tx.QueryRowContext(r.Context(), `SELECT id FROM plans WHERE status='active' ORDER BY id LIMIT 1`).Scan(&planID)
		}
		if planID > 0 {
			var setupFee, monthlyPrice float64
			_ = tx.QueryRowContext(r.Context(), `SELECT setup_fee,monthly_price FROM plans WHERE id=`+s.store.Bind(1), planID).Scan(&setupFee, &monthlyPrice)
			now := time.Now().UTC()
			provider := s.cfg.BillingDefaultProvider
			if strings.TrimSpace(provider) == "" {
				provider = "manual"
			}
			subStatus := "active"
			tenantStatus := "active"
			if setupFee > 0 {
				subStatus = "pending_setup"
				tenantStatus = "pending_payment"
			} else if monthlyPrice > 0 {
				subStatus = "pending_payment"
				tenantStatus = "pending_payment"
			}
			_, _ = tx.ExecContext(r.Context(), `UPDATE tenants SET plan_id=`+s.store.Bind(1)+`,status=`+s.store.Bind(2)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3), planID, tenantStatus, tenantID)
			var subscriptionID int64
			if s.store.Driver == "postgres" {
				if err := tx.QueryRowContext(r.Context(), `INSERT INTO subscriptions(tenant_id,plan_id,status,provider,billing_cycle_anchor,next_invoice_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`, tenantID, planID, subStatus, provider, now, nil).Scan(&subscriptionID); err != nil {
					return err
				}
			} else {
				res, err := tx.ExecContext(r.Context(), `INSERT INTO subscriptions(tenant_id,plan_id,status,provider,billing_cycle_anchor,next_invoice_at,created_at,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, tenantID, planID, subStatus, provider, now, nil)
				if err != nil {
					return err
				}
				subscriptionID, _ = res.LastInsertId()
			}
			if setupFee > 0 {
				if _, err := s.insertInvoiceTx(r.Context(), tx, tenantID, subscriptionID, "setup", s.cfg.BillingCurrency, setupFee, now, nil, nil, fmt.Sprintf("tenant:%d:setup", tenantID)); err != nil {
					return err
				}
			} else if monthlyPrice > 0 {
				periodStart := now
				periodEnd := now.AddDate(0, 1, 0)
				due := now.Add(s.cfg.BillingInvoiceLead)
				if due.After(periodEnd) {
					due = now
				}
				if _, err := s.insertInvoiceTx(r.Context(), tx, tenantID, subscriptionID, "monthly", s.cfg.BillingCurrency, monthlyPrice, due, &periodStart, &periodEnd, fmt.Sprintf("sub:%d:first-month", subscriptionID)); err != nil {
					return err
				}
			} else {
				periodEnd := now.AddDate(0, 1, 0)
				_, _ = tx.ExecContext(r.Context(), `UPDATE subscriptions SET current_period_start=`+s.store.Bind(1)+`,current_period_end=`+s.store.Bind(2)+`,next_invoice_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3), now, periodEnd, subscriptionID)
			}
		}
		return nil
	})
	if err != nil {
		writeJSON(w, 409, envelope{"error": "signup_failed", "detail": safeErr(err)})
		return
	}
	token, err := s.createSession(r, userID, tenantID)
	if err != nil {
		writeJSON(w, 500, envelope{"error": "session"})
		return
	}
	s.setSessionCookie(w, token)
	s.svc.Audit(r.Context(), tenantID, userID, "workspace_created", "tenant", asString(tenantID), r, map[string]any{"plan": planCode})
	writeJSON(w, 201, envelope{"ok": true, "tenantId": tenantID, "userId": userID, "username": in.Username, "version": s.cfg.Version})
}
func normalizePublicUsername(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	var b strings.Builder
	for _, r := range v {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-' {
			b.WriteRune(r)
		}
	}
	return strings.Trim(b.String(), ".-_")
}

func validPublicUsername(v string) bool {
	if len(v) < 3 || len(v) > 60 {
		return false
	}
	for i, r := range v {
		alphaNum := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if !alphaNum && r != '.' && r != '_' && r != '-' {
			return false
		}
		if (i == 0 || i == len(v)-1) && !alphaNum {
			return false
		}
	}
	return true
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email, Username, Password string
		EmailOTP                  string                  `json:"emailOtp"`
		SecretCode                string                  `json:"secretCode"`
		SecurityFallbackID        string                  `json:"securityFallbackId"`
		SecurityAnswer            string                  `json:"securityAnswer"`
		OwnerMailOutageID         string                  `json:"ownerMailOutageId"`
		ResendOTP                 bool                    `json:"resendOtp"`
		OwnerEmergencyStart       bool                    `json:"ownerEmergencyStart"`
		DeviceEnrollment          trustedDeviceEnrollment `json:"deviceEnrollment"`
	}
	if !decode(w, r, &in) {
		return
	}
	ident := strings.ToLower(strings.TrimSpace(in.Email))
	if ident == "" {
		ident = strings.ToLower(strings.TrimSpace(in.Username))
	}
	q := `SELECT u.id,u.tenant_id,u.email,u.username,u.name,u.role_code,u.password_hash,u.is_owner,u.is_super_admin,COALESCE(us.secret_code_hash,''),COALESCE(us.fallback_question,''),COALESCE(us.fallback_answer_hash,'') FROM users u LEFT JOIN user_security us ON us.user_id=u.id WHERE (LOWER(u.email)=` + s.store.Bind(1) + ` OR LOWER(u.username)=` + s.store.Bind(2) + `) AND u.status='active' ORDER BY u.id LIMIT 1`
	var u ctxUser
	var hash, secretHash, fallbackQuestion, fallbackAnswerHash string
	if err := s.store.DB.QueryRowContext(r.Context(), q, ident, ident).Scan(&u.ID, &u.TenantID, &u.Email, &u.Username, &u.Name, &u.Role, &hash, &u.IsOwner, &u.IsSuperAdmin, &secretHash, &fallbackQuestion, &fallbackAnswerHash); err != nil || !security.CheckPassword(hash, in.Password) {
		writeJSON(w, 401, envelope{"error": "invalid_credentials"})
		return
	}

	// Mail-outage fallback challenge: password has already been verified above;
	// the saved one-way answer/PIN hashes complete the second factor.
	if strings.TrimSpace(in.SecurityFallbackID) != "" {
		if fallbackAnswerHash == "" || secretHash == "" || !security.CheckPassword(fallbackAnswerHash, strings.TrimSpace(in.SecurityAnswer)) || !security.CheckPassword(secretHash, strings.TrimSpace(in.SecretCode)) {
			_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE security_challenges SET attempts=attempts+1 WHERE id=`+s.store.Bind(1)+` AND user_id=`+s.store.Bind(2)+` AND purpose='login_fallback'`, in.SecurityFallbackID, u.ID)
			writeJSON(w, 401, envelope{"error": "security_fallback_invalid", "message": "Security answer or PIN is incorrect."})
			return
		}
		var attempts int
		if err := s.store.DB.QueryRowContext(r.Context(), `SELECT attempts FROM security_challenges WHERE id=`+s.store.Bind(1)+` AND user_id=`+s.store.Bind(2)+` AND purpose='login_fallback' AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP`, in.SecurityFallbackID, u.ID).Scan(&attempts); err != nil || attempts >= 5 {
			writeJSON(w, 401, envelope{"error": "security_fallback_expired", "securityFallbackExpired": true, "message": "Security fallback challenge expired."})
			return
		}
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE security_challenges SET verified_at=CURRENT_TIMESTAMP,used_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), in.SecurityFallbackID)
		s.finishLogin(w, r, u, in.DeviceEnrollment)
		return
	}
	if strings.TrimSpace(in.OwnerMailOutageID) != "" {
		if !u.IsOwner || secretHash == "" || !security.CheckPassword(secretHash, strings.TrimSpace(in.SecretCode)) {
			_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE security_challenges SET attempts=attempts+1 WHERE id=`+s.store.Bind(1)+` AND user_id=`+s.store.Bind(2)+` AND purpose='login_owner_outage'`, in.OwnerMailOutageID, u.ID)
			writeJSON(w, 401, envelope{"error": "owner_emergency_invalid", "message": "Owner Security PIN is incorrect."})
			return
		}
		var attempts int
		if err := s.store.DB.QueryRowContext(r.Context(), `SELECT attempts FROM security_challenges WHERE id=`+s.store.Bind(1)+` AND user_id=`+s.store.Bind(2)+` AND purpose='login_owner_outage' AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP`, in.OwnerMailOutageID, u.ID).Scan(&attempts); err != nil || attempts >= 5 {
			writeJSON(w, 401, envelope{"error": "owner_emergency_expired", "ownerMailOutageExpired": true, "message": "Owner Emergency Login challenge expired."})
			return
		}
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE security_challenges SET verified_at=CURRENT_TIMESTAMP,used_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), in.OwnerMailOutageID)
		s.finishLogin(w, r, u, in.DeviceEnrollment)
		return
	}

	cfg := s.publicSettings(r.Context(), u.TenantID)
	requireOTP := mapBool(cfg, "requireEmailOtp")
	requireSecret := mapBool(cfg, "requireLoginSecretCode") || (requireOTP && secretHash != "")

	if requireOTP {
		otp := strings.TrimSpace(in.EmailOTP)
		if otp == "" || in.ResendOTP || in.OwnerEmergencyStart {
			// Keep repeated browser clicks from generating an email storm.
			var last time.Time
			if s.store.DB.QueryRowContext(r.Context(), `SELECT created_at FROM security_challenges WHERE user_id=`+s.store.Bind(1)+` AND purpose='login_otp' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`, u.ID).Scan(&last) == nil {
				if wait := 25 - int(time.Since(last).Seconds()); wait > 0 && (in.ResendOTP || !in.OwnerEmergencyStart) {
					writeJSON(w, 429, envelope{"error": "otp_rate_limited", "message": "Please wait " + asString(wait) + " seconds before requesting another OTP."})
					return
				}
			}
			code := randomDigits(6)
			challengeID := randomID("login")
			_ = s.insertSecurityChallenge(r, u, "login_otp", u.Email, code, map[string]any{"login": true}, challengeID)
			mailErr := s.sendMail(u.Email, "P2PFlow login verification", "Your P2PFlow login code is "+code+". It expires in 10 minutes.")
			if mailErr != nil {
				fallbackEnabled := cfg["loginSecurityQuestionFallbackEnabled"] != false
				if fallbackEnabled && fallbackQuestion != "" && fallbackAnswerHash != "" && secretHash != "" {
					fid := randomID("login_fallback")
					_ = s.insertSecurityChallenge(r, u, "login_fallback", u.Email, randomDigits(6), map[string]any{"mailError": mailErr.Error()}, fid)
					writeJSON(w, 200, map[string]any{"securityFallbackRequired": true, "fallbackId": fid, "securityQuestion": fallbackQuestion, "message": "Email OTP delivery failed. Use your saved Security Question and PIN."})
					return
				}
				if u.IsOwner && secretHash != "" {
					oid := randomID("owner_outage")
					_ = s.insertSecurityChallenge(r, u, "login_owner_outage", u.Email, randomDigits(6), map[string]any{"mailError": mailErr.Error()}, oid)
					writeJSON(w, 200, map[string]any{"ownerMailOutageRequired": true, "ownerMailOutageId": oid, "message": "Email delivery failed. Owner Emergency Login is available with your existing Security PIN."})
					return
				}
				writeJSON(w, 503, envelope{"error": "mail_delivery_failed", "message": "Login OTP could not be delivered. Configure SMTP or a Security Question fallback."})
				return
			}
			writeJSON(w, 200, map[string]any{"otpRequired": true, "otpRecipient": maskEmail(u.Email), "otpDriver": "smtp", "message": "Verification code sent."})
			return
		}
		if _, err := s.consumeLatestSecurityChallenge(r, u.ID, "login_otp", otp); err != nil {
			writeJSON(w, 401, envelope{"error": "otp_invalid", "message": err.Error()})
			return
		}
	}

	if requireSecret && secretHash != "" {
		if strings.TrimSpace(in.SecretCode) == "" {
			writeJSON(w, 200, map[string]any{"secretRequired": true, "message": "Enter your existing 6 digit Security PIN."})
			return
		}
		if !security.CheckPassword(secretHash, strings.TrimSpace(in.SecretCode)) {
			writeJSON(w, 401, envelope{"error": "secret_invalid", "message": "Security PIN is incorrect."})
			return
		}
	}
	s.finishLogin(w, r, u, in.DeviceEnrollment)
	return
}

func (s *Server) finishLogin(w http.ResponseWriter, r *http.Request, u ctxUser, enrollment trustedDeviceEnrollment) {
	token, err := s.createSession(r, u.ID, u.TenantID)
	if err != nil {
		writeJSON(w, 500, envelope{"error": "session"})
		return
	}
	s.setSessionCookie(w, token)
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE users SET last_seen_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), u.ID)
	_ = s.enrollTrustedDevice(r, u, enrollment)
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "login", "session", "", r, nil)
	writeJSON(w, 200, envelope{"ok": true, "user": s.userSafe(r.Context(), u), "trustedDevice": enrollment.DeviceID != ""})
}

func maskEmail(v string) string {
	parts := strings.Split(strings.TrimSpace(v), "@")
	if len(parts) != 2 || parts[0] == "" {
		return "***"
	}
	name := parts[0]
	if len(name) > 2 {
		name = name[:2] + "***"
	} else {
		name += "***"
	}
	return name + "@" + parts[1]
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if c, err := r.Cookie("p2pflow_session"); err == nil {
		_, _ = s.store.DB.ExecContext(r.Context(), `DELETE FROM sessions WHERE token_hash=`+s.store.Bind(1), hashToken(c.Value))
	}
	http.SetCookie(w, &http.Cookie{Name: "p2pflow_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode, Domain: s.cfg.CookieDomain})
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "logout", "session", "", r, nil)
	writeJSON(w, 200, envelope{"ok": true})
}
func (s *Server) plans(w http.ResponseWriter, r *http.Request) {
	rows, err := s.store.DB.QueryContext(r.Context(), `SELECT id,code,name,monthly_price,setup_fee,max_users,max_exchange_accounts,status,entitlements_json FROM plans WHERE status='active' ORDER BY id`)
	if err != nil {
		writeJSON(w, 500, envelope{"error": "database"})
		return
	}
	defer rows.Close()
	var list []map[string]any
	for rows.Next() {
		var id, maxu, maxa int64
		var code, name, status, raw string
		var monthly, setup float64
		if rows.Scan(&id, &code, &name, &monthly, &setup, &maxu, &maxa, &status, &raw) == nil {
			list = append(list, map[string]any{"id": id, "code": code, "name": name, "monthlyPrice": monthly, "setupFee": setup, "maxUsers": maxu, "maxExchangeAccounts": maxa, "status": status, "entitlements": jsonMap(raw)})
		}
	}
	writeJSON(w, 200, list)
}
func (s *Server) userSafe(ctx context.Context, u ctxUser) map[string]any {
	if u.Permissions == nil {
		u.Permissions = s.permissionCodes(ctx, u)
	}
	var fallback string
	_ = s.store.DB.QueryRowContext(ctx, `SELECT fallback_question FROM user_security WHERE user_id=`+s.store.Bind(1), u.ID).Scan(&fallback)
	var orderAccepting, ready bool
	_ = s.store.DB.QueryRowContext(ctx, `SELECT order_accepting,ready_to_receive_orders FROM user_preferences WHERE user_id=`+s.store.Bind(1), u.ID).Scan(&orderAccepting, &ready)
	return map[string]any{"id": u.ID, "tenantId": u.TenantID, "username": u.Username, "email": u.Email, "name": u.Name, "role": u.Role, "roleName": u.Role, "isOwner": u.IsOwner, "isSuperAdmin": u.IsSuperAdmin, "agentId": func() any {
		if u.Role == "agent" {
			return u.ID
		}
		return nil
	}(), "permissions": u.Permissions, "securityQuestion": fallback, "securityFallbackConfigured": fallback != "", "workAvailable": orderAccepting, "orderAcceptance": map[string]any{"accepting": orderAccepting, "ready": ready}, "assignmentAccountingEnabled": true}
}
