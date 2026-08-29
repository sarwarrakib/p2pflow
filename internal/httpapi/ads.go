package httpapi

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"p2pflow/v2/internal/binance"
	"p2pflow/v2/internal/events"
)

type adRecord struct {
	ID, TenantID, AccountID                                 int64
	AdvNo, Status, TradeType, Asset, Fiat, Raw, Label, Nick string
	Price, Surplus                                          float64
	CreatedAt, UpdatedAt                                    time.Time
}

func (s *Server) registerAdsRoutes() {
	s.mux.HandleFunc("GET /api/ads", s.requirePerm("ads.view", s.adsList))
	s.mux.HandleFunc("POST /api/ads", s.requirePerm("ads.manage", s.adCreate))
	s.mux.HandleFunc("PATCH /api/ads/{id}", s.requirePerm("ads.manage", s.adPatch))
	s.mux.HandleFunc("DELETE /api/ads/{id}", s.requirePerm("ads.manage", s.adDelete))
	s.mux.HandleFunc("POST /api/ads/{id}/publish", s.requirePerm("ads.manage", s.adPublish))
	s.mux.HandleFunc("POST /api/ads/{id}/status", s.requirePerm("ads.manage", s.adStatus))
	s.mux.HandleFunc("POST /api/ads/sync", s.requirePerm("ads.view", s.adsSync))
	s.mux.HandleFunc("POST /api/ads/merchant-control", s.requirePerm("ads.manage", s.adsMerchantControl))
	s.mux.HandleFunc("GET /api/ads/merchant-status", s.requirePerm("ads.view", s.adsMerchantStatus))
	s.mux.HandleFunc("GET /api/ads/payment-options", s.requirePerm("ads.view", s.adsPaymentOptions))
	s.mux.HandleFunc("GET /api/ads/reference-price", s.requirePerm("ads.view", s.adsReferencePrice))
	s.mux.HandleFunc("GET /api/ads/fee-rates", s.requirePerm("ads.view", s.adsFeeRates))
	s.mux.HandleFunc("GET /api/ads/asset-balance", s.requirePerm("ads.view", s.adsAssetBalance))
}
func (s *Server) adSelect() string {
	return `SELECT a.id,a.tenant_id,a.exchange_account_id,a.external_adv_no,a.status,a.trade_type,a.asset,a.fiat,a.price,a.surplus_amount,a.raw_json,a.created_at,a.updated_at,COALESCE(e.label,''),COALESCE(e.p2p_nickname,'') FROM advertisements a JOIN exchange_accounts e ON e.id=a.exchange_account_id`
}
func (s *Server) scanAd(row interface{ Scan(...any) error }) (adRecord, error) {
	var a adRecord
	err := row.Scan(&a.ID, &a.TenantID, &a.AccountID, &a.AdvNo, &a.Status, &a.TradeType, &a.Asset, &a.Fiat, &a.Price, &a.Surplus, &a.Raw, &a.CreatedAt, &a.UpdatedAt, &a.Label, &a.Nick)
	return a, err
}
func (s *Server) getAd(ctx context.Context, u ctxUser, id int64, perm string) (adRecord, error) {
	a, e := s.scanAd(s.store.DB.QueryRowContext(ctx, s.adSelect()+` WHERE a.tenant_id=`+s.store.Bind(1)+` AND a.id=`+s.store.Bind(2), u.TenantID, id))
	if e == nil && !s.accountPerm(ctx, u, a.AccountID, perm) {
		return a, sql.ErrNoRows
	}
	return a, e
}
func (s *Server) adMap(a adRecord) map[string]any {
	raw := jsonMap(a.Raw)
	out := map[string]any{}
	for k, v := range raw {
		out[k] = v
	}
	out["id"] = a.ID
	out["advNo"] = a.AdvNo
	out["externalAdvNo"] = a.AdvNo
	out["status"] = a.Status
	out["advStatus"] = func() int {
		switch a.Status {
		case "online":
			return 1
		case "closed":
			return 4
		default:
			return 3
		}
	}()
	out["tradeType"] = strings.ToUpper(a.TradeType)
	out["asset"] = a.Asset
	out["fiatUnit"] = a.Fiat
	out["fiat"] = a.Fiat
	out["price"] = a.Price
	out["surplusAmount"] = a.Surplus
	if _, ok := out["initAmount"]; !ok {
		out["initAmount"] = a.Surplus
	}
	out["editableAmount"] = a.Surplus
	out["credentialId"] = a.AccountID
	out["credentialName"] = firstNonEmpty(a.Nick, a.Label)
	out["credentialDisplayName"] = firstNonEmpty(a.Nick, a.Label)
	out["p2pUsername"] = a.Nick
	out["binanceAccount"] = map[string]any{"id": a.AccountID, "name": firstNonEmpty(a.Nick, a.Label), "displayName": firstNonEmpty(a.Nick, a.Label), "p2pUsername": a.Nick, "accountName": a.Label}
	out["createdAt"] = a.CreatedAt
	out["updatedAt"] = a.UpdatedAt
	return out
}
func (s *Server) adsList(w http.ResponseWriter, r *http.Request, u ctxUser) {
	cid := asInt64(requestString(r, "credentialId"))
	accounts := s.accessibleAccounts(r.Context(), u, "ads.view")
	rows, e := s.store.DB.QueryContext(r.Context(), s.adSelect()+` WHERE a.tenant_id=`+s.store.Bind(1)+` ORDER BY a.updated_at DESC LIMIT 1000`, u.TenantID)
	if e != nil {
		replyDBError(w, e)
		return
	}
	defer rows.Close()
	var items []map[string]any
	assets := map[string]bool{}
	fiats := map[string]bool{}
	for rows.Next() {
		a, e := s.scanAd(rows)
		if e != nil || !accounts[a.AccountID] || (cid > 0 && a.AccountID != cid) {
			continue
		}
		items = append(items, s.adMap(a))
		assets[a.Asset] = true
		fiats[a.Fiat] = true
	}
	opts := s.credentialOptions(r.Context(), u)
	pmBy := map[string]any{}
	genericBy := map[string]any{}
	for _, o := range opts {
		id := asInt64(o["id"])
		if !accounts[id] {
			continue
		}
		pms := s.adPaymentMethods(r.Context(), u, id)
		pmBy[fmt.Sprint(id)] = pms
		genericBy[fmt.Sprint(id)] = pms
	}
	selected := cid
	if selected == 0 && len(opts) == 1 {
		selected = asInt64(opts[0]["id"])
	}
	merBy := map[string]any{}
	targets := []map[string]any{}
	for _, o := range opts {
		id := asInt64(o["id"])
		if !accounts[id] {
			continue
		}
		controls := s.merchantControlSnapshot(r.Context(), u, id, false)
		merBy[fmt.Sprint(id)] = controls
		t := map[string]any{}
		for k, v := range o {
			t[k] = v
		}
		t["configured"] = true
		t["canManage"] = s.accountPerm(r.Context(), u, id, "ads.manage")
		t["merchantControls"] = controls
		targets = append(targets, t)
	}
	selectedControls := map[string]any{}
	if selected > 0 {
		if m, ok := merBy[fmt.Sprint(selected)].(map[string]any); ok {
			selectedControls = m
		}
	}
	writeJSON(w, 200, map[string]any{"items": items, "credentialOptions": opts, "selectedCredentialId": selected, "credentialConfigured": selected > 0, "liveMode": true, "paymentMethodsByCredential": pmBy, "genericPaymentMethodsByCredential": genericBy, "paymentMethods": pmBy[fmt.Sprint(selected)], "merchantControlsByCredential": merBy, "merchantControlTargets": targets, "merchantControls": selectedControls, "assets": mapKeys(assets), "fiats": mapKeys(fiats), "autoSyncRows": 20, "capability": map[string]any{"canManage": selected > 0 && s.accountPerm(r.Context(), u, selected, "ads.manage"), "credentialId": selected}, "apiCreateReadiness": map[string]any{"permission": map[string]any{"tradeEnabled": true}, "tradingStatus": map[string]any{"locked": false}, "accountStatus": map[string]any{"normal": true}}})
}
func mapKeys(m map[string]bool) []string {
	out := []string{}
	for k := range m {
		if k != "" {
			out = append(out, k)
		}
	}
	return out
}
func (s *Server) adPaymentMethods(ctx context.Context, u ctxUser, cid int64) []map[string]any {
	rows, e := s.store.DB.QueryContext(ctx, `SELECT external_pay_id,identifier,name,detail_json,active FROM exchange_payment_methods WHERE tenant_id=`+s.store.Bind(1)+` AND exchange_account_id=`+s.store.Bind(2)+` ORDER BY name`, u.TenantID, cid)
	if e != nil {
		return nil
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id int64
		var ident, name, raw string
		var active bool
		if rows.Scan(&id, &ident, &name, &raw, &active) == nil {
			m := jsonMap(raw)
			m["id"] = id
			m["payId"] = id
			m["credentialId"] = cid
			m["identifier"] = ident
			m["payType"] = ident
			m["tradeMethodName"] = name
			m["name"] = name
			m["enabled"] = active
			m["availableForCredential"] = true
			m["key"] = strings.ToLower(firstNonEmpty(ident, name))
			out = append(out, m)
		}
	}
	return out
}
func (s *Server) adsPaymentOptions(w http.ResponseWriter, r *http.Request, u ctxUser) {
	cid := asInt64(requestString(r, "credentialId"))
	if !s.accountPerm(r.Context(), u, cid, "ads.view") {
		writeJSON(w, 403, envelope{"error": "forbidden"})
		return
	}
	if boolParam(requestString(r, "force")) {
		_, _, _ = s.syncCredentialPaymentMethods(r.Context(), u, cid, false)
	}
	writeJSON(w, 200, map[string]any{"credentialId": cid, "paymentMethods": s.adPaymentMethods(r.Context(), u, cid), "paymentSelectionMode": "saved-payid"})
}
func (s *Server) adsSync(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	cid := mapInt64(in, "credentialId")
	if cid == 0 {
		writeJSON(w, 422, envelope{"error": "credentialId required"})
		return
	}
	if !s.accountPerm(r.Context(), u, cid, "ads.view") {
		writeJSON(w, 403, envelope{"error": "forbidden"})
		return
	}
	c, up, e := s.syncAdsCredential(r.Context(), u, cid, false)
	if e != nil {
		writeJSON(w, 502, envelope{"error": "binance_ads_sync_failed", "message": friendlyBinanceError(e)})
		return
	}
	if mapBool(in, "syncCatalog", "forceCatalog") {
		_, _, _ = s.syncCredentialPaymentMethods(r.Context(), u, cid, false)
	}
	writeJSON(w, 200, map[string]any{"ok": true, "created": c, "updated": up})
}
func (s *Server) syncAdsCredential(ctx context.Context, u ctxUser, cid int64, background bool) (int, int, error) {
	cred, e := s.svc.Credential(ctx, u.TenantID, cid)
	if e != nil {
		return 0, 0, e
	}
	const rowsPerPage = 20
	maxPages := s.cfg.BinanceSyncMaxPages
	if maxPages < 1 {
		maxPages = 1
	}
	created, updated, seen := 0, 0, 0
	for page := 1; page <= maxPages; page++ {
		res, callErr := s.svc.Binance.Call(ctx, s.svc.BinanceCredential(cred), "listAds", nil, map[string]any{"page": page, "rows": rowsPerPage}, background)
		s.updateUsage(ctx, u.TenantID, "api_requests", 1)
		if callErr != nil {
			return created, updated, callErr
		}
		items := responseDataSlice(res)
		seen += len(items)
		for _, v := range items {
			m, ok := v.(map[string]any)
			if !ok {
				continue
			}
			ins, changed, e := s.upsertAd(ctx, u, cid, m)
			if e != nil {
				return created, updated, e
			}
			if ins {
				created++
			} else if changed {
				updated++
			}
		}
		if len(items) < rowsPerPage {
			break
		}
	}
	if created+updated > 0 {
		s.svc.Publish(ctx, events.Event{TenantID: u.TenantID, Type: "ads.synced", Data: map[string]any{"credentialId": cid, "count": seen, "created": created, "updated": updated}})
	}
	return created, updated, nil
}
func (s *Server) upsertAd(ctx context.Context, u ctxUser, cid int64, m map[string]any) (bool, bool, error) {
	no := mapString(m, "advNo", "adNo")
	if no == "" {
		return false, false, nil
	}
	status := normalizeAdStatus(firstMapValue(m, "advStatus", "status"))
	trade := strings.ToUpper(mapString(m, "tradeType"))
	asset := mapString(m, "asset")
	fiat := mapString(m, "fiatUnit", "fiat")
	price := mapFloat(m, "price")
	sur := mapFloat(m, "surplusAmount", "tradableQuantity", "initAmount")
	raw := rawJSON(m)
	sourceHash := hashToken(raw)
	if s.store.Driver == "postgres" {
		var ins bool
		err := s.store.DB.QueryRowContext(ctx, `INSERT INTO advertisements(tenant_id,exchange_account_id,external_adv_no,status,trade_type,asset,fiat,price,surplus_amount,raw_json,source_hash,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,exchange_account_id,external_adv_no) DO UPDATE SET status=EXCLUDED.status,trade_type=EXCLUDED.trade_type,asset=EXCLUDED.asset,fiat=EXCLUDED.fiat,price=EXCLUDED.price,surplus_amount=EXCLUDED.surplus_amount,raw_json=EXCLUDED.raw_json,source_hash=EXCLUDED.source_hash,updated_at=CURRENT_TIMESTAMP WHERE advertisements.source_hash IS DISTINCT FROM EXCLUDED.source_hash RETURNING (xmax=0)`, u.TenantID, cid, no, status, trade, asset, fiat, price, sur, raw, sourceHash).Scan(&ins)
		if err == sql.ErrNoRows {
			return false, false, nil
		}
		return ins, err == nil, err
	}
	var existingHash string
	err := s.store.DB.QueryRowContext(ctx, `SELECT source_hash FROM advertisements WHERE tenant_id=? AND exchange_account_id=? AND external_adv_no=?`, u.TenantID, cid, no).Scan(&existingHash)
	exists := err == nil
	if err != nil && err != sql.ErrNoRows {
		return false, false, err
	}
	if exists && existingHash == sourceHash {
		return false, false, nil
	}
	_, err = s.store.DB.ExecContext(ctx, `INSERT INTO advertisements(tenant_id,exchange_account_id,external_adv_no,status,trade_type,asset,fiat,price,surplus_amount,raw_json,source_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE status=VALUES(status),trade_type=VALUES(trade_type),asset=VALUES(asset),fiat=VALUES(fiat),price=VALUES(price),surplus_amount=VALUES(surplus_amount),raw_json=VALUES(raw_json),source_hash=VALUES(source_hash),updated_at=CURRENT_TIMESTAMP`, u.TenantID, cid, no, status, trade, asset, fiat, price, sur, raw, sourceHash)
	return !exists, err == nil, err
}

