package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"
)

type notificationDelivery struct {
	ID             int64
	TenantID       int64
	NotificationID int64
	UserID         int64
	Channel        string
	Destination    string
	AttemptCount   int
}

func notificationCategory(kind, raw string) string {
	if d := jsonMap(raw); d != nil {
		if c := strings.ToLower(strings.TrimSpace(mapString(d, "category"))); c != "" {
			switch c {
			case "orders", "messages", "payments", "accounting", "system", "security", "billing":
				return c
			}
		}
	}
	k := strings.ToLower(strings.TrimSpace(kind))
	switch {
	case strings.Contains(k, "security"), strings.Contains(k, "login"), strings.Contains(k, "password"), strings.Contains(k, "recovery"), strings.Contains(k, "trusted_device"), strings.Contains(k, "device_auth"):
		return "security"
	case strings.Contains(k, "billing"), strings.Contains(k, "subscription"), strings.Contains(k, "invoice"):
		return "billing"
	case strings.Contains(k, "chat"), strings.Contains(k, "message"):
		return "messages"
	case strings.Contains(k, "payment"), strings.Contains(k, "split"):
		return "payments"
	case strings.Contains(k, "approval"), strings.Contains(k, "accounting"), strings.Contains(k, "ledger"), strings.Contains(k, "closing"):
		return "accounting"
	case strings.Contains(k, "order"), strings.Contains(k, "coagent"):
		return "orders"
	default:
		return "system"
	}
}

func (s *Server) notificationDeliveryLoop(ctx context.Context) {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	// Give migrations/startup a small window before the first background query.
	timer := time.NewTimer(750 * time.Millisecond)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return
	case <-timer.C:
		s.processNotificationDeliveries(ctx)
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.processNotificationDeliveries(ctx)
		}
	}
}

func (s *Server) processNotificationDeliveries(ctx context.Context) {
	if !s.claimLease(ctx, "notification-delivery:global", 2*time.Minute) {
		return
	}
	// A crashed worker must never leave a durable delivery permanently claimed.
	_, _ = s.store.DB.ExecContext(ctx, `UPDATE notification_deliveries SET status='retry',claimed_at=NULL,available_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE status='processing' AND claimed_at<`+s.store.Bind(1), time.Now().UTC().Add(-5*time.Minute))
	s.queueNotificationDeliveries(ctx, 80)

	rows, err := s.store.DB.QueryContext(ctx, `SELECT id,tenant_id,notification_id,user_id,channel,destination,attempt_count FROM notification_deliveries WHERE status IN ('pending','retry') AND available_at<=CURRENT_TIMESTAMP ORDER BY id LIMIT 100`)
	if err != nil {
		return
	}
	var jobs []notificationDelivery
	for rows.Next() {
		var x notificationDelivery
		if rows.Scan(&x.ID, &x.TenantID, &x.NotificationID, &x.UserID, &x.Channel, &x.Destination, &x.AttemptCount) == nil {
			jobs = append(jobs, x)
		}
	}
	_ = rows.Close()
	if len(jobs) == 0 {
		return
	}

	claimed := make([]notificationDelivery, 0, len(jobs))
	for _, job := range jobs {
		res, err := s.store.DB.ExecContext(ctx, `UPDATE notification_deliveries SET status='processing',attempt_count=attempt_count+1,claimed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1)+` AND status IN ('pending','retry')`, job.ID)
		if err != nil {
			continue
		}
		if n, _ := res.RowsAffected(); n == 1 {
			job.AttemptCount++
			claimed = append(claimed, job)
		}
	}

	max := s.cfg.PushDeliveryConcurrency
	if max < 1 {
		max = 1
	}
	sem := make(chan struct{}, max)
	var wg sync.WaitGroup
	for _, job := range claimed {
		job := job
		wg.Add(1)
		go func() {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				return
			}
			s.deliverNotification(ctx, job)
		}()
	}
	wg.Wait()
}

func (s *Server) queueNotificationDeliveries(ctx context.Context, limit int) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.store.DB.QueryContext(ctx, `SELECT id,tenant_id,COALESCE(user_id,0),kind,data_json FROM notifications WHERE delivery_queued_at IS NULL ORDER BY id LIMIT `+fmt.Sprint(limit))
	if err != nil {
		return
	}
	type pending struct {
		id, tid, uid int64
		kind, raw    string
	}
	var all []pending
	for rows.Next() {
		var x pending
		if rows.Scan(&x.id, &x.tid, &x.uid, &x.kind, &x.raw) == nil {
			all = append(all, x)
		}
	}
	_ = rows.Close()
	for _, n := range all {
		category := notificationCategory(n.kind, n.raw)
		mandatory := category == "security"
		s.queueEmailRecipients(ctx, n.id, n.tid, n.uid, category, mandatory)
		s.queuePushRecipients(ctx, n.id, n.tid, n.uid, category, mandatory, mapInt64(jsonMap(n.raw), "credentialId", "exchangeAccountId"))
		_, _ = s.store.DB.ExecContext(ctx, `UPDATE notifications SET delivery_queued_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1)+` AND delivery_queued_at IS NULL`, n.id)
	}
}

