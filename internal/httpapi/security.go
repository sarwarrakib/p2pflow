package httpapi

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	sec "p2pflow/v2/internal/security"
)

func (s *Server) registerSecurityRoutes() {
	s.mux.HandleFunc("GET /api/me/security", s.requireUser(s.securityGet))
	s.mux.HandleFunc("PATCH /api/me/security", s.requireUser(s.securityPatch))
	s.mux.HandleFunc("PATCH /api/me/security/fallback", s.requireUser(s.securityFallbackPatch))
	s.mux.HandleFunc("DELETE /api/me/security/trusted-device/{id}", s.requireUser(s.trustedDeviceDelete))
	s.mux.HandleFunc("POST /api/login/recover-email", s.emailRecovery)
	s.mux.HandleFunc("POST /api/login/device/challenge", s.deviceChallenge)
	s.mux.HandleFunc("POST /api/login/device", s.deviceLogin)
	s.mux.HandleFunc("POST /api/login/device/upgrade", s.deviceUpgrade)
	s.mux.HandleFunc("GET /api/login/device/legacy", s.deviceLegacy)
}

type trustedDeviceEnrollment struct {
	DeviceID     string         `json:"deviceId"`
	Name         string         `json:"name"`
	PublicKeyJWK map[string]any `json:"publicKeyJwk"`
}

func (s *Server) securityGet(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var secretHash, question string
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT secret_code_hash,fallback_question FROM user_security WHERE user_id=`+s.store.Bind(1), u.ID).Scan(&secretHash, &question)
	rows, _ := s.store.DB.QueryContext(r.Context(), `SELECT id,label,user_agent,last_ip,last_used_at,expires_at,created_at FROM trusted_devices WHERE user_id=`+s.store.Bind(1)+` AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY last_used_at DESC`, u.ID)
	items := []map[string]any{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id int64
			var label, ua, ip string
			var last, exp, created time.Time
			if rows.Scan(&id, &label, &ua, &ip, &last, &exp, &created) == nil {
				items = append(items, map[string]any{"id": id, "name": label, "label": label, "userAgent": ua, "ip": ip, "lastUsedAt": last, "expiresAt": exp, "createdAt": created, "current": false})
			}
		}
	}
	cfg := s.publicSettings(r.Context(), u.TenantID)
	writeJSON(w, 200, map[string]any{"user": s.userSafe(r.Context(), u), "email": u.Email, "secretCodeSet": secretHash != "", "secretCodeRequired": mapBool(cfg, "requireLoginSecretCode"), "emailOtpRequired": mapBool(cfg, "requireEmailOtp"), "securityFallbackConfigured": question != "", "securityQuestion": question, "securityQuestionFallbackEnabled": cfg["loginSecurityQuestionFallbackEnabled"] != false, "trustedDeviceTtlDays": 30, "trustedDevices": items})
}

func (s *Server) userPasswordOK(r *http.Request, u ctxUser, password string) bool {
	var h string
	return s.store.DB.QueryRowContext(r.Context(), `SELECT password_hash FROM users WHERE id=`+s.store.Bind(1), u.ID).Scan(&h) == nil && sec.CheckPassword(h, password)
}
func (s *Server) userSecretOK(r *http.Request, userID int64, code string) bool {
	var h string
	if s.store.DB.QueryRowContext(r.Context(), `SELECT secret_code_hash FROM user_security WHERE user_id=`+s.store.Bind(1), userID).Scan(&h) != nil || h == "" {
		return false
	}
	return sec.CheckPassword(h, code)
}

func (s *Server) securityFallbackPatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	if !s.userPasswordOK(r, u, mapString(in, "currentPassword")) || !s.userSecretOK(r, u.ID, mapString(in, "currentSecretCode")) {
		writeJSON(w, 401, envelope{"error": "verification_failed", "message": "Current password or 6 digit secret is incorrect."})
		return
	}
	clear := mapBool(in, "clearSecurityFallback")
	question := strings.TrimSpace(mapString(in, "securityQuestion"))
	answer := strings.TrimSpace(mapString(in, "securityAnswer"))
	if !clear && len(question) < 8 {
		writeJSON(w, 422, envelope{"error": "question_too_short"})
		return
	}
	var oldSecret, oldAnswer string
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT secret_code_hash,fallback_answer_hash FROM user_security WHERE user_id=`+s.store.Bind(1), u.ID).Scan(&oldSecret, &oldAnswer)
	answerHash := oldAnswer
	if clear {
		question = ""
		answerHash = ""
	} else if answer != "" {
		h, e := sec.HashPassword(answer)
		if e != nil {
			writeJSON(w, 500, envelope{"error": "hash_failed"})
			return
		}
		answerHash = h
	}
	if !clear && answerHash == "" {
		writeJSON(w, 422, envelope{"error": "answer_required"})
		return
	}
	if s.store.Driver == "postgres" {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO user_security(user_id,tenant_id,secret_code_hash,fallback_question,fallback_answer_hash,updated_at) VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET fallback_question=EXCLUDED.fallback_question,fallback_answer_hash=EXCLUDED.fallback_answer_hash,updated_at=CURRENT_TIMESTAMP`, u.ID, u.TenantID, oldSecret, question, answerHash)
	} else {
		_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO user_security(user_id,tenant_id,secret_code_hash,fallback_question,fallback_answer_hash,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE fallback_question=VALUES(fallback_question),fallback_answer_hash=VALUES(fallback_answer_hash),updated_at=CURRENT_TIMESTAMP`, u.ID, u.TenantID, oldSecret, question, answerHash)
	}
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "security_fallback_updated", "user", asString(u.ID), r, nil)
	writeJSON(w, 200, map[string]any{"ok": true, "message": func() string {
		if clear {
			return "Security Question fallback removed."
		}
		return "Security Question fallback updated."
	}()})
}

