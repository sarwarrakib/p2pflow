package httpapi

import "strings"

var accountScopedPermissionCodes = []string{
	"orders.view", "orders.create", "orders.manage", "orders.assign", "orders.split", "orders.final_action", "orders.quick_release",
	"binance.sync", "binance.chat",
	"ads.view", "ads.manage",
	"p2p.profile.view", "p2p.profile.sync",
}

func accountScopedPermissionSet() map[string]bool {
	out := make(map[string]bool, len(accountScopedPermissionCodes))
	for _, code := range accountScopedPermissionCodes {
		out[code] = true
	}
	return out
}

func isAccountScopedPermission(code string) bool {
	return accountScopedPermissionSet()[strings.TrimSpace(code)]
}

func accountPermissionGroups() []map[string]any {
	return []map[string]any{
		{"id": "orders", "label": "Orders", "permissions": []string{"orders.view", "orders.create", "orders.manage", "orders.assign", "orders.split", "orders.final_action", "orders.quick_release"}},
		{"id": "sync_chat", "label": "Sync & Chat", "permissions": []string{"binance.sync", "binance.chat"}},
		{"id": "ads", "label": "Advertisements", "permissions": []string{"ads.view", "ads.manage"}},
		{"id": "profile", "label": "P2P Profile", "permissions": []string{"p2p.profile.view", "p2p.profile.sync"}},
	}
}
