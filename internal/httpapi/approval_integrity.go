package httpapi

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"
)

func (s *Server) finalActionApprovalIssues(ctx context.Context, u ctxUser, o orderRecord, action string) ([]map[string]any, map[string]any) {
	settings := s.publicSettings(ctx, u.TenantID)
	splits := s.orderSplits(ctx, u, o.ID)
	gate := finalActionSplitGate(o.TradeType, o.OrderSource, settings, splits)
	direction := asString(gate["direction"])
	target := o.Total
	if target <= 0 {
		target = mapFloat(jsonMap(o.Raw), "totalPrice", "totalAmount", "fiatAmount")
	}
	if target <= 0 {
		target = o.Amount
	}
	actual := 0.0
	missingProof := 0
	for _, sp := range splits {
		if !strings.EqualFold(asString(sp["direction"]), direction) || asFloat(sp["actualAmount"]) <= 0 {
			continue
		}
		actual += asFloat(sp["actualAmount"])
		if mapBool(gate, "proofRequired") && !mapBool(sp, "hasProof") {
			missingProof++
		}
	}
	issues := []map[string]any{}
	if mapBool(gate, "enabled") && asInt64(gate["relevantSplitCount"]) == 0 {
		issues = append(issues, map[string]any{"code": "split_missing", "message": "Required payment split is missing."})
	}
	if missingProof > 0 {
		issues = append(issues, map[string]any{"code": "proof_missing", "count": missingProof, "message": "One or more payment splits are missing proof."})
	}
	tolerance := mapFloat(settings, "mismatchTolerance")
	if tolerance < 0 {
		tolerance = 0
	}
	if target > 0 && actual > 0 && math.Abs(target-actual) > tolerance {
		issues = append(issues, map[string]any{"code": "amount_mismatch", "target": target, "actual": actual, "difference": target - actual, "tolerance": tolerance})
	}
	threshold := mapFloat(settings, "highAmountApprovalThreshold")
	if threshold > 0 && target >= threshold {
		issues = append(issues, map[string]any{"code": "high_amount", "amount": target, "threshold": threshold})
	}
	snapshot := map[string]any{"orderId": o.ID, "orderNo": o.ExternalNo, "action": action, "target": target, "actual": actual, "direction": direction, "splitCount": len(splits), "gate": gate}
	return issues, snapshot
}

func approvalDigest(issues []map[string]any, snapshot map[string]any) string {
	return hashToken(rawJSON(map[string]any{"issues": issues, "snapshot": snapshot}))[:24]
}