func (s *Server) queueEmailRecipients(ctx context.Context, notificationID, tenantID, userID int64, category string, mandatory bool) {
	if strings.TrimSpace(s.cfg.SMTPHost) == "" || strings.TrimSpace(s.cfg.SMTPFrom) == "" {
		return
	}
	userFilter := ""
	args := []any{notificationID, tenantID, category, mandatory}
	if userID > 0 {
		userFilter = ` AND u.id=` + s.store.Bind(5)
		args = append(args, userID)
	}
	if s.store.Driver == "postgres" {
		q := `INSERT INTO notification_deliveries(tenant_id,notification_id,user_id,channel,destination,destination_key,status,available_at,created_at,updated_at) SELECT u.tenant_id,$1,u.id,'email',u.email,md5(u.email),'pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM users u LEFT JOIN notification_preferences p ON p.user_id=u.id AND p.category=$3 WHERE u.tenant_id=$2 AND u.status='active' AND u.email<>'' AND ($4=TRUE OR COALESCE(p.email,TRUE)=TRUE)` + userFilter + ` ON CONFLICT(notification_id,user_id,channel,destination) DO NOTHING`
		_, _ = s.store.DB.ExecContext(ctx, q, args...)
		return
	}
	q := `INSERT IGNORE INTO notification_deliveries(tenant_id,notification_id,user_id,channel,destination,destination_key,status,available_at,created_at,updated_at) SELECT u.tenant_id,?,u.id,'email',u.email,LOWER(SHA2(u.email,256)),'pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM users u LEFT JOIN notification_preferences p ON p.user_id=u.id AND p.category=? WHERE u.tenant_id=? AND u.status='active' AND u.email<>'' AND (?=TRUE OR COALESCE(p.email,TRUE)=TRUE)`
	// MySQL placeholder order differs because the portable Store.Bind helper only
	// numbers PostgreSQL parameters. Keep the arguments explicitly aligned.
	mysqlArgs := []any{notificationID, category, tenantID, mandatory}
	if userID > 0 {
		q += ` AND u.id=?`
		mysqlArgs = append(mysqlArgs, userID)
	}
	_, _ = s.store.DB.ExecContext(ctx, q, mysqlArgs...)
}

func (s *Server) queuePushRecipients(ctx context.Context, notificationID, tenantID, userID int64, category string, mandatory bool, credentialID int64) {
	if strings.TrimSpace(s.cfg.VAPIDPrivateKey) == "" || strings.TrimSpace(s.cfg.VAPIDSubject) == "" {
		return
	}
	if s.store.Driver == "postgres" {
		args := []any{notificationID, tenantID, category, mandatory, credentialID}
		filter := ""
		if userID > 0 {
			filter = ` AND u.id=$6`
			args = append(args, userID)
		}
		q := `INSERT INTO notification_deliveries(tenant_id,notification_id,user_id,channel,destination,destination_key,status,available_at,created_at,updated_at) SELECT u.tenant_id,$1,u.id,'push',ps.endpoint,md5(ps.endpoint),'pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM users u JOIN push_subscriptions ps ON ps.user_id=u.id AND ps.tenant_id=u.tenant_id AND ps.disabled_at IS NULL JOIN trusted_devices td ON td.id=ps.trusted_device_id AND td.user_id=u.id AND td.revoked_at IS NULL AND td.expires_at>CURRENT_TIMESTAMP LEFT JOIN notification_preferences p ON p.user_id=u.id AND p.category=$3 WHERE u.tenant_id=$2 AND u.status='active' AND ($4=TRUE OR COALESCE(p.push,TRUE)=TRUE) AND ($5=0 OR ps.exchange_account_id IS NULL OR ps.exchange_account_id=$5)` + filter + ` ON CONFLICT DO NOTHING`
		_, _ = s.store.DB.ExecContext(ctx, q, args...)
		return
	}
	q := `INSERT IGNORE INTO notification_deliveries(tenant_id,notification_id,user_id,channel,destination,destination_key,status,available_at,created_at,updated_at) SELECT u.tenant_id,?,u.id,'push',ps.endpoint,LOWER(SHA2(ps.endpoint,256)),'pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM users u JOIN push_subscriptions ps ON ps.user_id=u.id AND ps.tenant_id=u.tenant_id AND ps.disabled_at IS NULL JOIN trusted_devices td ON td.id=ps.trusted_device_id AND td.user_id=u.id AND td.revoked_at IS NULL AND td.expires_at>CURRENT_TIMESTAMP LEFT JOIN notification_preferences p ON p.user_id=u.id AND p.category=? WHERE u.tenant_id=? AND u.status='active' AND (?=TRUE OR COALESCE(p.push,TRUE)=TRUE) AND (?=0 OR ps.exchange_account_id IS NULL OR ps.exchange_account_id=?)`
	args := []any{notificationID, category, tenantID, mandatory, credentialID, credentialID}
	if userID > 0 {
		q += ` AND u.id=?`
		args = append(args, userID)
	}
	_, _ = s.store.DB.ExecContext(ctx, q, args...)
}

