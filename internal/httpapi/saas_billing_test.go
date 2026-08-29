package httpapi

import (
	"testing"

	"p2pflow/v2/internal/config"
)

func TestFeatureForPermission(t *testing.T) {
	cases := map[string]string{
		"orders.release":       "orders",
		"ads.manage":           "ads",
		"binance.chat":         "chat",
		"credentials.manage":   "api_credentials",
		"accounts.manage_all":  "payment_accounts",
		"ledger.adjust":        "payment_accounts",
		"accounting.reopen":    "accounting",
		"approvals.manage":     "approvals",
		"extension.manage":     "extension",
		"market.view":          "market",
		"system.update.manage": "system_update",
	}
	for permission, want := range cases {
		if got := featureForPermission(permission); got != want {
			t.Fatalf("featureForPermission(%q)=%q want %q", permission, got, want)
		}
	}
}

func TestEntitlementBool(t *testing.T) {
	ent := map[string]any{"orders": true, "ads": false, "chat": "yes", "reports": float64(1)}
	if !entitlementBool(ent, "orders", false) || entitlementBool(ent, "ads", true) || !entitlementBool(ent, "chat", false) || !entitlementBool(ent, "reports", false) {
		t.Fatalf("entitlement coercion mismatch: %#v", ent)
	}
	if !entitlementBool(ent, "missing", true) || entitlementBool(ent, "missing", false) {
		t.Fatal("missing entitlement must respect default")
	}
}

func TestHMACDeterministic(t *testing.T) {
	got := hmacHex("secret", "payload")
	want := "b82fcb791acec57859b989b430a826488ce2e479fdf92326bd0a2e8375a42ba4"
	if got != want {
		t.Fatalf("hmac=%s want %s", got, want)
	}
	if hmacHex("", "payload") != "" {
		t.Fatal("empty secret must produce no signature")
	}
}

func TestGenericCheckoutURLRequiresHTTPSInProduction(t *testing.T) {
	s := &Server{cfg: config.Config{Env: "production", BillingCheckoutURL: "http://billing.example/checkout", BillingWebhookSecret: "secret", PublicBaseURL: "https://app.example"}}
	if _, err := s.genericCheckoutURL("c1", 2, 3, 10, "BDT"); err == nil {
		t.Fatal("production checkout URL must require HTTPS")
	}
	s.cfg.BillingCheckoutURL = "https://billing.example/checkout"
	u, err := s.genericCheckoutURL("c1", 2, 3, 10, "BDT")
	if err != nil {
		t.Fatal(err)
	}
	if u == "" {
		t.Fatal("checkout URL missing")
	}
}
