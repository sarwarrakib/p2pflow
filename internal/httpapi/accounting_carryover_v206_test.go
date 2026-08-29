package httpapi

import (
	"math"
	"testing"
)

func closeEnoughV206(a, b, tolerance float64) bool { return math.Abs(a-b) <= tolerance }

func TestAccountingCarryoverV206LocksOriginProfitAndPostsSettlementVariance(t *testing.T) {
	firstBuyNet := 493.4653465346535
	provisionalFiat := 51850.0
	provisionalNet := 511.7235643564357
	dayOneOperational := firstBuyNet + provisionalNet - 1000
	lot := &accountingCarryoverLotState{
		ID: 1, BusinessDate: "2026-08-03", Asset: "USDT",
		SellFiat: 101850, SoldAsset: 1000,
		InitialCarryoverFiat: provisionalFiat, InitialProvisionalNetAsset: provisionalNet,
		ProvisionalYield: provisionalNet / provisionalFiat, OperationalProfit: dayOneOperational,
	}
	actualDayTwoNet := 509.2027586206897
	allocations := allocateAccountingCarryoverFIFO([]*accountingCarryoverLotState{lot}, []accountingCarryoverBuyState{{
		OrderID: 12, OrderNo: "BUY-D2-CARRY", BusinessDate: "2026-08-04", Asset: "USDT",
		Fiat: provisionalFiat, NetAsset: actualDayTwoNet,
	}})
	if len(allocations) != 1 {
		t.Fatalf("expected one carryover settlement, got %d", len(allocations))
	}
	expectedAdjustment := actualDayTwoNet - provisionalNet
	if !closeEnoughV206(lot.OperationalProfit, dayOneOperational, 0.00000003) {
		t.Fatalf("locked day-one operational profit changed: got %.12f want %.12f", lot.OperationalProfit, dayOneOperational)
	}
	if !closeEnoughV206(allocations[0].AdjustmentAsset, expectedAdjustment, 0.00000003) {
		t.Fatalf("settlement-day adjustment mismatch: got %.12f want %.12f", allocations[0].AdjustmentAsset, expectedAdjustment)
	}
	if allocations[0].AdjustmentAsset >= 0 {
		t.Fatalf("expected the slower day-two replacement to post a negative settlement adjustment")
	}
	if !closeEnoughV206(lot.OperationalProfit+allocations[0].AdjustmentAsset, dayOneOperational+expectedAdjustment, 0.00000005) {
		t.Fatal("final adjusted profit does not equal locked operational profit plus settlement-day variance")
	}
	if lot.OutstandingFiat > accountingCarryoverEpsilon {
		t.Fatalf("carryover lot should be fully settled, outstanding %.12f", lot.OutstandingFiat)
	}
}

func TestAccountingCarryoverV206FIFOAcrossLots(t *testing.T) {
	lots := []*accountingCarryoverLotState{
		{ID: 1, BusinessDate: "2026-08-01", Asset: "USDT", InitialCarryoverFiat: 100, ProvisionalYield: 0.01},
		{ID: 2, BusinessDate: "2026-08-02", Asset: "USDT", InitialCarryoverFiat: 80, ProvisionalYield: 0.01},
	}
	allocations := allocateAccountingCarryoverFIFO(lots, []accountingCarryoverBuyState{{OrderID: 9, BusinessDate: "2026-08-03", Asset: "USDT", Fiat: 150, NetAsset: 1.5}})
	if len(allocations) != 2 {
		t.Fatalf("expected one BUY to settle two FIFO lots, got %d allocations", len(allocations))
	}
	if allocations[0].LotID != 1 || !closeEnoughV206(allocations[0].AllocatedFiat, 100, 1e-9) {
		t.Fatalf("oldest lot was not settled first: %#v", allocations[0])
	}
	if allocations[1].LotID != 2 || !closeEnoughV206(allocations[1].AllocatedFiat, 50, 1e-9) {
		t.Fatalf("remaining BUY amount was not applied to second lot: %#v", allocations[1])
	}
	if !closeEnoughV206(lots[1].OutstandingFiat, 30, 1e-9) {
		t.Fatalf("second lot outstanding mismatch: %.12f", lots[1].OutstandingFiat)
	}
}

func TestAccountingCarryoverV206NeverUsesSameDayBuyAsSettlement(t *testing.T) {
	lot := &accountingCarryoverLotState{ID: 1, BusinessDate: "2026-08-03", Asset: "USDT", InitialCarryoverFiat: 100, ProvisionalYield: 0.01}
	allocations := allocateAccountingCarryoverFIFO([]*accountingCarryoverLotState{lot}, []accountingCarryoverBuyState{{OrderID: 2, BusinessDate: "2026-08-03", Asset: "USDT", Fiat: 100, NetAsset: 1}})
	if len(allocations) != 0 {
		t.Fatalf("same-day BUY belongs to the close-time operational calculation, not carryover settlement")
	}
	if !closeEnoughV206(lot.OutstandingFiat, 100, 1e-9) {
		t.Fatalf("same-day BUY mutated carryover lot: %.12f", lot.OutstandingFiat)
	}
}