func allowedAdPayload(in map[string]any, update bool, advNo string) map[string]any {
	keys := []string{"asset", "authType", "autoReplyMsg", "buyerBtcPositionLimit", "buyerKycLimit", "buyerRegDaysLimit", "classify", "code", "emailVerifyCode", "fiatUnit", "googleVerifyCode", "initAmount", "maxSingleTransAmount", "minSingleTransAmount", "mobileVerifyCode", "onlineDelayTime", "onlineNow", "payTimeLimit", "price", "priceFloatingRatio", "priceType", "rateFloatingRatio", "remarks", "saveAsTemplate", "takerAdditionalKycRequired", "templateName", "tradeMethods", "tradeType", "userAllTradeCountMax", "userAllTradeCountMin", "userBuyTradeCountMax", "userBuyTradeCountMin", "userSellTradeCountMax", "userSellTradeCountMin", "userTradeCompleteCountMin", "userTradeCompleteRateFilterTime", "userTradeCompleteRateMin", "userTradeCountFilterTime", "userTradeType", "userTradeVolumeAsset", "userTradeVolumeFilterTime", "userTradeVolumeMax", "userTradeVolumeMin", "yubikeyVerifyCode", "updateMode", "advStatus"}
	out := map[string]any{}
	for _, k := range keys {
		if v, ok := in[k]; ok && v != "" {
			out[k] = v
		}
	}
	if v, ok := in["additionalKyc"]; ok {
		if mapBool(map[string]any{"v": v}, "v") {
			out["takerAdditionalKycRequired"] = 1
		}
	}
	if update {
		out["advNo"] = advNo
	}
	return out
}
func (s *Server) adCreate(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	cid := mapInt64(in, "credentialId")
	if !s.accountPerm(r.Context(), u, cid, "ads.manage") {
		writeJSON(w, 403, envelope{"error": "forbidden"})
		return
	}
	cred, e := s.svc.Credential(r.Context(), u.TenantID, cid)
	if e != nil {
		replyDBError(w, e)
		return
	}
	payload := allowedAdPayload(in, false, "")
	if methods := s.resolveAdTradeMethods(r.Context(), u, cid, in); len(methods) > 0 {
		payload["tradeMethods"] = methods
	}
	res, e := s.svc.Binance.Call(r.Context(), s.svc.BinanceCredential(cred), "postAd", nil, payload, false)
	s.updateUsage(r.Context(), u.TenantID, "api_requests", 1)
	if e != nil {
		writeJSON(w, 502, envelope{"error": "binance_ad_create_failed", "message": friendlyBinanceError(e), "warning": "Advertisement was not published."})
		return
	}
	advNo := strings.TrimSpace(fmt.Sprint(binance.Data(res)))
	if m, ok := binance.Data(res).(map[string]any); ok {
		advNo = mapString(m, "advNo", "data")
	}
	if advNo == "" || advNo == "<nil>" {
		advNo = fmt.Sprintf("PENDING-%d", time.Now().UnixMilli())
	}
	in["advNo"] = advNo
	in["advStatus"] = 3
	_, _, _ = s.upsertAd(r.Context(), u, cid, in)
	_, _, _ = s.syncAdsCredential(r.Context(), u, cid, false)
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "ad_created", "advertisement", advNo, r, map[string]any{"credentialId": cid})
	writeJSON(w, 201, map[string]any{"ok": true, "published": true, "advNo": advNo})
}
func (s *Server) resolveAdTradeMethods(ctx context.Context, u ctxUser, cid int64, in map[string]any) []map[string]any {
	var out []map[string]any
	if arr, ok := in["tradeMethods"].([]any); ok {
		for _, v := range arr {
			if m, ok := v.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	}
	ids := extractIntArray(in["paymentPayIds"])
	keys := extractStringArray(in["paymentMethodKeys"])
	for _, id := range ids {
		var ident string
		_ = s.store.DB.QueryRowContext(ctx, `SELECT identifier FROM exchange_payment_methods WHERE exchange_account_id=`+s.store.Bind(1)+` AND external_pay_id=`+s.store.Bind(2), cid, id).Scan(&ident)
		out = append(out, map[string]any{"identifier": ident, "payId": id, "payType": ident})
	}
	for _, k := range keys {
		out = append(out, map[string]any{"identifier": k, "payId": 0, "payType": k})
	}
	return out
}
func extractIntArray(v any) []int64 {
	var out []int64
	if a, ok := v.([]any); ok {
		for _, x := range a {
			if n := asInt64(x); n > 0 {
				out = append(out, n)
			}
		}
	}
	return out
}
func extractStringArray(v any) []string {
	var out []string
	if a, ok := v.([]any); ok {
		for _, x := range a {
			if s := strings.TrimSpace(asString(x)); s != "" {
				out = append(out, s)
			}
		}
	}
	return out
}
func (s *Server) adPatch(w http.ResponseWriter, r *http.Request, u ctxUser) {
	a, e := s.getAd(r.Context(), u, parseID(r.PathValue("id")), "ads.manage")
	if e != nil {
		replyDBError(w, e)
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	cred, _ := s.svc.Credential(r.Context(), u.TenantID, a.AccountID)
	payload := allowedAdPayload(in, true, a.AdvNo)
	if methods := s.resolveAdTradeMethods(r.Context(), u, a.AccountID, in); len(methods) > 0 {
		payload["tradeMethods"] = methods
	}
	_, e = s.svc.Binance.Call(r.Context(), s.svc.BinanceCredential(cred), "updateAd", nil, payload, false)
	if e != nil {
		writeJSON(w, 502, envelope{"error": "binance_ad_update_failed", "message": friendlyBinanceError(e)})
		return
	}
	_, _, _ = s.syncAdsCredential(r.Context(), u, a.AccountID, false)
	a, _ = s.getAd(r.Context(), u, a.ID, "ads.view")
	writeJSON(w, 200, s.adMap(a))
}
func (s *Server) adPublish(w http.ResponseWriter, r *http.Request, u ctxUser) {
	a, e := s.getAd(r.Context(), u, parseID(r.PathValue("id")), "ads.manage")
	if e != nil {
		replyDBError(w, e)
		return
	}
	cred, _ := s.svc.Credential(r.Context(), u.TenantID, a.AccountID)
	_, e = s.svc.Binance.Call(r.Context(), s.svc.BinanceCredential(cred), "updateAdsStatus", nil, map[string]any{"advNos": []string{a.AdvNo}, "advStatus": 1}, false)
	if e != nil {
		writeJSON(w, 502, envelope{"error": "binance_ad_publish_failed", "message": friendlyBinanceError(e)})
		return
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE advertisements SET status='online',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), a.ID)
	a, _ = s.getAd(r.Context(), u, a.ID, "ads.view")
	writeJSON(w, 200, map[string]any{"ok": true, "published": true, "item": s.adMap(a)})
}
func (s *Server) adStatus(w http.ResponseWriter, r *http.Request, u ctxUser) {
	a, e := s.getAd(r.Context(), u, parseID(r.PathValue("id")), "ads.manage")
	if e != nil {
		replyDBError(w, e)
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	online := mapBool(in, "online", "enabled")
	if v, ok := in["status"]; ok {
		online = strings.ToLower(asString(v)) == "online"
	}
	code := 3
	if online {
		code = 1
	}
	cred, _ := s.svc.Credential(r.Context(), u.TenantID, a.AccountID)
	_, e = s.svc.Binance.Call(r.Context(), s.svc.BinanceCredential(cred), "updateAdsStatus", nil, map[string]any{"advNos": []string{a.AdvNo}, "advStatus": code}, false)
	if e != nil {
		writeJSON(w, 502, envelope{"error": "binance_ad_status_failed", "message": friendlyBinanceError(e)})
		return
	}
	st := "offline"
	if online {
		st = "online"
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE advertisements SET status=`+s.store.Bind(1)+`,updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(2), st, a.ID)
	a, _ = s.getAd(r.Context(), u, a.ID, "ads.view")
	writeJSON(w, 200, s.adMap(a))
}
func (s *Server) adDelete(w http.ResponseWriter, r *http.Request, u ctxUser) {
	a, e := s.getAd(r.Context(), u, parseID(r.PathValue("id")), "ads.manage")
	if e != nil {
		replyDBError(w, e)
		return
	}
	cred, _ := s.svc.Credential(r.Context(), u.TenantID, a.AccountID)
	_, e = s.svc.Binance.Call(r.Context(), s.svc.BinanceCredential(cred), "updateAdsStatus", nil, map[string]any{"advNos": []string{a.AdvNo}, "advStatus": 4}, false)
	if e != nil {
		writeJSON(w, 502, envelope{"error": "binance_ad_close_failed", "message": friendlyBinanceError(e)})
		return
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE advertisements SET status='closed',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), a.ID)
	writeJSON(w, 200, map[string]any{"ok": true, "closed": true})
}

func (s *Server) merchantControlSnapshot(ctx context.Context, u ctxUser, cid int64, live bool) map[string]any {
	stored := s.jsonSetting(ctx, "credential", cid, "merchant_controls")
	if !live && len(stored) > 0 {
		return stored
	}
	cred, e := s.svc.Credential(ctx, u.TenantID, cid)
	if e != nil {
		return map[string]any{"syncError": e.Error()}
	}
	res, e := s.svc.Binance.Call(ctx, s.svc.BinanceCredential(cred), "getMerchantAdDetails", nil, nil, false)
	if e != nil {
		return mergeMaps(stored, map[string]any{"syncError": e.Error()})
	}
	d := responseDataMap(res)
	online := mapBool(d, "online", "onlineStatus")
	business := !mapBool(d, "businessClosed", "closedBusiness")
	breakOn := mapBool(d, "rest", "breakStatus", "isRest")
	m := map[string]any{"online": map[string]any{"enabled": online, "status": boolState(online)}, "business": map[string]any{"enabled": business, "status": boolState(business)}, "break": map[string]any{"enabled": breakOn, "status": boolState(breakOn)}, "mode": map[string]any{"id": func() string {
		if !business {
			return "business_closed"
		}
		if breakOn {
			return "break"
		}
		return "business"
	}()}, "raw": d}
	_ = s.svc.SetSetting(ctx, "credential", cid, "merchant_controls", m)
	return m
}
func boolState(v bool) string {
	if v {
		return "on"
	}
	return "off"
}
func (s *Server) adsMerchantStatus(w http.ResponseWriter, r *http.Request, u ctxUser) {
	cid := asInt64(requestString(r, "credentialId"))
	if !s.accountPerm(r.Context(), u, cid, "ads.view") {
		writeJSON(w, 403, envelope{"error": "forbidden"})
		return
	}
	writeJSON(w, 200, s.merchantControlSnapshot(r.Context(), u, cid, true))
}
func (s *Server) adsMerchantControl(w http.ResponseWriter, r *http.Request, u ctxUser) {
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	cid := mapInt64(in, "credentialId")
	control := strings.ToLower(mapString(in, "control", "action"))
	enabled := mapBool(in, "enabled")
	ids := []int64{}
	if cid > 0 {
		ids = []int64{cid}
	} else {
		for _, o := range s.credentialOptions(r.Context(), u) {
			id := asInt64(o["id"])
			if s.accountPerm(r.Context(), u, id, "ads.manage") {
				ids = append(ids, id)
			}
		}
	}
	success, fail := 0, 0
	var results []map[string]any
	for _, id := range ids {
		cred, e := s.svc.Credential(r.Context(), u.TenantID, id)
		if e == nil {
			ep := ""
			switch control {
			case "online":
				if enabled {
					ep = "setMerchantOnline"
				} else {
					ep = "setMerchantOffline"
				}
			case "business":
				if enabled {
					ep = "startMerchantBusiness"
				} else {
					ep = "closeMerchantBusiness"
				}
			case "break", "rest":
				if enabled {
					ep = "startMerchantRest"
				} else {
					ep = "endMerchantRest"
				}
			}
			if ep == "" {
				e = fmt.Errorf("unknown merchant control")
			} else {
				_, e = s.svc.Binance.Call(r.Context(), s.svc.BinanceCredential(cred), ep, nil, nil, false)
			}
		}
		if e != nil {
			fail++
			results = append(results, map[string]any{"credentialId": id, "ok": false, "error": e.Error()})
		} else {
			success++
			snap := s.merchantControlSnapshot(r.Context(), u, id, true)
			results = append(results, map[string]any{"credentialId": id, "ok": true, "merchantControls": snap})
		}
	}
	writeJSON(w, 200, map[string]any{"ok": fail == 0, "batch": len(ids) > 1, "targetCount": len(ids), "successCount": success, "failureCount": fail, "results": results})
}
func (s *Server) adsReferencePrice(w http.ResponseWriter, r *http.Request, u ctxUser) {
	cid := asInt64(requestString(r, "credentialId"))
	if !s.accountPerm(r.Context(), u, cid, "ads.view") {
		writeJSON(w, 403, envelope{"error": "forbidden"})
		return
	}
	cred, e := s.svc.Credential(r.Context(), u.TenantID, cid)
	if e != nil {
		replyDBError(w, e)
		return
	}
	body := map[string]any{"assets": []string{strings.ToUpper(requestString(r, "asset"))}, "fiatCurrency": strings.ToUpper(requestString(r, "fiat")), "tradeType": strings.ToUpper(requestString(r, "tradeType"))}
	if p := requestString(r, "payType"); p != "" {
		body["payType"] = p
	}
	res, e := s.svc.Binance.Call(r.Context(), s.svc.BinanceCredential(cred), "getAdReferencePrice", nil, body, false)
	if e != nil {
		writeJSON(w, 502, envelope{"error": "binance_reference_price_failed", "message": friendlyBinanceError(e)})
		return
	}
	writeJSON(w, 200, map[string]any{"credentialId": cid, "data": binance.Data(res), "referencePrice": findNumericDeep(binance.Data(res), "price", "referencePrice")})
}
func findNumericDeep(v any, keys ...string) float64 {
	set := map[string]bool{}
	for _, k := range keys {
		set[strings.ToLower(k)] = true
	}
	var walk func(any) float64
	walk = func(x any) float64 {
		switch m := x.(type) {
		case map[string]any:
			for k, v := range m {
				if set[strings.ToLower(k)] {
					if n := asFloat(v); n != 0 {
						return n
					}
				}
			}
			for _, v := range m {
				if n := walk(v); n != 0 {
					return n
				}
			}
		case []any:
			for _, v := range m {
				if n := walk(v); n != 0 {
					return n
				}
			}
		}
		return 0
	}
	return walk(v)
}
func (s *Server) adsFeeRates(w http.ResponseWriter, r *http.Request, u ctxUser) {
	cid := asInt64(requestString(r, "credentialId"))
	if !s.accountPerm(r.Context(), u, cid, "ads.view") {
		writeJSON(w, 403, envelope{"error": "forbidden"})
		return
	}
	cred, e := s.svc.Credential(r.Context(), u.TenantID, cid)
	if e != nil {
		replyDBError(w, e)
		return
	}
	overview, e1 := s.svc.Binance.Call(r.Context(), s.svc.BinanceCredential(cred), "getCommissionOverview", nil, map[string]any{"fiat": strings.ToUpper(requestString(r, "fiat"))}, false)
	taker, e2 := s.svc.Binance.Call(r.Context(), s.svc.BinanceCredential(cred), "getTakerCommissionRate", nil, map[string]any{"asset": strings.ToUpper(requestString(r, "asset")), "fiat": strings.ToUpper(requestString(r, "fiat")), "tradeType": strings.ToUpper(requestString(r, "tradeType"))}, false)
	if e1 != nil && e2 != nil {
		writeJSON(w, 502, envelope{"error": "binance_fee_failed", "message": e1.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"overview": func() any {
		if overview == nil {
			return nil
		}
		return binance.Data(overview)
	}(), "taker": func() any {
		if taker == nil {
			return nil
		}
		return binance.Data(taker)
	}()})
}
func (s *Server) adsAssetBalance(w http.ResponseWriter, r *http.Request, u ctxUser) {
	cid := asInt64(requestString(r, "credentialId"))
	if !s.accountPerm(r.Context(), u, cid, "ads.view") {
		writeJSON(w, 403, envelope{"error": "forbidden"})
		return
	}
	asset := strings.ToUpper(requestString(r, "asset"))
	var sum float64
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT COALESCE(SUM(surplus_amount),0) FROM advertisements WHERE tenant_id=`+s.store.Bind(1)+` AND exchange_account_id=`+s.store.Bind(2)+` AND asset=`+s.store.Bind(3)+` AND status<>'closed'`, u.TenantID, cid, asset).Scan(&sum)
	writeJSON(w, 200, map[string]any{"credentialId": cid, "asset": asset, "available": sum, "source": "local-ad-snapshot", "notice": "Funding-wallet balance endpoint is not part of the supplied C2C contract; showing synchronized advertisement availability instead."})
}