// ensureFinalActionApproval creates exactly one approval request for the current
// risk snapshot. A rejected request remains rejected until the underlying split
// or amount snapshot changes, preventing request-spam without blocking fixes.
func (s *Server) ensureFinalActionApproval(ctx context.Context, u ctxUser, o orderRecord, action string) (int64, bool, []map[string]any, error) {
	if action != "mark_paid" && action != "paid" && action != "release" && action != "quick_release" {
		return 0, true, nil, nil
	}
	issues, snapshot := s.finalActionApprovalIssues(ctx, u, o, action)
	if len(issues) == 0 {
		return 0, true, nil, nil
	}
	key := fmt.Sprintf("order:%d:%s:%s", o.ID, action, approvalDigest(issues, snapshot))
	var id int64
	var status string
	if err := s.store.DB.QueryRowContext(ctx, `SELECT id,status FROM approvals WHERE tenant_id=`+s.store.Bind(1)+` AND action_key=`+s.store.Bind(2)+` ORDER BY id DESC LIMIT 1`, u.TenantID, key).Scan(&id, &status); err == nil {
		return id, status == "approved", issues, nil
	} else if err != sql.ErrNoRows {
		return 0, false, issues, err
	}
	payload := map[string]any{"orderId": o.ID, "action": action, "issues": issues, "summarySnapshot": snapshot, "actionKey": key}
	if s.store.Driver == "postgres" {
		err := s.store.DB.QueryRowContext(ctx, `INSERT INTO approvals(tenant_id,requested_by,kind,payload_json,status,action_key,created_at,updated_at) VALUES($1,$2,'order_final_action',$3,'pending',$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`, u.TenantID, u.ID, rawJSON(payload), key).Scan(&id)
		if err != nil {
			// A concurrent request may have won the unique key race.
			_ = s.store.DB.QueryRowContext(ctx, `SELECT id FROM approvals WHERE tenant_id=$1 AND action_key=$2 ORDER BY id DESC LIMIT 1`, u.TenantID, key).Scan(&id)
		}
	} else {
		res, err := s.store.DB.ExecContext(ctx, `INSERT INTO approvals(tenant_id,requested_by,kind,payload_json,status,action_key,created_at,updated_at) VALUES(?,?,'order_final_action',?,'pending',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, u.TenantID, u.ID, rawJSON(payload), key)
		if err == nil {
			id, _ = res.LastInsertId()
		}
	}
	if id <= 0 {
		return 0, false, issues, fmt.Errorf("approval request could not be created")
	}
	s.svc.Notify(ctx, u.TenantID, 0, "approval", "Manager approval required", fmt.Sprintf("Order %s requires approval for %s.", firstNonEmpty(o.ExternalNo, fmt.Sprint(o.ID)), action), map[string]any{"orderId": o.ID, "approvalId": id, "category": "accounting"})
	return id, false, issues, nil
}

func (s *Server) claimApprovalExecution(ctx context.Context, tenantID, approvalID int64) bool {
	if approvalID <= 0 {
		return true
	}
	res, err := s.store.DB.ExecContext(ctx, `UPDATE approvals SET status='executing',execution_started_at=CURRENT_TIMESTAMP,execution_error='',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1)+` AND tenant_id=`+s.store.Bind(2)+` AND status='approved'`, approvalID, tenantID)
	if err != nil {
		return false
	}
	n, _ := res.RowsAffected()
	return n == 1
}

func (s *Server) finishApprovalExecution(ctx context.Context, tenantID, approvalID int64, success bool, errText string) {
	if approvalID <= 0 {
		return
	}
	status := "used"
	if !success {
		status = "execution_failed"
	}
	_, _ = s.store.DB.ExecContext(ctx, `UPDATE approvals SET status=`+s.store.Bind(1)+`,execution_finished_at=CURRENT_TIMESTAMP,execution_error=`+s.store.Bind(2)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(3)+` AND tenant_id=`+s.store.Bind(4)+` AND status='executing'`, status, errText, approvalID, tenantID)
}

func (s *Server) orderApprovals(ctx context.Context, tenantID, orderID int64) []map[string]any {
	rows, err := s.store.DB.QueryContext(ctx, `SELECT a.id,COALESCE(a.requested_by,0),COALESCE(ru.name,''),COALESCE(a.approved_by,0),COALESCE(au.name,''),a.kind,a.payload_json,a.status,a.execution_error,a.created_at,a.updated_at FROM approvals a LEFT JOIN users ru ON ru.id=a.requested_by LEFT JOIN users au ON au.id=a.approved_by WHERE a.tenant_id=`+s.store.Bind(1)+` AND a.kind='order_final_action' ORDER BY a.id DESC LIMIT 100`, tenantID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, requestedBy, approvedBy int64
		var requestedName, approvedName, kind, raw, status, executionError string
		var created, updated time.Time
		if rows.Scan(&id, &requestedBy, &requestedName, &approvedBy, &approvedName, &kind, &raw, &status, &executionError, &created, &updated) != nil {
			continue
		}
		p := jsonMap(raw)
		if mapInt64(p, "orderId") != orderID {
			continue
		}
		out = append(out, map[string]any{"id": id, "kind": kind, "action": mapString(p, "action"), "issues": firstMapValue(p, "issues"), "summarySnapshot": firstMapValue(p, "summarySnapshot"), "requestedBy": requestedBy, "requestedByName": requestedName, "approvedBy": approvedBy, "approvedByName": approvedName, "status": status, "decisionNote": mapString(p, "decisionNote"), "executionError": executionError, "requestedAt": created, "updatedAt": updated})
	}
	return out
}
