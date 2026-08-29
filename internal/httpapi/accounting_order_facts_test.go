package httpapi

import "testing"

func TestAccountingOrderAssetFacts(t *testing.T) {
	tests := []struct {
		name, trade       string
		gross             float64
		raw               map[string]any
		wantMove, wantFee float64
	}{
		{"buy taker net", "BUY", 100, map[string]any{"takerAmount": 99.8, "takerCommission": 0.2}, 99.8, 0.2},
		{"sell taker outflow", "SELL", 100, map[string]any{"takerAmount": 100.2, "takerCommission": 0.2}, 100.2, 0.2},
		{"buy fee fallback", "BUY", 100, map[string]any{"commission": 0.15}, 99.85, 0.15},
		{"sell fee fallback", "SELL", 100, map[string]any{"commission": 0.15}, 100.15, 0.15},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m, f := accountingOrderAssetFacts(tc.trade, tc.gross, tc.raw)
			if absTest(m-tc.wantMove) > 1e-9 || absTest(f-tc.wantFee) > 1e-9 {
				t.Fatalf("move=%v fee=%v want %v/%v", m, f, tc.wantMove, tc.wantFee)
			}
		})
	}
}
func TestAccountingReplacement(t *testing.T) {
	a := accountingAgg{BuyFiat: 800, BuyNet: 8, SellFiat: 1000, SellOut: 9.5}
	actualFiat, actualNet, outstanding, estimated, profit := a.replacement(0.01)
	if actualFiat != 800 || actualNet != 8 || outstanding != 200 || estimated != 2 || profit != 0.5 {
		t.Fatalf("unexpected replacement facts %v %v %v %v %v", actualFiat, actualNet, outstanding, estimated, profit)
	}
}
func absTest(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}