func (s *Server) deliverNotification(ctx context.Context, job notificationDelivery) {
	var title, body, raw string
	if err := s.store.DB.QueryRowContext(ctx, `SELECT title,body,data_json FROM notifications WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2), job.NotificationID, job.TenantID).Scan(&title, &body, &raw); err != nil {
		s.finishNotificationDelivery(ctx, job, 0, fmt.Errorf("notification unavailable: %w", err))
		return
	}
	var status int
	var err error
	switch job.Channel {
	case "email":
		err = s.sendMail(job.Destination, title, body)
	case "push":
		var p256dh, auth string
		err = s.store.DB.QueryRowContext(ctx, `SELECT p256dh,auth FROM push_subscriptions WHERE tenant_id=`+s.store.Bind(1)+` AND user_id=`+s.store.Bind(2)+` AND endpoint=`+s.store.Bind(3)+` AND disabled_at IS NULL`, job.TenantID, job.UserID, job.Destination).Scan(&p256dh, &auth)
		if err == nil {
			data := jsonMap(raw)
			if data == nil {
				data = map[string]any{}
			}
			if _, ok := data["url"]; !ok {
				if orderID := mapInt64(data, "orderId"); orderID > 0 {
					data["url"] = "/orders?orderId=" + fmt.Sprint(orderID)
				} else {
					data["url"] = "/notifications"
				}
			}
			data["createdAt"] = time.Now().UTC().Format(time.RFC3339Nano)
			payload, _ := json.Marshal(map[string]any{"title": title, "body": body, "tag": fmt.Sprintf("p2pflow-notification-%d", job.NotificationID), "data": data})
			status, err = s.sendWebPush(ctx, webPushSubscription{Endpoint: job.Destination, P256DH: p256dh, Auth: auth}, payload)
		}
		if status == 404 || status == 410 {
			_, _ = s.store.DB.ExecContext(ctx, `UPDATE push_subscriptions SET disabled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=`+s.store.Bind(1)+` AND user_id=`+s.store.Bind(2)+` AND endpoint=`+s.store.Bind(3), job.TenantID, job.UserID, job.Destination)
		}
	default:
		err = fmt.Errorf("unsupported delivery channel %q", job.Channel)
	}
	s.finishNotificationDelivery(ctx, job, status, err)
}

func (s *Server) finishNotificationDelivery(ctx context.Context, job notificationDelivery, pushStatus int, deliveryErr error) {
	if deliveryErr == nil {
		_, _ = s.store.DB.ExecContext(ctx, `UPDATE notification_deliveries SET status='delivered',delivered_at=CURRENT_TIMESTAMP,claimed_at=NULL,last_error='',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), job.ID)
		return
	}
	msg := strings.TrimSpace(deliveryErr.Error())
	if len(msg) > 1500 {
		msg = msg[:1500]
	}
	terminal := job.AttemptCount >= 6 || pushStatus == 404 || pushStatus == 410
	if terminal {
		_, _ = s.store.DB.ExecContext(ctx, `UPDATE notification_deliveries SET status='failed',claimed_at=NULL,last_error=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2), msg, job.ID)
		return
	}
	backoff := time.Minute * time.Duration(1<<minInt(job.AttemptCount-1, 6))
	if backoff > time.Hour {
		backoff = time.Hour
	}
	_, _ = s.store.DB.ExecContext(ctx, `UPDATE notification_deliveries SET status='retry',claimed_at=NULL,last_error=`+s.store.Bind(1)+`,available_at=`+s.store.Bind(2)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3), msg, time.Now().UTC().Add(backoff), job.ID)
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
