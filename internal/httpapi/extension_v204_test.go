package httpapi

import (
	"testing"

	"p2pflow/v2/internal/config"
)

func TestExtensionTenantTokensAreIsolated(t *testing.T) {
	s := &Server{cfg: config.Config{AppSecret: "0123456789abcdef0123456789abcdef"}}
	a := s.extensionTenantToken(11)
	b := s.extensionTenantToken(12)
	if a == "" || b == "" || a == b {
		t.Fatalf("tenant tokens are not isolated: %q %q", a, b)
	}
	if want := s.extensionTenantToken(11); want != a {
		t.Fatalf("tenant token is not stable: %q != %q", want, a)
	}
}

func TestExtensionCollectorFlatMapsFeedbackAndTradeMetrics(t *testing.T) {
	data := map[string]any{
		"profile": map[string]any{
			"name": "Seller One", "followersCount": 12.0, "followingCount": 3.0, "adsCount": 4.0,
			"tradeInfo":       map[string]any{"allTrades": 420.0, "buyTrades": 120.0, "sellTrades": 300.0, "trades30d": 88.0, "completionRate30d": 98.5},
			"feedbackSummary": map[string]any{"positive": 31.0, "negative": 2.0, "reviews": 33.0, "positivePercent": 93.94},
		},
		"feedback": map[string]any{
			"negativeFirstPage": []any{map[string]any{"reviewer": "A", "comment": "slow", "date": "2026-01-01"}},
			"positiveFirstPage": []any{map[string]any{"reviewer": "B", "comment": "good", "date": "2026-01-02"}},
		},
		"meta": map[string]any{"collectedAt": "2026-01-03T00:00:00Z"},
	}
	flat := extensionCollectorFlat(data, map[string]any{"counterpartyName": "Fallback"}, "12345")
	if mapString(flat, "userNo") != "12345" || mapString(flat, "advertiserName") != "Seller One" {
		t.Fatalf("identity mapping failed: %#v", flat)
	}
	if len(extractSlice(flat["feedbackComments"])) != 2 {
		t.Fatalf("feedback rows were not flattened: %#v", flat["feedbackComments"])
	}
	if mapString(flat, "lastFeedbackSource") != "chrome_extension_dom" {
		t.Fatalf("source marker missing: %#v", flat)
	}
}