func (s *Server) securityPatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	if !s.userPasswordOK(r, u, mapString(in, "currentPassword")) {
		writeJSON(w, 401, envelope{"error": "current_password_invalid", "message": "Current password is incorrect."})
		return
	}
	newEmail := strings.ToLower(strings.TrimSpace(mapString(in, "email")))
	newPass := mapString(in, "newPassword")
	newSecret := strings.TrimSpace(mapString(in, "secretCode"))
	if newPass != "" && len(newPass) < 12 {
		writeJSON(w, 422, envelope{"error": "password_too_short"})
		return
	}
	if newSecret != "" && (len(newSecret) != 6 || !digitsOnly(newSecret)) {
		writeJSON(w, 422, envelope{"error": "secret_invalid"})
		return
	}
	if newEmail == "" {
		newEmail = u.Email
	}
	changes := map[string]any{"email": newEmail, "newPassword": newPass, "secretCode": newSecret}
	otp := strings.TrimSpace(mapString(in, "securityOtp"))
	if otp == "" {
		code := randomDigits(6)
		id := randomID("sec")
		if e := s.insertSecurityChallenge(r, u, "security_update", u.Email, code, changes, id); e != nil {
			replyDBError(w, e)
			return
		}
		mailErr := s.sendMail(u.Email, "P2PFlow security verification", fmt.Sprintf("Your P2PFlow security verification code is %s. It expires in 10 minutes.", code))
		msg := "Enter the verification OTP sent to your current email."
		resp := map[string]any{"securityVerificationRequired": true, "message": msg}
		if mailErr != nil {
			if s.cfg.Env == "production" {
				writeJSON(w, 503, envelope{"error": "mail_delivery_failed", "message": "Security OTP could not be delivered. Configure SMTP before changing security settings."})
				return
			}
			resp["debugOtp"] = code
			resp["message"] = msg + " Development OTP: " + code
		}
		writeJSON(w, 200, resp)
		return
	}
	ch, e := s.consumeLatestSecurityChallenge(r, u.ID, "security_update", otp)
	if e != nil {
		writeJSON(w, 401, envelope{"error": "otp_invalid", "message": e.Error()})
		return
	}
	changes = ch
	passHash := ""
	if v := mapString(changes, "newPassword"); v != "" {
		passHash, _ = sec.HashPassword(v)
	}
	secretHash := ""
	if v := mapString(changes, "secretCode"); v != "" {
		secretHash, _ = sec.HashPassword(v)
	}
	email := firstNonEmpty(mapString(changes, "email"), u.Email)
	if passHash != "" {
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE users SET email=`+s.store.Bind(1)+`,password_hash=`+s.store.Bind(2)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3), email, passHash, u.ID)
	} else {
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE users SET email=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2), email, u.ID)
	}
	if secretHash != "" {
		if s.store.Driver == "postgres" {
			_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO user_security(user_id,tenant_id,secret_code_hash,updated_at) VALUES($1,$2,$3,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET secret_code_hash=EXCLUDED.secret_code_hash,password_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`, u.ID, u.TenantID, secretHash)
		} else {
			_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO user_security(user_id,tenant_id,secret_code_hash,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE secret_code_hash=VALUES(secret_code_hash),password_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`, u.ID, u.TenantID, secretHash)
		}
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE trusted_devices SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=`+s.store.Bind(1), u.ID)
	_, _ = s.store.DB.ExecContext(r.Context(), `DELETE FROM sessions WHERE user_id=`+s.store.Bind(1), u.ID)
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "security_settings_updated", "user", asString(u.ID), r, map[string]any{"emailChanged": email != u.Email, "passwordChanged": passHash != "", "secretChanged": secretHash != ""})
	http.SetCookie(w, &http.Cookie{Name: "p2pflow_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode, Domain: s.cfg.CookieDomain})
	writeJSON(w, 200, map[string]any{"ok": true, "fullLoginRequired": true, "message": "Security settings updated. Please sign in again."})
}

func (s *Server) trustedDeviceDelete(w http.ResponseWriter, r *http.Request, u ctxUser) {
	id := parseID(r.PathValue("id"))
	res, _ := s.store.DB.ExecContext(r.Context(), `UPDATE trusted_devices SET revoked_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1)+` AND user_id=`+s.store.Bind(2), id, u.ID)
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSON(w, 404, envelope{"error": "not_found"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "currentDeviceRevoked": false, "message": "Trusted browser revoked."})
}

func (s *Server) emailRecovery(w http.ResponseWriter, r *http.Request) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	ident := strings.ToLower(strings.TrimSpace(mapString(in, "username")))
	var uid, tid int64
	var email, username, hash string
	if s.store.DB.QueryRowContext(r.Context(), `SELECT id,tenant_id,email,username,password_hash FROM users WHERE LOWER(username)=`+s.store.Bind(1)+` OR LOWER(email)=`+s.store.Bind(2)+` ORDER BY id LIMIT 1`, ident, ident).Scan(&uid, &tid, &email, &username, &hash) != nil || !sec.CheckPassword(hash, mapString(in, "password")) {
		writeJSON(w, 401, envelope{"error": "invalid_credentials"})
		return
	}
	if !s.userSecretOK(r, uid, mapString(in, "secretCode")) {
		writeJSON(w, 401, envelope{"error": "invalid_secret"})
		return
	}
	newEmail := strings.ToLower(strings.TrimSpace(mapString(in, "newEmail")))
	if newEmail == "" || !strings.Contains(newEmail, "@") {
		writeJSON(w, 422, envelope{"error": "invalid_email"})
		return
	}
	rid := mapString(in, "recoveryId")
	otp := mapString(in, "recoveryOtp")
	if rid == "" || otp == "" {
		code := randomDigits(6)
		rid = randomID("recover")
		u := ctxUser{ID: uid, TenantID: tid, Email: email, Username: username}
		if e := s.insertSecurityChallenge(r, u, "email_recovery", newEmail, code, map[string]any{"newEmail": newEmail}, rid); e != nil {
			replyDBError(w, e)
			return
		}
		err := s.sendMail(newEmail, "P2PFlow email recovery", fmt.Sprintf("Your P2PFlow email recovery code is %s. It expires in 10 minutes.", code))
		resp := map[string]any{"recoveryOtpRequired": true, "recoveryMode": "email", "recoveryId": rid, "message": "Verification code sent to the new email."}
		if err != nil {
			if s.cfg.Env == "production" {
				writeJSON(w, 503, envelope{"error": "mail_delivery_failed", "message": "Recovery email could not be delivered. Configure SMTP or contact Super Admin."})
				return
			}
			resp["debugOtp"] = code
			resp["message"] = "Development recovery OTP: " + code
		}
		writeJSON(w, 200, resp)
		return
	}
	payload, e := s.consumeSecurityChallengeByID(r, rid, uid, "email_recovery", otp)
	if e != nil {
		writeJSON(w, 401, envelope{"error": "recovery_invalid", "message": e.Error()})
		return
	}
	newEmail = mapString(payload, "newEmail")
	_, e = s.store.DB.ExecContext(r.Context(), `UPDATE users SET email=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2), newEmail, uid)
	if e != nil {
		writeJSON(w, 409, envelope{"error": "email_in_use"})
		return
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `DELETE FROM sessions WHERE user_id=`+s.store.Bind(1), uid)
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE trusted_devices SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=`+s.store.Bind(1), uid)
	writeJSON(w, 200, map[string]any{"ok": true, "message": "Email corrected. Please sign in again.", "fullLoginRequired": true})
}

func (s *Server) enrollTrustedDevice(r *http.Request, u ctxUser, e trustedDeviceEnrollment) error {
	if strings.TrimSpace(e.DeviceID) == "" || len(e.PublicKeyJWK) == 0 {
		return nil
	}
	h := hashToken(e.DeviceID)
	raw := rawJSON(e.PublicKeyJWK)
	hint := e.DeviceID
	if len(hint) > 12 {
		hint = hint[:12]
	}
	exp := time.Now().AddDate(0, 0, 30)
	if s.store.Driver == "postgres" {
		_, err := s.store.DB.ExecContext(r.Context(), `INSERT INTO trusted_devices(tenant_id,user_id,device_hash,label,user_agent,last_ip,last_used_at,expires_at,public_key_jwk,device_id_hint,created_at) VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,$7,$8,$9,CURRENT_TIMESTAMP) ON CONFLICT(user_id,device_hash) DO UPDATE SET label=EXCLUDED.label,user_agent=EXCLUDED.user_agent,last_ip=EXCLUDED.last_ip,last_used_at=CURRENT_TIMESTAMP,expires_at=EXCLUDED.expires_at,revoked_at=NULL,public_key_jwk=EXCLUDED.public_key_jwk,device_id_hint=EXCLUDED.device_id_hint`, u.TenantID, u.ID, h, firstNonEmpty(e.Name, "Browser"), r.UserAgent(), clientIP(r), exp, raw, hint)
		return err
	}
	_, err := s.store.DB.ExecContext(r.Context(), `INSERT INTO trusted_devices(tenant_id,user_id,device_hash,label,user_agent,last_ip,last_used_at,expires_at,public_key_jwk,device_id_hint,created_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE label=VALUES(label),user_agent=VALUES(user_agent),last_ip=VALUES(last_ip),last_used_at=CURRENT_TIMESTAMP,expires_at=VALUES(expires_at),revoked_at=NULL,public_key_jwk=VALUES(public_key_jwk),device_id_hint=VALUES(device_id_hint)`, u.TenantID, u.ID, h, firstNonEmpty(e.Name, "Browser"), r.UserAgent(), clientIP(r), exp, raw, hint)
	return err
}

func (s *Server) deviceChallenge(w http.ResponseWriter, r *http.Request) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	deviceID := mapString(in, "deviceId")
	if deviceID == "" {
		writeJSON(w, 200, map[string]any{"trustedDevice": false})
		return
	}
	var did, uid int64
	var username, name string
	var exp time.Time
	if s.store.DB.QueryRowContext(r.Context(), `SELECT d.id,d.user_id,u.username,u.name,d.expires_at FROM trusted_devices d JOIN users u ON u.id=d.user_id WHERE d.device_hash=`+s.store.Bind(1)+` AND d.revoked_at IS NULL AND d.expires_at>CURRENT_TIMESTAMP AND u.status='active' ORDER BY d.id DESC LIMIT 1`, hashToken(deviceID)).Scan(&did, &uid, &username, &name, &exp) != nil {
		writeJSON(w, 200, map[string]any{"trustedDevice": false, "fullLoginRequired": true})
		return
	}
	payload := randomID("sign") + ":" + strconv.FormatInt(time.Now().UnixMilli(), 10)
	cid := randomID("dev")
	_, _ = s.store.DB.ExecContext(r.Context(), `INSERT INTO device_auth_challenges(id,trusted_device_id,signing_payload,expires_at,created_at) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`,`+s.store.Bind(3)+`,`+s.store.Bind(4)+`,CURRENT_TIMESTAMP)`, cid, did, payload, time.Now().Add(2*time.Minute))
	writeJSON(w, 200, map[string]any{"trustedDevice": true, "challengeId": cid, "signingPayload": payload, "accountHint": firstNonEmpty(name, username), "username": username, "expiresAt": exp})
}
func (s *Server) deviceLogin(w http.ResponseWriter, r *http.Request) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	cid := mapString(in, "challengeId")
	deviceID := mapString(in, "deviceId")
	sig := mapString(in, "signature")
	var did, uid, tid int64
	var payload, jwkRaw, email, username, name, role string
	var owner, super bool
	err := s.store.DB.QueryRowContext(r.Context(), `SELECT c.trusted_device_id,d.user_id,d.tenant_id,c.signing_payload,COALESCE(d.public_key_jwk,'{}'),u.email,u.username,u.name,u.role_code,u.is_owner,u.is_super_admin FROM device_auth_challenges c JOIN trusted_devices d ON d.id=c.trusted_device_id JOIN users u ON u.id=d.user_id WHERE c.id=`+s.store.Bind(1)+` AND c.used_at IS NULL AND c.expires_at>CURRENT_TIMESTAMP AND d.device_hash=`+s.store.Bind(2)+` AND d.revoked_at IS NULL AND d.expires_at>CURRENT_TIMESTAMP`, cid, hashToken(deviceID)).Scan(&did, &uid, &tid, &payload, &jwkRaw, &email, &username, &name, &role, &owner, &super)
	if err != nil {
		writeJSON(w, 401, envelope{"error": "trusted_device_expired", "fullLoginRequired": true})
		return
	}
	if !verifyECDSAJWK(jwkRaw, payload, sig) || !s.userSecretOK(r, uid, mapString(in, "secretCode")) {
		writeJSON(w, 401, envelope{"error": "trusted_device_verification_failed"})
		return
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE device_auth_challenges SET used_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), cid)
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE trusted_devices SET last_used_at=CURRENT_TIMESTAMP,last_ip=`+s.store.Bind(1)+` WHERE id=`+s.store.Bind(2), clientIP(r), did)
	token, e := s.createSession(r, uid, tid)
	if e != nil {
		replyDBError(w, e)
		return
	}
	s.setSessionCookie(w, token)
	u := ctxUser{ID: uid, TenantID: tid, Email: email, Username: username, Name: name, Role: role, IsOwner: owner, IsSuperAdmin: super}
	writeJSON(w, 200, map[string]any{"ok": true, "trustedDevice": true, "user": s.userSafe(r.Context(), u)})
}
func (s *Server) deviceUpgrade(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 401, envelope{"error": "full_login_required", "fullLoginRequired": true, "message": "Complete one full login to enroll this browser."})
}
func (s *Server) deviceLegacy(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"legacySession": false})
}

func (s *Server) insertSecurityChallenge(r *http.Request, u ctxUser, purpose, target, code string, payload map[string]any, id string) error {
	_, e := s.store.DB.ExecContext(r.Context(), `INSERT INTO security_challenges(id,tenant_id,user_id,purpose,target,code_hash,payload_json,expires_at,created_at) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`,`+s.store.Bind(3)+`,`+s.store.Bind(4)+`,`+s.store.Bind(5)+`,`+s.store.Bind(6)+`,`+s.store.Bind(7)+`,`+s.store.Bind(8)+`,CURRENT_TIMESTAMP)`, id, u.TenantID, u.ID, purpose, target, hashToken(code), rawJSON(payload), time.Now().Add(10*time.Minute))
	return e
}
func (s *Server) consumeLatestSecurityChallenge(r *http.Request, userID int64, purpose, code string) (map[string]any, error) {
	var id, raw, hash string
	var attempts int
	err := s.store.DB.QueryRowContext(r.Context(), `SELECT id,payload_json,code_hash,attempts FROM security_challenges WHERE user_id=`+s.store.Bind(1)+` AND purpose=`+s.store.Bind(2)+` AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 1`, userID, purpose).Scan(&id, &raw, &hash, &attempts)
	if err != nil {
		return nil, fmt.Errorf("verification challenge expired")
	}
	if attempts >= 5 {
		return nil, fmt.Errorf("too many attempts")
	}
	if hashToken(code) != hash {
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE security_challenges SET attempts=attempts+1 WHERE id=`+s.store.Bind(1), id)
		return nil, fmt.Errorf("verification code is incorrect")
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE security_challenges SET verified_at=CURRENT_TIMESTAMP,used_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), id)
	return jsonMap(raw), nil
}
func (s *Server) consumeSecurityChallengeByID(r *http.Request, id string, userID int64, purpose, code string) (map[string]any, error) {
	var raw, hash string
	var attempts int
	err := s.store.DB.QueryRowContext(r.Context(), `SELECT payload_json,code_hash,attempts FROM security_challenges WHERE id=`+s.store.Bind(1)+` AND user_id=`+s.store.Bind(2)+` AND purpose=`+s.store.Bind(3)+` AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP`, id, userID, purpose).Scan(&raw, &hash, &attempts)
	if err != nil {
		return nil, fmt.Errorf("recovery challenge expired")
	}
	if attempts >= 5 || hashToken(code) != hash {
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE security_challenges SET attempts=attempts+1 WHERE id=`+s.store.Bind(1), id)
		return nil, fmt.Errorf("recovery code is incorrect")
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE security_challenges SET verified_at=CURRENT_TIMESTAMP,used_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), id)
	return jsonMap(raw), nil
}
func (s *Server) sendMail(to, subject, body string) error {
	if s.cfg.SMTPHost == "" || s.cfg.SMTPFrom == "" {
		return fmt.Errorf("smtp not configured")
	}
	addr := fmt.Sprintf("%s:%d", s.cfg.SMTPHost, s.cfg.SMTPPort)
	var auth smtp.Auth
	if s.cfg.SMTPUser != "" {
		auth = smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPassword, s.cfg.SMTPHost)
	}
	fromHeader := s.cfg.SMTPFrom
	if s.cfg.SMTPFromName != "" {
		fromHeader = fmt.Sprintf("%s <%s>", s.cfg.SMTPFromName, s.cfg.SMTPFrom)
	}
	msg := []byte("From: " + fromHeader + "\r\nTo: " + to + "\r\nSubject: " + subject + "\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" + body + "\r\n")
	return smtp.SendMail(addr, auth, s.cfg.SMTPFrom, []string{to}, msg)
}
func verifyECDSAJWK(raw, payload, sig string) bool {
	var j map[string]any
	if json.Unmarshal([]byte(raw), &j) != nil {
		return false
	}
	if asString(j["kty"]) != "EC" || asString(j["crv"]) != "P-256" {
		return false
	}
	xb, e1 := base64.RawURLEncoding.DecodeString(asString(j["x"]))
	yb, e2 := base64.RawURLEncoding.DecodeString(asString(j["y"]))
	sb, e3 := base64.RawURLEncoding.DecodeString(sig)
	if e1 != nil || e2 != nil || e3 != nil || len(sb) != 64 {
		return false
	}
	x := new(big.Int).SetBytes(xb)
	y := new(big.Int).SetBytes(yb)
	if !elliptic.P256().IsOnCurve(x, y) {
		return false
	}
	h := sha256.Sum256([]byte(payload))
	r := new(big.Int).SetBytes(sb[:32])
	ss := new(big.Int).SetBytes(sb[32:])
	return ecdsa.Verify(&ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y}, h[:], r, ss)
}
func randomDigits(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = '0' + b[i]%10
	}
	return string(b)
}
func randomID(prefix string) string {
	b := make([]byte, 18)
	_, _ = rand.Read(b)
	return prefix + "_" + base64.RawURLEncoding.EncodeToString(b)
}
func digitsOnly(v string) bool {
	for _, r := range v {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
func clientIP(r *http.Request) string {
	if x := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0]); x != "" {
		return x
	}
	return r.RemoteAddr
}
