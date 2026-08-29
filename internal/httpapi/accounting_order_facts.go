package httpapi

import "strings"

// accountingOrderAssetFacts normalizes the actual crypto movement exposed by the
// Binance order payload into a reportable fact. For BUY, takerAmount is the net
// received amount when Binance supplies it. For SELL, takerAmount is the actual
// deducted amount. Older/maker payloads fall back to gross amount +/- reported fee.
func accountingOrderAssetFacts(trade string, gross float64, raw map[string]any) (movement, fee float64) {
	if gross < 0 {
		gross = -gross
	}
	commission := 0.0
	for _, key := range []string{"takerCommission", "commission", "makerCommission", "fee", "feeAmount"} {
		if v := mapFloat(raw, key); v > commission {
			commission = v
		}
	}
	taker := mapFloat(raw, "takerAmount")
	if taker < 0 {
		taker = -taker
	}
	switch strings.ToUpper(strings.TrimSpace(trade)) {
	case "BUY":
		if taker > 0 {
			movement = taker
			if gross > taker {
				fee = gross - taker
			}
		} else {
			fee = commission
			movement = gross - fee
			if movement < 0 {
				movement = 0
			}
		}
	case "SELL":
		if taker > 0 {
			movement = taker
			if taker > gross {
				fee = taker - gross
			}
		} else {
			fee = commission
			movement = gross + fee
		}
	default:
		movement = gross
		fee = commission
	}
	if commission > fee {
		fee = commission
	}
	return movement, fee
}
